# Код-аудит фронта 2026-05-02 (read-only)

## Краткое резюме

- **Критично:** оба fetch-слоя (`dataService.postgrestFetch` и `pvlPostgrestApi.request`) при PGRST300/PGRST302 молча уходят в анонимку и перестают слать Bearer до конца сессии вкладки — RLS, рассчитанные на JWT, начинают видеть `anon`.
- **Критично:** `App.jsx → init()` обрабатывает в catch только два subscription-кода. При любом сбое `_fetchProfile`/`_ensurePostgrestUser` (RLS на `profiles`, 401/403) пользователь молча выпадает на экран логина с висящим в `localStorage` токеном. Re-login падает по той же причине → юзер заперт.
- **Critical-debt:** `services/pvlMockApi.js` — это **не mock**, а production-код на 4221 строку, гибрид «in-memory seed + real PostgREST через pvlPostgrestApi». Используется в 7 views, монтируется через `CourseLibraryView → PvlPrototypeApp`. Имя вводит в заблуждение и опасно при чистке.
- **В порядке:** в исходниках только **одно** вхождение hardcoded `olga@skrebeyko.com` — в seed-данных `data/data.js`, и оно используется только в локальном fallback-режиме. Скрытых runtime-проверок «email == Ольга = admin» в текущем JS/JSX нет.
- **Сигнал:** в собранном артефакте `assets/index-D-rk9tAk.js` ещё лежит старый код `role: t === "olga@skrebeyko.com" ? "admin" : ...` — это устаревшая сборка, после очистки RLS нужно пересобрать.

---

## 1. Карта fetch-ов

### Слой A — `services/dataService.js` → `postgrestFetch`

Передаёт `Authorization: Bearer <token>`, но с двумя «выключателями»: env-флаг `VITE_POSTGREST_SKIP_JWT` и process-уровневый latch `postgrestJwtDisabledAfterPgrst300`.

[services/dataService.js:7-12](../services/dataService.js#L7-L12)
```js
const POSTGREST_URL = import.meta.env.VITE_POSTGREST_URL || 'https://api.skrebeyko.ru';
const POSTGREST_SKIP_JWT = import.meta.env.VITE_POSTGREST_SKIP_JWT === 'true';
let postgrestJwtDisabledAfterPgrst300 = false;
```

[services/dataService.js:41-63](../services/dataService.js#L41-L63)
```js
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
```

**Endpoints, которые проходят через `postgrestFetch`:**
```
app_settings, birthday_templates, course_progress, events, goals,
knowledge_base, meetings, messages, news, practices, profiles,
push_subscriptions, scenarios, shop_items, users
+ rpc/increment_user_seeds
```

**Прямые потребители слоя А** (импорт `from '.../services/dataService'`):
- [App.jsx:8](../App.jsx#L8)
- [views/UserApp.jsx:26](../views/UserApp.jsx#L26)
- [views/AdminPanel.jsx:8](../views/AdminPanel.jsx#L8)
- [views/LeaderPageView.jsx:8](../views/LeaderPageView.jsx#L8)
- [views/NewsView.jsx:3](../views/NewsView.jsx#L3)
- [views/BuilderView.jsx:6](../views/BuilderView.jsx#L6)
- [views/CommunicationsView.jsx:4](../views/CommunicationsView.jsx#L4)
- [views/MarketView.jsx:3](../views/MarketView.jsx#L3)
- [views/CourseLibraryView.jsx:6](../views/CourseLibraryView.jsx#L6)
- [views/MeetingsView.jsx:9](../views/MeetingsView.jsx#L9)
- [views/PvlStudentCabinetView.jsx:2](../views/PvlStudentCabinetView.jsx#L2)
- [views/PvlPrototypeApp.jsx:103](../views/PvlPrototypeApp.jsx#L103)
- [services/pvlMockApi.js:30](../services/pvlMockApi.js#L30)

В этом же файле есть `authFetch` ([services/dataService.js:115-133](../services/dataService.js#L115-L133)) и `pushFetch` ([services/dataService.js:135-153](../services/dataService.js#L135-L153)) — оба передают Bearer без latch-логики.

### Слой B — `services/pvlPostgrestApi.js` → `request`

Передаёт Bearer по той же двух-уровневой схеме, плюс «mock mode» через `VITE_USE_LOCAL_DB`.

[services/pvlPostgrestApi.js:1-22](../services/pvlPostgrestApi.js#L1-L22)
```js
const POSTGREST_URL = import.meta.env.VITE_POSTGREST_URL || '';
const USE_LOCAL_ONLY = import.meta.env.VITE_USE_LOCAL_DB === 'true';
let pvlJwtDisabledAfterError = false;

function getAuthToken() {
    try {
        return localStorage.getItem('garden_auth_token') || '';
    } catch {
        return '';
    }
}

function isEnabled() {
    return !USE_LOCAL_ONLY && !!POSTGREST_URL;
}
```

[services/pvlPostgrestApi.js:59-95](../services/pvlPostgrestApi.js#L59-L95)
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

async function request(table, { method = 'GET', params = {}, body, prefer } = {}) {
    ...
    const tryWithToken = !pvlJwtDisabledAfterError && Boolean(getAuthToken());
    let response = await fetch(url.toString(), {
        method,
        headers: buildHeaders(prefer, tryWithToken),
        body: body ? JSON.stringify(body) : undefined,
    });
```

**Endpoints, которые проходят через `pvlPostgrestApi.request`:**
```
pvl_audit_log, pvl_calendar_events, pvl_checklist_items, pvl_content_items,
pvl_content_placements, pvl_course_lessons, pvl_course_weeks,
pvl_direct_messages, pvl_faq_items, pvl_garden_mentor_links,
pvl_homework_items, pvl_homework_status_history, pvl_notifications,
pvl_student_content_progress, pvl_student_course_progress,
pvl_student_homework_submissions, pvl_student_questions, pvl_students
```

**Прямые потребители слоя B:**
- [views/PvlPrototypeApp.jsx:80](../views/PvlPrototypeApp.jsx#L80) (единственный view)
- [services/pvlMockApi.js:8](../services/pvlMockApi.js#L8) (внутренний адаптер для остальных PVL-views)

### Сводная таблица

| Слой | Передаёт Bearer? | Latch отключения JWT | Endpoints | Прямые потребители |
|---|---|---|---|---|
| `dataService.postgrestFetch` (A) | да, если есть токен и не сброшен latch | env `VITE_POSTGREST_SKIP_JWT` + module-level `postgrestJwtDisabledAfterPgrst300` | `profiles`, `users`, `meetings`, `events`, `practices`, `news`, `goals`, `messages`, `scenarios`, `shop_items`, `app_settings`, `course_progress`, `knowledge_base`, `birthday_templates`, `push_subscriptions`, `rpc/increment_user_seeds` | `App.jsx`, 11 views, `pvlMockApi.js` |
| `dataService.authFetch` | да, если есть токен | нет | `auth.skrebeyko.ru/auth/*`, `/storage/sign` | внутренний (login, getCurrentUser, ensure*, sign) |
| `dataService.pushFetch` | да, если есть токен | нет | push-сервер (`PUSH_URL`) | внутренний (push subscribe/unsubscribe) |
| `pvlPostgrestApi.request` (B) | да, если есть токен и не сброшен latch | env `VITE_USE_LOCAL_DB` + module-level `pvlJwtDisabledAfterError` | 18 таблиц `pvl_*` | `PvlPrototypeApp.jsx`, `pvlMockApi.js` |

**Главный риск:** оба слоя при PGRST300/PGRST302 молча уходят в анонимку — это и есть основной источник «обрезанных» данных при сбое jwt-secret в PostgREST.

---

## 2. JWT fallback в `pvlPostgrestApi.js`

### Где это сейчас

Объявление latch-флага — [services/pvlPostgrestApi.js:6-10](../services/pvlPostgrestApi.js#L6-L10):
```js
/**
 * После PGRST300/PGRST302 («Server lacks JWT secret») больше не шлём JWT на этой вкладке,
 * чтобы не ломать каждый запрос повторными ошибками — аналогично dataService.js.
 */
let pvlJwtDisabledAfterError = false;
```

Детектор кода ошибки — [services/pvlPostgrestApi.js:24-33](../services/pvlPostgrestApi.js#L24-L33):
```js
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

Основной блок fallback — [services/pvlPostgrestApi.js:90-116](../services/pvlPostgrestApi.js#L90-L116):
```js
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
            logDb('[PVL DB FALLBACK]', { endpoint: url.toString(), status: response.status, table, id: body?.id || null, error: text2 });
            throw new Error(text2 || `PostgREST error (${response.status})`);
        }
    } else {
        logDb('[PVL DB FALLBACK]', { endpoint: url.toString(), status: response.status, table, id: body?.id || null, error: text });
        throw new Error(text || `PostgREST error (${response.status})`);
    }
}
```

В `services/dataService.js` живёт идентичный шаблон — [services/dataService.js:18,27-35,56-85](../services/dataService.js#L18) (`postgrestJwtDisabledAfterPgrst300`).

### Предложение: hard-error вместо retry без токена

**Было (поведение):** при первой ошибке PGRST300/PGRST302 latch выставляется в `true`, текущий запрос повторяется без `Authorization`, **и все последующие запросы на этой вкладке идут без токена** до закрытия вкладки. Фронт незаметно соскальзывает в анонимный режим. RLS, рассчитанные на JWT-проверки, видят `anon`, и данные либо обрезаются, либо открываются настежь — зависит от политик.

**Станет (предложение, без правки файла):**

1. Удалить module-level флаг `pvlJwtDisabledAfterError` и его близнец `postgrestJwtDisabledAfterPgrst300` в `dataService.js` — никакой «глобальной памяти» о деградации быть не должно.
2. В блоке детектирования PGRST300/PGRST302 не делать второй `fetch`, а сразу бросать типизированную ошибку:
   ```js
   if (tryWithToken && isPgrstJwtError(text)) {
       const err = new Error(
           'PostgREST не настроен на проверку JWT (PGRST300/PGRST302). ' +
           'Запросы временно недоступны — обратитесь к администратору.'
       );
       err.code = 'POSTGREST_JWT_MISCONFIG';
       err.status = response.status;
       throw err;
   }
   ```
3. На уровне UI (`App.jsx` и `PvlPrototypeApp.jsx`) ловить `err.code === 'POSTGREST_JWT_MISCONFIG'` и показывать единый баннер/тост «База временно в режиме обслуживания» — без молчаливого ухода в анонимку и без потери последующих сессионных запросов.
4. `VITE_POSTGREST_SKIP_JWT` оставить как явный dev-only override; в проде он не должен быть включён.

Эффект: при любом сбое jwt-secret в PostgREST фронт честно падает с понятной ошибкой, а не отдаёт пользователю «обрезанные» данные.

---

## 3. `App.jsx` — `init()` и обработка ошибок профиля

### Где это

`init()` объявлена как inline-функция внутри первого `useEffect` — [App.jsx:97-133](../App.jsx#L97-L133):

```jsx
 97 |    // Initial Data Fetch
 98 |    useEffect(() => {
 99 |        const init = async () => {
100 |            try {
101 |                const user = await api.getCurrentUser();
102 |                if (!user) {
103 |                    setLoading(false);
104 |                    return;
105 |                }
106 |                setCurrentUser(user);
107 |
108 |                const [allUsers, kb, settings, newsData] = await Promise.all([
109 |                    api.getUsers(),
110 |                    api.getKnowledgeBase(),
111 |                    api.getLibrarySettings(),
112 |                    api.getNews(),
113 |                ]);
114 |
115 |                setUsers(allUsers || []);
116 |                if (kb && kb.length > 0) setKnowledgeBase(kb);
117 |                if (settings) setLibrarySettings(settings);
118 |                setNews(newsData || []);
119 |            } catch (e) {
120 |                console.error("Init error:", e);
121 |                if (e?.code === 'SUBSCRIPTION_EXPIRED' || e?.code === 'ACCESS_PAUSED_MANUAL') {
122 |                    setAccessBlock({
123 |                        code: e.code,
124 |                        message: e.message,
125 |                        botRenewUrl: e.botRenewUrl || null
126 |                    });
127 |                }
128 |            } finally {
129 |                setLoading(false);
130 |            }
131 |        };
132 |        init();
133 |    }, []);
```

`api.getCurrentUser()` — [services/dataService.js:1396-1410](../services/dataService.js#L1396-L1410):
```js
async getCurrentUser() {
    const token = getAuthToken();
    if (!token) return null;
    const data = await authFetch('/auth/me');
    const authUser = this._normalizeProfile(data.user);
    let profile = await this._fetchProfile(authUser?.id);
    if (!profile && authUser?.id) {
        await this._ensurePostgrestUser({ ...data.user, ...authUser });
        profile = await this._fetchProfile(authUser.id);
    }
    if (profile?.id) {
        profile = await this._ensureDefaultApplicantRoleInDb(profile);
    }
    return this._assertActive(profile || authUser);
}
```

Аналогичная связка живёт в `handleLogin` — [App.jsx:156-204](../App.jsx#L156-L204) — и в `api.login` — [services/dataService.js:1195-1213](../services/dataService.js#L1195-L1213).

### Конкретные точки, где ошибка профиля приводит к падению

**Точка 1 — `_fetchProfile` без обработки ошибок** ([services/dataService.js:1457-1465](../services/dataService.js#L1457-L1465)):
```js
async _fetchProfile(userId) {
    const { data } = await postgrestFetch('profiles', {
        select: '*',
        id: `eq.${userId}`
    });

    if (!data || data.length === 0) return null;
    return this._normalizeProfile(data[0]);
}
```
Любой 401/403/PGRST301 на `profiles` → `postgrestFetch` бросает → `_fetchProfile` не ловит → `getCurrentUser` падает → init попадает в `catch` ([App.jsx:119](../App.jsx#L119)). В catch обработан **только** `SUBSCRIPTION_EXPIRED/ACCESS_PAUSED_MANUAL` — все остальные коды просто пишутся в консоль, `currentUser` остаётся `null`, юзер видит экран логина. Token при этом лежит в `localStorage` нетронутый.

**Точка 2 — `_ensurePostgrestUser` бросает наружу** ([services/dataService.js:1442-1450](../services/dataService.js#L1442-L1450)):
```js
await postgrestFetch('profiles', {}, {
    method: 'POST',
    body: [payload],
    returnRepresentation: true
});
} catch (e) {
    console.warn('PostgREST user ensure failed:', e);
    throw new Error('Не удалось создать пользователя в новой базе. Напишите администратору.');
}
```
Если `profiles` закрыты для INSERT текущей роли, `getCurrentUser` падает с этим текстом. При этом auth-токен валиден, но юзер не может войти.

**Точка 3 — `Promise.all` без частичной деградации** ([App.jsx:108-113](../App.jsx#L108-L113)):
Если **любой** из четырёх RLS-зависимых вызовов отвалится (`profiles`, `knowledge_base`, `app_settings`, `news`), `Promise.all` rejects, init попадает в catch. `currentUser` уже выставлен на строке 106 — фактически юзер «вошёл, но без данных». В `handleLogin` ([App.jsx:173-203](../App.jsx#L173-L203)) аналогичный `Promise.all` приводит к `alert(msg)` с сырым текстом ошибки PostgREST.

**Точка 4 — нет ретраев и нет «отзыва токена»**. При устойчивом 401 на `/profiles` пользователь зацикливается: re-login снова дёргает `_fetchProfile`, снова падает.

### Предложение по правке (без правки файла)

1. В `getCurrentUser` ([services/dataService.js:1396](../services/dataService.js#L1396)) обернуть только `_fetchProfile` и `_ensureDefaultApplicantRoleInDb` в try/catch и при ошибке возвращать `authUser` из `/auth/me` — это и есть graceful degradation: пользователь логинится, дальше UI работает в режиме «без profile-расширений».
2. В `init()` ([App.jsx:108](../App.jsx#L108)) заменить `Promise.all` на `Promise.allSettled`, обрабатывать каждый результат отдельно: получили — записали, не получили — оставили дефолт, фиксируем флаг «частичная деградация» в state и показываем баннер.
3. В catch ([App.jsx:119-127](../App.jsx#L119-L127)) кроме двух кодов SUBSCRIPTION_*/ACCESS_* обработать `e?.status === 401` явно: чистить `garden_auth_token` и отправлять на login. Сейчас токен висит и каждое обновление страницы повторяет ту же ошибку.
4. В `handleLogin` ([App.jsx:184-203](../App.jsx#L184-L203)) не показывать сырой `e.message` от PostgREST — это утечка деталей RLS наружу.

---

## 4. Hardcoded `olga@skrebeyko.com`

В исходном коде (`*.js`, `*.jsx`, исключая `dist/`, `assets/`, `node_modules/`, `backups/`) — **одно вхождение**:

[data/data.js:88](../data/data.js#L88):
```js
82 | export const INITIAL_KNOWLEDGE = [
83 |     { id: 1, title: "Как собрать первую встречу", role: "all", type: "Видео" },
84 |     { id: 2, title: "Чек-лист подготовки", role: "all", type: "PDF" },
85 | ];
86 |
87 | export const INITIAL_USERS = [
88 |     { id: 100, email: "olga@skrebeyko.com", password: "12345", name: "Ольга Скребейко", city: "Сад", role: "admin", tree: "Дуб", seeds: 9999, avatar: null, emoji: "👩🏼‍🌾", x: 50, y: 50, skills: ["Фасилитация", "Психология"] },
89 | ];
90 |
91 | export const INITIAL_PRACTICES = [
92 |     { id: 1, title: "Письмо обиды", time: "15 мин", type: "Травма", description: "Глубокая практика...", icon: "📝", status: "approved" },
93 |     { id: 2, title: "Медитация света", time: "10 мин", type: "Ресурс", description: "Наполнение энергией...", icon: "✨", status: "approved" },
```

`INITIAL_USERS` импортируется в [services/dataService.js:1](../services/dataService.js#L1) и используется в локальном fallback-режиме (где `_assertPlatformAccess` на [services/dataService.js:605-608](../services/dataService.js#L605-L608) — без gating). В production-ветке через `getCurrentUser` ([services/dataService.js:1396](../services/dataService.js#L1396)) этот email напрямую не проверяется.

**Дополнительный сигнал — устаревший артефакт в `dist/assets/`:**
В скомпилированном бандле `assets/index-D-rk9tAk.js` (стр. 52) присутствует:
```
role:t==="olga@skrebeyko.com"?"admin":i.role||"applicant"
```
Это код от старой версии репо, в текущих исходниках условия `register()` ([services/dataService.js:1310-1395](../services/dataService.js#L1310-L1395)) такого нет — роль приходит от auth-сервиса. Артефакт нужно пересобрать после очистки RLS.

**Не код, но рядом** (документация и планы, не влияет на runtime, но учесть при role-based рефакторинге):
- [docs/ROLES_AND_ACCESS.md:40](../docs/ROLES_AND_ACCESS.md#L40), [docs/ROLES_AND_ACCESS.md:164](../docs/ROLES_AND_ACCESS.md#L164)
- [docs/DB_SECURITY_AUDIT.md:65,156,198](../docs/DB_SECURITY_AUDIT.md)
- [plans/BACKLOG.md:41,111,118,126,275](../plans/BACKLOG.md)

**Итог:** в коде платформы есть ровно одно опасное вхождение — в seed-данных `data/data.js`, и оно используется только в локальном fallback. Скрытых runtime-проверок «только Ольга = admin» в текущих исходниках нет. Всё остальное — RLS-политики БД (вне зоны этого аудита) и собранный артефакт.

---

## 5. `services/pvlMockApi.js` — mock или production?

**Это production-код с вводящим в заблуждение именем + крупный technical debt.** 4221 строка, реально является «доменным слоем PVL» и работает в проде.

### Первые ~60 значимых строк ([services/pvlMockApi.js:1-95](../services/pvlMockApi.js#L1-L95))

```js
 1 | import { seed } from '../data/pvl/seed';
 2 | import { LOCAL_DEMO_LESSON_ITEMS, LOCAL_DEMO_LESSON_PLACEMENTS } from '../data/pvl/localDemoLessons';
 3 | import { capSzMentor, capSzSelf, computeCourseBreakdown } from './pvlScoringEngine';
 4 | import { CANONICAL_SCHEDULE_2026 } from '../data/pvl/constants';
 5 | import { CERTIFICATION_STATUS, CONTENT_STATUS, COURSE_STATUS, ROLES, TASK_STATUS } from '../data/pvl/enums';
 6 | import { PVL_PLATFORM_MODULES, PVL_TRACKER_LIBRARY_EXCLUDE_CATEGORY_IDS, pvlPlatformModuleTitleFromInternal } from '../data/pvlReferenceContent';
 7 | import { SCORING_METHOD_QUESTION, SCORING_RULES } from '../data/pvl/scoringRules';
 8 | import { pvlPostgrestApi } from './pvlPostgrestApi';
 9 | import { ... } from '../selectors/pvlCalculators';
30 | import { api } from './dataService';
31 | import { ROLES as GARDEN_ROLES } from '../utils/roles';
...
64 | const db = cloneSeedData(seed);
...
72 | /** У seed пустой CMS-слой: без PostgREST в трекере нечего показывать — подмешиваем демо-уроки. */
73 | function ensureLocalDemoLessonContent() { ... }
81 | if (import.meta.env.DEV) {
82 |     ensureLocalDemoLessonContent();
83 | }
84 | const eventLog = [];
85 | let auditLog = [];
86 | let notifications = [];
87 | if (!Array.isArray(db.studentLibraryProgress)) db.studentLibraryProgress = [];
88 | if (!Array.isArray(db.taskDisputes)) db.taskDisputes = [];
89 | if (!Array.isArray(db.calendarEvents)) db.calendarEvents = [];
90 | if (!Array.isArray(db.faqItems)) db.faqItems = [];
91 | if (!db.studentTrackerChecks || typeof db.studentTrackerChecks !== 'object') db.studentTrackerChecks = {};
92 | const IS_DEV = import.meta.env.DEV;
```

### Экспорты файла

```
204 : pvlCohortIdsEquivalent
211 : pvlPlacementVisibleForCohort
867 : pruneSeedPvlDemoStudentRows
935 : syncPvlRuntimeFromCache
948 : syncPvlRuntimeFromDb         ← синхронизация из реальной БД через pvlPostgrestApi
1045: syncPvlActorsFromGarden      ← синхронизация из реальной Garden-БД
1251: PVL_PREVIEW_STUDENT_ID
1253: isPvlPreviewStudentId
1261: ensurePvlPreviewStudentProfile
1305: canPostTaskThread
1606: mapTaskStatus
1622: mapStudentHomeworkDisplayStatus
1641: mapStudentControlPointDisplayStatus
2488: studentApi          ← фасад для студенческих экранов
3003: mentorApi           ← фасад для менторов
3293: calendarApi
3312: adminApi            ← фасад для админки PVL
3859: sharedApi
4028: pvlDomainApi        ← главный экспорт, агрегирует всё выше
4181: pvlPatchCurrentUserFromGarden
```

### Используется ли в проде?

**Да, повсеместно.** Импортируется из 7 production-views:
- [views/PvlPrototypeApp.jsx:73-79](../views/PvlPrototypeApp.jsx#L73-L79) (главный сборщик PVL-UI)
- [views/PvlSzAssessmentFlow.jsx:7](../views/PvlSzAssessmentFlow.jsx#L7)
- [views/pvlLibraryMaterialShared.jsx:3](../views/pvlLibraryMaterialShared.jsx#L3)
- [views/PvlTaskDetailView.jsx:2](../views/PvlTaskDetailView.jsx#L2)
- [views/PvlMenteeCardView.jsx:3](../views/PvlMenteeCardView.jsx#L3)
- [views/PvlStudentTrackerView.jsx:5](../views/PvlStudentTrackerView.jsx#L5)
- [views/PvlCalendarBlock.jsx:5](../views/PvlCalendarBlock.jsx#L5)

`PvlPrototypeApp` подключается lazy-чанком в [views/CourseLibraryView.jsx:18-19](../views/CourseLibraryView.jsx#L18-L19) и рендерится на [views/CourseLibraryView.jsx:843](../views/CourseLibraryView.jsx#L843) — рабочий курсовой UI учительской. «Test-only»/«dev-only» оболочки в импортной цепочке нет.

### Что внутри

Файл — гибрид:
- read-операции отдают `db.*` напрямую (тот самый «mock-fallback»);
- write-операции через `fireAndForget` пишут в реальный PostgREST (например, [services/pvlMockApi.js:1436](../services/pvlMockApi.js#L1436), [services/pvlMockApi.js:3753](../services/pvlMockApi.js#L3753), [services/pvlMockApi.js:3798](../services/pvlMockApi.js#L3798), [services/pvlMockApi.js:4115](../services/pvlMockApi.js#L4115));
- синхронизация в обратную сторону — `syncPvlRuntimeFromDb`, `syncPvlActorsFromGarden`, `hydrateGardenMentorAssignmentsFromDb` — затягивают строки из БД в `db`;
- «mock mode» включается, только если `pvlPostgrestApi.isEnabled() === false` (нет `VITE_POSTGREST_URL` или `VITE_USE_LOCAL_DB=true`).

Логирование тоже выдаёт двойственность ([services/pvlMockApi.js:107-128](../services/pvlMockApi.js#L107-L128)):
```js
function logDbFallback(payload = {}) {
    ...
    /** В проде иначе «тихие» сбои PostgREST — данные исчезают после F5. */
    if (table.includes('pvl_')) {
        try {
            console.warn('[PVL DB]', table, err.slice(0, 200), payload.id || '');
        } catch { /* noop */ }
    }
}
```

### Technical debt

1. **Имя файла не соответствует содержимому.** Это полноценный domain-layer, держит in-memory кэш PVL, читает/пишет в реальную БД через `pvlPostgrestApi`, синхронизируется с Garden-профилями. Любой новый разработчик по имени файла предположит «можно удалить из прода» и снесёт половину учительской.
2. **Гибридная модель «seed → real DB»:** при сбое jwt/RLS read-операции **тихо** возвращают seed-данные, а write-`fireAndForget` падают в фоне с `console.warn`. Пользователь видит «работает», после F5 данные «исчезают» — этот эффект уже задокументирован в коде.
3. **Перед любыми правками RLS на `pvl_*` таблицах** нужно либо переименовать файл (минимум — `pvlDomainStore.js`), либо явно пометить TODO о переходе на «source-of-truth = БД, без in-memory seed в проде».

**Рекомендация (не правка, отметка):** добавить в `plans/` отдельный план `XXXX-XX-XX-pvl-domain-layer-rename.md` — переименование + разделение seed-only и real-DB-paths.

---

## Что выглядит неожиданно

- **Два независимых latch-флага с одинаковой логикой** живут в `dataService.js` и `pvlPostgrestApi.js`. Первый, кто схватит PGRST300/PGRST302 на своём слое, не «сообщит» второму — поэтому теоретически возможен режим «слой A в анонимке, слой B всё ещё с токеном». Это плохо ловится в логах.
- **`Accept-Profile: public` / `Content-Profile: public`** заголовки слой B шлёт всегда ([services/pvlPostgrestApi.js:62-63](../services/pvlPostgrestApi.js#L62-L63)), а слой A — нет. Если на PostgREST когда-нибудь подключат другие схемы (например, для админки), слой A молча останется на дефолтной схеме.
- **`resolveStorageSign`** ([services/dataService.js:217-280](../services/dataService.js#L217-L280)) перебирает 4 формата payload и 2 base-URL × 2 endpoint-path в поисках рабочего сочетания — это фактически brute-force контракта с auth-сервисом, индикатор того, что storage-API не зафиксирован и в любой момент сломается.
- **`/auth/me` через `authFetch`** ([services/dataService.js:1399](../services/dataService.js#L1399)) — единственное место, где Bearer гарантированно используется без latch-логики. Это «честная» проверка живой сессии. Дальше всё, что идёт в `profiles`, идёт уже через слой A с возможной анонимкой.
- **`api.getCurrentUser` дёргается каждые 60 секунд** в фоне ([App.jsx:135-154](../App.jsx#L135-L154)) — это значит, что любая проблема с RLS на `profiles` будет постоянно генерировать 401-ошибки и спамить логи, а также может запустить серверные алерты.
- **`pvlMockApi.js` импортирует `dataService.js`** ([services/pvlMockApi.js:30](../services/pvlMockApi.js#L30)) и наоборот через цепочку views — циклической зависимости нет, но связность очень высокая. Любая правка в `dataService.api` рискует ломать PVL.
- **В `register` локального LocalDataService** есть условие на email Ольги в скомпилированном `dist/assets/index-D-rk9tAk.js`, которого больше нет в исходниках — это сигнал, что сборка устарела минимум на одну смысловую итерацию.
- **`utils/pvlGardenAdmission`** и `pvlRoleResolver` тянут роль из Garden-профиля, но **`_assertActive`** ([services/dataService.js:1190-1193](../services/dataService.js#L1190-L1193)) сейчас **no-op** (`Temporary open access mode`). Если RLS жёсткие, а assertActive выключен — на бэке закрыто, а на фронте «всех пускаем», и любая ошибка читается как «база сломалась», а не «у вас нет доступа».

---

## Открытые вопросы / blockers

1. **Какова реальная политика на `profiles` сейчас?** От этого зависит, упадёт ли `_fetchProfile` для не-админов после восстановления безопасности. Если упадёт — нужно сначала сделать пункт 3 (graceful degradation в `getCurrentUser`), потом править RLS.
2. **Включён ли `VITE_POSTGREST_SKIP_JWT` в продакшен-сборке?** Если да — fallback вообще не запускался и весь латч-код мёртвый, Bearer никогда не отправляется. Нужно проверить `.env.production` / GitHub Actions secrets.
3. **`POSTGREST_URL` в слое B — пустая строка по умолчанию** ([services/pvlPostgrestApi.js:1](../services/pvlPostgrestApi.js#L1)), а в слое A — `'https://api.skrebeyko.ru'`. Если в проде `VITE_POSTGREST_URL` не задан, слой B уйдёт в mock-режим (`isEnabled() === false`), а слой A пойдёт в продовый PostgREST. Это **разные источники данных** в одной сессии — нужно подтвердить, что env выставлена.
4. **Что за артефакт `assets/index-D-rk9tAk.js` в репо** — это checked-in build из `dist/`? Если да, то перед изменениями RLS обязательно нужно пересобрать, иначе на проде будет крутиться старая версия с hardcoded email Ольги.
5. **Latch-флаги `pvlJwtDisabledAfterError` / `postgrestJwtDisabledAfterPgrst300` сбрасываются только перезагрузкой вкладки.** При краткосрочном сбое jwt-secret (минуту) пользователь до конца сессии остаётся в анонимке, даже когда PostgREST уже починился. Сколько таких «отравленных вкладок» сейчас может быть открыто у живых пользователей — неизвестно.
6. **`_ensurePostgrestUser` создаёт строку в `profiles` от имени текущего токена** ([services/dataService.js:1442-1446](../services/dataService.js#L1442-L1446)). Если RLS на INSERT запрещают это всем, кроме админа, — новые пользователи Garden не смогут залогиниться вообще. Нужно подтвердить, какая RLS-политика применима к этому INSERT.
7. **`syncPvlActorsFromGarden`** ([services/pvlMockApi.js:1045](../services/pvlMockApi.js#L1045)) запускается из `PvlPrototypeApp.jsx` и тянет всех пользователей через слой A. Если RLS на `users`/`profiles` ограничат выдачу, PVL-учительская перестанет видеть студентов — нужен план миграции этого вызова на серверный agreggate-endpoint.
8. **`_assertActive` сейчас — no-op** ([services/dataService.js:1190-1193](../services/dataService.js#L1190-L1193)). Когда планируется его включать обратно? До или после восстановления RLS? От этого зависит, появится ли `SUBSCRIPTION_EXPIRED` в catch и нужно ли init расширять сейчас.
