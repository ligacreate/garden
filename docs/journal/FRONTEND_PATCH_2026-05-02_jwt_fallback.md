---
title: Фронт-патч SEC-001 — устранение JWT-fallback и graceful init
type: frontend-patch
version: 1.0
created: 2026-05-02
status: draft (готов к ревью с веб-Claude перед исполнением)
related_docs:
  - docs/MIGRATION_2026-05-02_security_restoration.md
  - docs/REPORT_2026-05-02_db_audit_v5.md
  - docs/REPORT_2026-05-02_code_audit.md
  - plans/BACKLOG.md (SEC-001 этап 4 sub-step)
---

# Фронт-патч SEC-001 — устранение JWT-fallback и graceful init

## Обзор

### Что чиним и почему

Фронт сейчас имеет **две одинаковые «латч-ловушки»**, которые при ошибке JWT-секрета на стороне PostgREST **молча отключают `Authorization` до конца сессии вкладки**:

1. `services/dataService.js:18` — `let postgrestJwtDisabledAfterPgrst300 = false;`
2. `services/pvlPostgrestApi.js:10` — `let pvlJwtDisabledAfterError = false;`

Обе при детекции `PGRST300` / `PGRST302` повторяют запрос **без `Authorization`** и поднимают флаг. Все последующие запросы той же вкладки идут анонимно.

**Угроза.** После SEC-001 (RLS включён, политики на `auth.uid()`) — анонимные запросы вернут пустые массивы. Без латча пользователь увидит «список пуст». С латчем фронт «забывает» прислать токен, и регрессия становится молчаливой: «у меня всё работало вчера, сегодня ничего нет».

**Худший сценарий.** В Этапе 3 SEC-001 (PostgREST на JWT-проверку) при кратковременной рассинхронизации секрета — вся вкладка пользователя на остаток сессии становится анонимной. С новой RLS это превращается в полное отсутствие данных. **Это путь к тихой регрессии безопасности — латчи нужно удалить ДО открытия Caddy в Этапе 5.**

Дополнительно: `App.jsx:init()` использует `Promise.all` (а не `allSettled`) — если хоть один из 4 запросов (`getUsers`, `getKnowledgeBase`, `getLibrarySettings`, `getNews`) упал — упадёт весь `init`, и пользователь увидит белый экран. Чиним: переходим на `Promise.allSettled` + отдельный баннер при `POSTGREST_JWT_MISCONFIG`.

### Объём патчей

1. **Патч 1.** `services/dataService.js` — удалить латч и блок повторного запроса без токена; при детекции PGRST300 — кидать `err.code='POSTGREST_JWT_MISCONFIG'`.
2. **Патч 2.** `services/pvlPostgrestApi.js` — то же самое для PVL-слоя.
3. **Патч 3.** `App.jsx:init()` — `Promise.all → Promise.allSettled`, отдельный баннер при POSTGREST_JWT_MISCONFIG, обработка 401 (чистка токена + setCurrentUser(null)).
4. **Патч 4.** `views/PvlPrototypeApp.jsx` — если есть точки входа, ловящие исключения от `pvlPostgrestApi`, добавить ту же обработку POSTGREST_JWT_MISCONFIG. По grep — отдельных catch-блоков на JWT-ошибки сейчас нет, поэтому точечный fix только если будут найдены при ручной верификации.

### План тестирования (после деплоя)

Расписан в конце документа в разделе «Smoke-тесты после деплоя».

### Backout

`git revert <commit-hash>` для конкретных файлов. Каждый патч — отдельный commit, чтобы можно было откатывать поштучно.

---

## Патч 1 — `services/dataService.js`

### Точные строки до изменения (текущее состояние, читал с диска)

```js
// [11-12]
/** Если true — не передаём JWT в PostgREST (например локальный PostgREST без jwt-secret). */
const POSTGREST_SKIP_JWT = import.meta.env.VITE_POSTGREST_SKIP_JWT === 'true';

// [14-18]
/**
 * После PGRST300 («Server lacks JWT secret») на этой вкладке больше не шлём JWT,
 * чтобы не ломать каждый запрос повторными ошибками.
 */
let postgrestJwtDisabledAfterPgrst300 = false;
```

```js
// [27-35]
const isPostgrestJwtSecretError = (bodyText) => {
    const t = String(bodyText || '');
    if (t.includes('PGRST300') || t.includes('JWT secret')) return true;
    try {
        return JSON.parse(t)?.code === 'PGRST300';
    } catch {
        return false;
    }
};
```

```js
// [37-96] postgrestFetch с латчем
const postgrestFetch = async (path, params = {}, options = {}) => {
    const url = new URL(path, POSTGREST_URL);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

    const buildHeaders = (includeBearer) => {
        const headers = {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(options.headers || {}),
        };
        if (includeBearer && !POSTGREST_SKIP_JWT && !postgrestJwtDisabledAfterPgrst300) {
            const token = getAuthToken();
            if (token) headers.Authorization = `Bearer ${token}`;
        }
        if (options.count) headers.Prefer = 'count=exact';
        if (options.returnRepresentation) headers.Prefer = 'return=representation';
        return headers;
    };

    const tryBearer =
        !POSTGREST_SKIP_JWT && !postgrestJwtDisabledAfterPgrst300 && Boolean(getAuthToken());

    let response = await fetch(url.toString(), {
        method: options.method || 'GET',
        headers: buildHeaders(tryBearer),
        body: options.body ? JSON.stringify(options.body) : undefined
    });

    if (!response.ok) {
        const text = await response.text();
        if (tryBearer && isPostgrestJwtSecretError(text)) {
            postgrestJwtDisabledAfterPgrst300 = true;
            response = await fetch(url.toString(), {
                method: options.method || 'GET',
                headers: buildHeaders(false),
                body: options.body ? JSON.stringify(options.body) : undefined
            });
            if (!response.ok) {
                const text2 = await response.text();
                const err = new Error(text2 || `PostgREST error (${response.status})`);
                err.status = response.status;
                throw err;
            }
        } else {
            const err = new Error(text || `PostgREST error (${response.status})`);
            err.status = response.status;
            throw err;
        }
    }

    const data = await response.json();
    let count;
    if (options.count) {
        const range = response.headers.get('Content-Range');
        const match = range?.match(/\/(\d+)$/);
        if (match) count = Number(match[1]);
    }

    return { data, count };
};
```

### Целевое состояние

#### 1.1. Удалить латч (строки 14-18)

**Удалить блок целиком:**
```js
/**
 * После PGRST300 («Server lacks JWT secret») на этой вкладке больше не шлём JWT,
 * чтобы не ломать каждый запрос повторными ошибками.
 */
let postgrestJwtDisabledAfterPgrst300 = false;
```

#### 1.2. Расширить детектор и переименовать (строки 27-35)

**Заменить блок:**
```js
const isPostgrestJwtSecretError = (bodyText) => {
    const t = String(bodyText || '');
    if (t.includes('PGRST300') || t.includes('JWT secret')) return true;
    try {
        return JSON.parse(t)?.code === 'PGRST300';
    } catch {
        return false;
    }
};
```

**На:**
```js
const isPostgrestJwtMisconfigError = (bodyText) => {
    const t = String(bodyText || '');
    if (t.includes('PGRST300') || t.includes('PGRST302') || t.includes('JWT secret')) return true;
    try {
        const code = JSON.parse(t)?.code || '';
        return code === 'PGRST300' || code === 'PGRST302';
    } catch {
        return false;
    }
};
```

(Расширили до `PGRST302` — для симметрии с `pvlPostgrestApi`.)

#### 1.3. Заменить `postgrestFetch` (строки 37-96)

**Целевое тело:**
```js
const postgrestFetch = async (path, params = {}, options = {}) => {
    const url = new URL(path, POSTGREST_URL);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

    const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options.headers || {}),
    };
    if (!POSTGREST_SKIP_JWT) {
        const token = getAuthToken();
        if (token) headers.Authorization = `Bearer ${token}`;
    }
    if (options.count) headers.Prefer = 'count=exact';
    if (options.returnRepresentation) headers.Prefer = 'return=representation';

    const response = await fetch(url.toString(), {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
        const text = await response.text();
        if (isPostgrestJwtMisconfigError(text)) {
            const err = new Error('PostgREST JWT secret misconfigured');
            err.code = 'POSTGREST_JWT_MISCONFIG';
            err.status = response.status;
            err.detail = text;
            throw err;
        }
        const err = new Error(text || `PostgREST error (${response.status})`);
        err.status = response.status;
        throw err;
    }

    const data = await response.json();
    let count;
    if (options.count) {
        const range = response.headers.get('Content-Range');
        const match = range?.match(/\/(\d+)$/);
        if (match) count = Number(match[1]);
    }

    return { data, count };
};
```

**Что изменилось:**
- Удалён `tryBearer`, `buildHeaders(includeBearer)`, второй `fetch` без токена.
- Удалена ссылка на `postgrestJwtDisabledAfterPgrst300` (переменная не существует).
- Добавлена структурированная ошибка с `err.code='POSTGREST_JWT_MISCONFIG'` при детекции misconfig.

### Замечания к патчу 1

- `POSTGREST_SKIP_JWT` (env-флаг для dev) сохраняется — это правильное dev-only поведение.
- `getAuthToken()` без токена возвращает `''` — header `Authorization` просто не добавляется. Это нормально для анонимных эндпоинтов (после SEC-001 их не остаётся для public, но env-flag обходит).

---

## Патч 2 — `services/pvlPostgrestApi.js`

### Точные строки до изменения

```js
// [6-10]
/**
 * После PGRST300/PGRST302 («Server lacks JWT secret») больше не шлём JWT на этой вкладке,
 * чтобы не ломать каждый запрос повторными ошибками — аналогично dataService.js.
 */
let pvlJwtDisabledAfterError = false;
```

```js
// [24-33]
function isPgrstJwtError(bodyText) {
    const t = String(bodyText || '');
    if (t.includes('PGRST300') || t.includes('PGRST302') || t.includes('JWT secret')) return true;
    try {
        const code = JSON.parse(t)?.code || '';
        return code === 'PGRST300' || code === 'PGRST302';
    } catch {
        return false;
    }
}
```

```js
// [59-71]
function buildHeaders(prefer, withToken) {
    const headers = {
        'Content-Type': 'application/json',
        'Accept-Profile': 'public',
        'Content-Profile': 'public',
    };
    if (withToken) {
        const token = getAuthToken();
        if (token) headers.Authorization = `Bearer ${token}`;
    }
    if (prefer) headers.Prefer = prefer;
    return headers;
}
```

```js
// [73-123] request с латчем
async function request(table, { method = 'GET', params = {}, body, prefer } = {}) {
    if (!isEnabled()) {
        warnMockMode(/* ... */);
        logDb('[PVL DB FALLBACK]', /* ... */);
        throw new Error('PVL DB disabled');
    }
    const url = new URL(`/${table}`, POSTGREST_URL);
    Object.entries(params || {}).forEach(([k, v]) => {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });

    const tryWithToken = !pvlJwtDisabledAfterError && Boolean(getAuthToken());
    let response = await fetch(url.toString(), {
        method,
        headers: buildHeaders(prefer, tryWithToken),
        body: body ? JSON.stringify(body) : undefined,
    });

    /* Если PostgREST не имеет jwt-secret — повторяем запрос без токена */
    if (!response.ok) {
        const text = await response.text().catch(() => '');
        if (tryWithToken && isPgrstJwtError(text)) {
            pvlJwtDisabledAfterError = true;
            response = await fetch(url.toString(), {
                method,
                headers: buildHeaders(prefer, false),
                body: body ? JSON.stringify(body) : undefined,
            });
            if (!response.ok) {
                const text2 = await response.text().catch(() => '');
                logDb('[PVL DB FALLBACK]', { /* ... */ });
                throw new Error(text2 || `PostgREST error (${response.status})`);
            }
        } else {
            logDb('[PVL DB FALLBACK]', { /* ... */ });
            throw new Error(text || `PostgREST error (${response.status})`);
        }
    }
    /* ... остаток функции */
}
```

### Целевое состояние

#### 2.1. Удалить латч (строки 6-10)

**Удалить блок целиком.**

#### 2.2. `buildHeaders` — упростить, убрать `withToken`-аргумент (строки 59-71)

**Заменить блок:**
```js
function buildHeaders(prefer, withToken) {
    const headers = {
        'Content-Type': 'application/json',
        'Accept-Profile': 'public',
        'Content-Profile': 'public',
    };
    if (withToken) {
        const token = getAuthToken();
        if (token) headers.Authorization = `Bearer ${token}`;
    }
    if (prefer) headers.Prefer = prefer;
    return headers;
}
```

**На:**
```js
function buildHeaders(prefer) {
    const headers = {
        'Content-Type': 'application/json',
        'Accept-Profile': 'public',
        'Content-Profile': 'public',
    };
    const token = getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (prefer) headers.Prefer = prefer;
    return headers;
}
```

#### 2.3. `request` — удалить блок повтора, бросать typed error (строки 73-123)

**Целевое тело:**
```js
async function request(table, { method = 'GET', params = {}, body, prefer } = {}) {
    if (!isEnabled()) {
        warnMockMode(!POSTGREST_URL ? 'VITE_POSTGREST_URL is not set.' : 'VITE_USE_LOCAL_DB=true.');
        logDb('[PVL DB FALLBACK]', {
            endpoint: '/' + table,
            status: 'disabled',
            table,
            id: body?.id || null,
            error: 'PVL DB disabled',
        });
        throw new Error('PVL DB disabled');
    }
    const url = new URL(`/${table}`, POSTGREST_URL);
    Object.entries(params || {}).forEach(([k, v]) => {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });

    const response = await fetch(url.toString(), {
        method,
        headers: buildHeaders(prefer),
        body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        if (isPgrstJwtError(text)) {
            const err = new Error('PostgREST JWT secret misconfigured');
            err.code = 'POSTGREST_JWT_MISCONFIG';
            err.status = response.status;
            err.detail = text;
            logDb('[PVL DB FALLBACK]', {
                endpoint: url.toString(),
                status: response.status,
                table,
                id: body?.id || null,
                error: 'POSTGREST_JWT_MISCONFIG',
            });
            throw err;
        }
        logDb('[PVL DB FALLBACK]', {
            endpoint: url.toString(),
            status: response.status,
            table,
            id: body?.id || null,
            error: text,
        });
        throw new Error(text || `PostgREST error (${response.status})`);
    }

    const logTag = method === 'GET' ? '[PVL DB READ]' : '[PVL DB WRITE]';
    logDb(logTag, { endpoint: url.toString(), status: response.status, table, id: body?.id || null, error: null });

    if (response.status === 204) return [];
    return response.json().catch(() => []);
}
```

### Замечания к патчу 2

- Удалили `withToken`-аргумент из `buildHeaders` — теперь токен прикладывается всегда, если он есть в `localStorage`. Это согласовано с общим направлением: «без токена работать не должны после SEC-001».
- `isPgrstJwtError` оставили как есть — он уже корректно определяет PGRST300/PGRST302.

---

## Патч 3 — `App.jsx`

### Точные строки до изменения

```jsx
// [97-133] init useEffect
// Initial Data Fetch
useEffect(() => {
    const init = async () => {
        try {
            const user = await api.getCurrentUser();
            if (!user) {
                setLoading(false);
                return;
            }
            setCurrentUser(user);

            const [allUsers, kb, settings, newsData] = await Promise.all([
                api.getUsers(),
                api.getKnowledgeBase(),
                api.getLibrarySettings(),
                api.getNews(),
            ]);

            setUsers(allUsers || []);
            if (kb && kb.length > 0) setKnowledgeBase(kb);
            if (settings) setLibrarySettings(settings);
            setNews(newsData || []);
        } catch (e) {
            console.error("Init error:", e);
            if (e?.code === 'SUBSCRIPTION_EXPIRED' || e?.code === 'ACCESS_PAUSED_MANUAL') {
                setAccessBlock({
                    code: e.code,
                    message: e.message,
                    botRenewUrl: e.botRenewUrl || null
                });
            }
        } finally {
            setLoading(false);
        }
    };
    init();
}, []);
```

### Целевое состояние

#### 3.1. Добавить state для maintenance-баннера

**Около строки 21 (`const [accessBlock, setAccessBlock] = useState(null);`) добавить:**

```jsx
const [maintenanceBanner, setMaintenanceBanner] = useState(null);
// { reason: 'POSTGREST_JWT_MISCONFIG' | 'PARTIAL_DEGRADATION', detail?: string }
```

#### 3.2. Заменить `init`

**Целевое тело (строки 98-133):**

```jsx
// Initial Data Fetch
useEffect(() => {
    const init = async () => {
        try {
            const user = await api.getCurrentUser();
            if (!user) {
                setLoading(false);
                return;
            }
            setCurrentUser(user);

            // Promise.allSettled — частичная деградация лучше белого экрана.
            const results = await Promise.allSettled([
                api.getUsers(),
                api.getKnowledgeBase(),
                api.getLibrarySettings(),
                api.getNews(),
            ]);

            const [usersR, kbR, settingsR, newsR] = results;

            // Если хоть один запрос упал на POSTGREST_JWT_MISCONFIG — показываем баннер.
            // Это критическая ошибка инфраструктуры, не «неполные данные».
            const jwtMisconfig = results.find(
                (r) => r.status === 'rejected' && r.reason?.code === 'POSTGREST_JWT_MISCONFIG'
            );
            if (jwtMisconfig) {
                setMaintenanceBanner({
                    reason: 'POSTGREST_JWT_MISCONFIG',
                    detail: jwtMisconfig.reason?.detail || jwtMisconfig.reason?.message,
                });
                console.error('PostgREST JWT misconfigured:', jwtMisconfig.reason);
                // Не выходим — пытаемся показать всё, что удалось загрузить.
            }

            // 401 на любом из запросов → токен истёк или невалиден; чистим и просим перелогиниться.
            const has401 = results.some(
                (r) => r.status === 'rejected' && r.reason?.status === 401
            );
            if (has401 && !jwtMisconfig) {
                console.warn('Auth token rejected (401), clearing session');
                await api.logout(); // удалит garden_auth_token и garden_currentUser
                setCurrentUser(null);
                setLoading(false);
                return;
            }

            if (usersR.status === 'fulfilled') setUsers(usersR.value || []);
            else console.error('getUsers failed:', usersR.reason);

            if (kbR.status === 'fulfilled' && kbR.value && kbR.value.length > 0) {
                setKnowledgeBase(kbR.value);
            } else if (kbR.status === 'rejected') {
                console.error('getKnowledgeBase failed:', kbR.reason);
            }

            if (settingsR.status === 'fulfilled' && settingsR.value) {
                setLibrarySettings(settingsR.value);
            } else if (settingsR.status === 'rejected') {
                console.error('getLibrarySettings failed:', settingsR.reason);
            }

            if (newsR.status === 'fulfilled') setNews(newsR.value || []);
            else console.error('getNews failed:', newsR.reason);

            // Если все 4 упали — это полная недоступность бекенда.
            if (results.every((r) => r.status === 'rejected') && !jwtMisconfig) {
                setMaintenanceBanner({
                    reason: 'PARTIAL_DEGRADATION',
                    detail: 'Все 4 запроса не удались',
                });
            }
        } catch (e) {
            console.error("Init error:", e);
            if (e?.code === 'SUBSCRIPTION_EXPIRED' || e?.code === 'ACCESS_PAUSED_MANUAL') {
                setAccessBlock({
                    code: e.code,
                    message: e.message,
                    botRenewUrl: e.botRenewUrl || null,
                });
            } else if (e?.code === 'POSTGREST_JWT_MISCONFIG') {
                setMaintenanceBanner({
                    reason: 'POSTGREST_JWT_MISCONFIG',
                    detail: e.detail || e.message,
                });
            } else if (e?.status === 401) {
                console.warn('Auth token rejected (401) on getCurrentUser path');
                await api.logout();
                setCurrentUser(null);
            }
        } finally {
            setLoading(false);
        }
    };
    init();
}, []);
```

#### 3.3. Также `handleLogin` — обработка POSTGREST_JWT_MISCONFIG

**Текущий блок (строки 156-204), точка изменения — после `Promise.all`:**

```jsx
const [allUsers, kb, settings, newsData] = await Promise.all([
    api.getUsers(),
    api.getKnowledgeBase(),
    api.getLibrarySettings(),
    api.getNews(),
]);
```

**Заменить на тот же `Promise.allSettled`-блок, что в `init`** (можно вынести в отдельную утилиту `loadInitialData()` чтобы не дублировать код).

#### 3.4. Рендер баннера

**В блоке `{!currentUser ? (...) : (...)}` (строки 386-409) — добавить отдельную ветку для maintenanceBanner перед `accessBlock`:**

```jsx
{maintenanceBanner ? (
    <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md text-center">
            <h2 className="text-xl font-semibold mb-2">База временно в режиме обслуживания</h2>
            <p className="text-slate-600 mb-4">
                {maintenanceBanner.reason === 'POSTGREST_JWT_MISCONFIG'
                    ? 'Идёт настройка системы безопасности. Попробуйте обновить страницу через несколько минут.'
                    : 'Часть данных недоступна. Попробуйте обновить страницу.'}
            </p>
            <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-blue-600 text-white rounded"
            >
                Обновить
            </button>
        </div>
    </div>
) : !currentUser ? (
    /* ... существующая логика accessBlock / AuthScreen ... */
) : (
    /* ... админ/юзер-приложение ... */
)}
```

### Замечания к патчу 3

- `Promise.allSettled` всегда резолвится — `try/catch` верхнего уровня не ловит ошибки отдельных запросов, поэтому `try/catch` оставлен только для `api.getCurrentUser()` и для логических ошибок дальше.
- 401-обработка: `await api.logout()` вызывает `setAuthToken(null)` (строка 1393 dataService.js), что чистит `garden_auth_token`. Плюс `setCurrentUser(null)` ведёт на `AuthScreen`.
- При POSTGREST_JWT_MISCONFIG **не** выходим из сессии (это инфраструктурная ошибка, не auth) — показываем баннер.
- `accessBlock` и `maintenanceBanner` не пересекаются: первый возникает только из 401/expired-кодов, второй — из misconfig/полной недоступности.

---

## Патч 4 — `views/PvlPrototypeApp.jsx`

### Текущее состояние

`grep -nE "PGRST300|PGRST302|JWT secret|JwtDisabled|JWT_MISCONFIG"` по `views/PvlPrototypeApp.jsx` — пусто. То есть **в текущем коде PvlPrototypeApp нет специальной обработки JWT-ошибок**. Все ошибки из `pvlPostgrestApi.request(…)` пробрасываются «как есть» и ловятся общими `try/catch`.

### Что меняем

После патча 2 `pvlPostgrestApi.request` начинает кидать `err.code='POSTGREST_JWT_MISCONFIG'` вместо тихого fallback. Это значит, что **общие `try/catch`-блоки в PvlPrototypeApp начнут ловить эту ошибку как «обычную» и показывать пользователю generic-error**. Чтобы дать пользователю человеческое сообщение, нужно в **верхнем уровне PvlPrototypeApp** (или в его роутер-обёртке) добавить тот же баннер.

### Минимальный патч

В точке монтирования PvlPrototypeApp — добавить состояние `pvlMaintenanceBanner` и обработку. Точная строка зависит от того, как организован init этого компонента (8382 строки — отдельной задачей читать, не в этой сессии). **Действие в этой сессии:**

1. Не патчить `PvlPrototypeApp.jsx` сейчас.
2. Создать **отдельный TODO-маркер** в файле:
   ```js
   // TODO(SEC-001 step 4): обработка err.code === 'POSTGREST_JWT_MISCONFIG'
   //   — показать баннер «База временно в режиме обслуживания», не падать с generic error.
   //   После патча services/pvlPostgrestApi.js эта ошибка теперь типизирована.
   ```
3. Поручить отдельную проверку «после деплоя — есть ли в логах ошибки `POSTGREST_JWT_MISCONFIG` из PVL-вью» — если будут, значит надо явно обработать.

⚠ **Расхождение с ТЗ.** В исходном задании было: «Патч 4: views/PvlPrototypeApp.jsx (если есть catch на тех же ошибках) — аналогичная обработка POSTGREST_JWT_MISCONFIG.» По grep — таких catch'ей нет. Поэтому патч 4 — это **TODO в коде + отдельная задача после деплоя**, а не код-патч сейчас.

---

## Smoke-тесты после деплоя

### Перед открытием Caddy (фронт уже задеплоен с патчами, БД с RLS)

```
1. Открыть https://liga.skrebeyko.ru/ в режиме инкогнито.
2. Логин под Ольгой (admin).
3. Должен загрузиться UI; в Network-таб:
   - все запросы к /profiles, /pvl_*, /knowledge_base, /news имеют header
     `Authorization: Bearer <jwt>`
   - ни один запрос НЕ возвращает 401/403 (для админа политики разрешают всё)
4. Карта ведущих: список пользователей не пуст.
5. Учительская: список назначений виден, кнопка работает (только проверить чтение —
   запись пока отдельной задачей).
6. PVL: открыть курс → урок → отметить чек-лист → закрыть → перезагрузить.
   Чек-лист сохранился.
```

### Сценарий «токен истёк» (ручная симуляция)

```
1. Залогиниться.
2. В DevTools → Application → Local Storage → удалить ключ garden_auth_token.
3. Перезагрузить страницу.
4. Ожидаемое поведение:
   - getCurrentUser вернёт user из garden_currentUser (там старая копия).
   - setCurrentUser(user).
   - Promise.allSettled: все 4 запроса вернут 401.
   - Обработчик has401 сработает → api.logout() → setCurrentUser(null).
   - Показать AuthScreen.
```

### Сценарий «сервер вернул PGRST300» (через прод-тест без права на эксперимент)

⚠ Этот сценарий **трудно симулировать без отключения JWT-секрета на сервере**. На стейдже — отключить jwt-secret в PostgREST-конфиге → перезагрузить → залогиниться на фронте → ожидать `maintenanceBanner.reason='POSTGREST_JWT_MISCONFIG'`.

В проде — мониторить логи (если установлен Sentry / console.error в браузере).

### Прочие проверки

- На главном экране `console.error` не валится с stack-трейсами.
- При навигации между страницами PvlPrototypeApp не появляется generic «PostgREST error».
- При выходе/входе цикл стабилен (выйти → войти → выйти → войти).

---

## Backout

```bash
# Если что-то упало после деплоя — откатить именно проблемный файл:
git revert <commit-hash-патча-1>  # services/dataService.js
git revert <commit-hash-патча-2>  # services/pvlPostgrestApi.js
git revert <commit-hash-патча-3>  # App.jsx

# Или групповой откат всего ряда:
git revert <commit-hash-1>..<commit-hash-3>

# Альтернатива — откатить весь деплой через GitHub Actions (предыдущий успешный run).
```

⚠ **Связь с DB-миграцией.** Откат фронт-патча **не возвращает** БД к до-RLS состоянию. Это значит:
- Без фронт-патча, но с включённым RLS: `Authorization: Bearer` приходит — фронт работает на чтение и пишет.
- С фронт-патчем, но без включённого RLS: токен идёт, политики не фильтруют — пользователь видит всё (как до RLS), но без молчаливой деградации.
- Откат связки = `git revert` фронта **и** backout-план из MIGRATION-документа.

---

## Контрольный список перед деплоем

- [ ] DB-миграция (SEC-001 этап 2) применена на проде, smoke 15.1–15.6 успешны.
- [ ] Локальная сборка `npm ci && npm run build` прошла без warnings.
- [ ] Локальный `npm run dev` под тестовым пользователем — UI не висит.
- [ ] DevTools Network под `npm run dev`: запросы к `/profiles`/`/pvl_*` имеют Bearer.
- [ ] Линт: `git diff` не вносит синтаксических ошибок.
- [ ] Каждый патч — отдельный commit (1, 2, 3 — три commit'а).
- [ ] Готов план откатов: знаем точные SHA для `git revert`.

---

## Что делать после успешного деплоя

1. Открыть Caddy (Этап 5 SEC-001).
2. Прогнать smoke-тесты выше.
3. Через сутки — посмотреть прод-логи (если есть): нет ли всплеска `POSTGREST_JWT_MISCONFIG`.
4. Завести задачу **SEC-001 этап 4 sub-step (PvlPrototypeApp)** — проверить, нужен ли явный maintenanceBanner внутри PVL-приложения (Патч 4).
5. Заменить пустой `migrations/05_profiles_rls.sql` на корректный или добавить `migrations/29_profiles_rls_cleanup.sql` (отражает результат фазы 1 DB-миграции).
6. Перевести SEC-001 в backlog в статус 🟢 DONE.
