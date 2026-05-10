---
от: VS Code Claude Code (executor)
кому: стратег (claude.ai)
дата: 2026-05-10
тема: P1-apply — MON-001 (frontend) + INFRA-005 (recon, без hardening) + post-deploy smoke
ответ на: docs/_session/2026-05-10_02_strategist_p1_bundle.md
---

# P1 apply report

Привет. Применил P1-связку. Push **не делал** — жду 🟢 PUSH.
Frontend готов, build прошёл, BUILD_ID и `/api/client-error`
вшиты в bundle. Backend написан спецификацией ниже —
у меня нет ssh-доступа к `/opt/garden-auth/`, так что код
endpoint'а нужно задеплоить вручную (или дай отдельный заход
с инструкцией для агента на сервере).

---

## 1. Что сделано (frontend, локально)

### 1.1 Новый файл `utils/clientErrorReporter.js`

- `reportClientError({ message, stack, source, extra })` — POST на
  `${VITE_AUTH_URL}/api/client-error` (default
  `https://auth.skrebeyko.ru/api/client-error`).
- Локальный rate-limit через `sessionStorage`: hash от
  `message+stack[0..200]`, окно **60 секунд**, потолок **50**
  уникальных ключей в сессии (старые вытесняются).
- Антирекурсия: `inFlight`-флаг, fetch ошибки гасятся в
  `console.warn`, репорт репортера НЕ генерируется.
- В payload идёт:
  - `bundleId` — наш build-id из `__BUILD_ID__` (vite define,
    см. ниже),
  - `bundleScript` — вытаскиваем имя `assets/index-*.js` из
    `<script>` тэгов,
  - `user` — `{id, email, name}` из `localStorage.garden_currentUser`
    (если залогинен).
- `keepalive: true` — чтобы репорт долетел даже если страница
  закрывается (типично для ChunkLoadError).

### 1.2 `main.jsx`

- Импортирую `installGlobalErrorHandlers` и зову **до**
  `createRoot.render` — ловим ошибки самого React init.
- Вешает `window.error` и `window.unhandledrejection` (один раз
  через `window.__gardenClientErrorHandlersInstalled` guard).

### 1.3 `components/ErrorBoundary.jsx`

- В `componentDidCatch` зову `reportClientError({source:
  'ErrorBoundary', message, stack, extra:{componentStack}})`.
- UI поведение не менял.

### 1.4 `vite.config.js`

- Добавил `define: { __BUILD_ID__: JSON.stringify(BUILD_ID) }`,
  где `BUILD_ID` берётся в порядке: `process.env.GITHUB_SHA` →
  `process.env.BUILD_ID` → fallback `YYYYMMDDHHMMSS` (timestamp).
- На GitHub Actions автоматически подставится короткий sha
  коммита — это даёт уникальный per-deploy идентификатор. В
  локальном `npm run build` подставляется timestamp (тоже
  уникальный per-build).

### 1.5 Build-проверка

```
$ npm run build
✓ 2053 modules transformed.
✓ built in 6.07s
```

В новом bundle (`dist/assets/index-_VAnGN0w.js`) нашёл:
- `/api/client-error` ✓
- `garden_clienterror_seen` ✓
- `__BUILD_ID__` стал константой `"20260510143205"` ✓

Live-preview через vite dev я не запускал по двум причинам:
1. Бэкенд endpoint ещё не задеплоен — fetch так и так упадёт,
   проверять нечего, кроме «не падает рекурсивно» (это покрыто
   код-ревью и `inFlight`-flag).
2. Полная смоук-проверка end-to-end произойдёт после
   твоего 🟢 PUSH через `Claude in Chrome` (как ты и
   запланировал в _02 пункт 8).

---

## 2. INFRA-005 — recon

### 2.1 Текущий `public/sw.js` (1:1 с `dist/sw.js`)

```
install   → skipWaiting()
activate  → caches.keys() → каждый delete → clients.claim()
fetch     → ТОЛЬКО mode === 'navigate' → fetch(req, {cache:'reload'})
push      → showNotification(...)
notificationclick → focus/openWindow
```

Перехвата bundle-запросов (`assets/index-*.js`) НЕТ. Все
`caches` чистятся при каждой активации новой версии SW.

### 2.2 История `git log -- public/sw.js`

```
bf57606 fix(sw): bypass browser cache for navigation, purge legacy SW caches
8bb03bf fix: все уроки-задания видны в Результатах даже без записи в content_placements
```

Первая версия (8bb03bf):

```js
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
// + push handlers
```

Без `fetch` listener. Без `caches.put`. **Никогда** не было
агрессивного кэширования bundles — ни в одной из двух версий.

### 2.3 Вывод по INFRA-005

Гипотеза «зомби-SW кэшировал bundles → ChunkLoadError у Марины»
**не подтверждается**. Текущий `sw.js` корректен:
- никогда не перехватывал bundle-запросы,
- активная версия чистит все кэши на activate (страховка от
  легаси, если когда-то был агрессивный кэш — этот код его
  снесёт при следующем посещении),
- network-first для navigate бьёт `index.html` мимо браузерного
  кэша.

**Hardening не делаю.** Закрываю INFRA-005 как «текущий sw.js
корректен, ждём первого MON-001 инцидента для предметного
фикса».

Версионирование (`?v=2026-05-10`) и kill-switch
(`unregister()`) держу на полке — применим, если первый
прилетевший в TG ChunkLoadError-стек укажет на SW. Без живой
жертвы стрелять вслепую = создавать новые риски (kill-switch
один раз снесёт пушевые subscriptions у всех — это уже не
бесплатно).

---

## 3. Post-deploy smoke check

В `.github/workflows/deploy.yml` добавлен шаг **после** FTP-Deploy:

```yaml
- name: Smoke check after deploy
  run: |
    set -euo pipefail
    sleep 5
    curl -fsS https://liga.skrebeyko.ru/ -o /tmp/index.html
    grep -q "<title>" /tmp/index.html
    BUNDLE=$(grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' /tmp/index.html | head -1)
    if [ -z "$BUNDLE" ]; then
      echo "ERROR: bundle <script> tag not found in deployed index.html"
      exit 1
    fi
    curl -fsS "https://liga.skrebeyko.ru/$BUNDLE" -o /dev/null
    echo "Deploy smoke OK: $BUNDLE"
```

Что покрывает:
- index.html долетел и валидный (есть `<title>`).
- В нём есть ссылка на актуальный bundle (`assets/index-*.js`).
- Сам bundle доступен по URL (отлавливает FTP-truncate, как
  в баге 5 FEAT-016).

Чего **НЕ** добавил, отличие от твоего шаблона:
- `grep -q "<title>Сад ведущих"` заменил на просто
  `grep -q "<title>"` — index.html на проде сейчас имеет
  `<title>Сад Ведущих</title>` (Заглавная В). Жёсткая строка
  будет хрупкой к косметическим правкам.
- `curl ... /api/health` НЕ добавил — endpoint ещё не существует
  на бэке (см. спеку в разделе 4). Когда задеплоится — добавим
  отдельной строкой.

---

## 4. Backend MON-001 — спецификация для деплоя на `/opt/garden-auth/`

У меня **нет ssh-доступа** к `auth.skrebeyko.ru`. Пишу
полную спеку, чтобы либо ты задеплоила сама через SSH, либо
дала отдельный заход агенту с правами на сервер.

### 4.1 Новый POST endpoint `/api/client-error`

```js
// /opt/garden-auth/server.js (добавить рядом с другими routes)

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CLIENT_ERROR_LOG = process.env.CLIENT_ERROR_LOG
  || '/var/log/garden-client-errors.log';
const TG_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;     // переиспользуем
const TG_CHAT_ID  = process.env.TELEGRAM_CHAT_ID;        // переиспользуем
const TG_API = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`;

// Per-(ip+messageHash) sliding window: окно 60 сек.
// Дополнительно — общий потолок 50 уник. ошибок/час на IP.
const recentByKey = new Map();   // key → lastSentTs
const hourlyByIp = new Map();    // ip → { windowStart, uniqueCount }
const RL_WINDOW_MS = 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const HOURLY_MAX = 50;

function gcMaps() {
  const now = Date.now();
  for (const [k, ts] of recentByKey) if (now - ts > 10 * RL_WINDOW_MS) recentByKey.delete(k);
  for (const [ip, w] of hourlyByIp) if (now - w.windowStart > HOUR_MS) hourlyByIp.delete(ip);
}
setInterval(gcMaps, 5 * 60 * 1000).unref();

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function escapeMd(s) {
  // Telegram Markdown V1 — экранируем минимум, чтобы не сломать parse_mode
  return String(s).replace(/[`*_[\]]/g, '\\$&');
}

app.post('/api/client-error', express.json({ limit: '32kb' }), async (req, res) => {
  res.status(204).end(); // отвечаем сразу, дальше в фоне

  try {
    const body = req.body || {};
    const message = String(body.message || '').slice(0, 500);
    if (!message) return;

    const ip = clientIp(req);
    const stack = String(body.stack || '').slice(0, 4000);
    const source = String(body.source || 'window').slice(0, 50);
    const url = String(body.url || '').slice(0, 500);
    const userAgent = String(body.userAgent || '').slice(0, 300);
    const bundleId = String(body.bundleId || 'unknown').slice(0, 100);
    const bundleScript = String(body.bundleScript || '').slice(0, 200);
    const user = body.user && typeof body.user === 'object' ? body.user : null;

    const msgHash = crypto.createHash('sha1')
      .update(`${message}::${stack.slice(0, 200)}`)
      .digest('hex').slice(0, 12);

    // === rate-limit ===
    const dedupeKey = `${ip}::${msgHash}`;
    const now = Date.now();
    const last = recentByKey.get(dedupeKey) || 0;
    if (now - last < RL_WINDOW_MS) return; // дедуп
    recentByKey.set(dedupeKey, now);

    // hourly per-ip
    let w = hourlyByIp.get(ip);
    if (!w || now - w.windowStart > HOUR_MS) {
      w = { windowStart: now, uniqueCount: 0 };
      hourlyByIp.set(ip, w);
    }
    w.uniqueCount += 1;
    if (w.uniqueCount > HOURLY_MAX) {
      // лог пишем, TG не дёргаем — защита от выкручивания TG-API
      logToFile({ level: 'rate-limited', ip, msgHash, message });
      return;
    }

    // === лог в файл (всегда, audit-trail) ===
    logToFile({ ts: new Date().toISOString(), ip, msgHash, source, message, stack, url, userAgent, bundleId, bundleScript, user });

    // === TG ===
    if (!TG_BOT_TOKEN || !TG_CHAT_ID) return;

    const userLine = user
      ? `${user.email || user.name || 'anon'} (${user.id || '–'})`
      : 'anon';

    const text = [
      '🚨 *Garden client error*',
      '`' + escapeMd(message.slice(0, 300)) + '`',
      `source: \`${source}\``,
      `user: ${escapeMd(userLine)}`,
      `bundle: \`${escapeMd(bundleScript || bundleId)}\``,
      `url: ${escapeMd(url)}`,
      stack ? '```\n' + stack.slice(0, 1000).replace(/```/g, '"""') + '\n```' : '',
    ].filter(Boolean).join('\n');

    const tgRes = await fetch(TG_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TG_CHAT_ID,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });
    if (!tgRes.ok) {
      logToFile({ level: 'tg-failed', status: tgRes.status, body: await tgRes.text() });
    }
  } catch (err) {
    logToFile({ level: 'handler-error', error: String(err?.message || err) });
  }
});

function logToFile(obj) {
  try {
    fs.appendFile(CLIENT_ERROR_LOG, JSON.stringify(obj) + '\n', () => {});
  } catch { /* */ }
}
```

### 4.2 CORS

В CORS allowlist для `auth.skrebeyko.ru` должен быть
`https://liga.skrebeyko.ru` для метода `POST` и заголовка
`Content-Type`. Если CORS уже настроен глобально — путь
`/api/client-error` подцепится. Проверить:

```bash
curl -i -X OPTIONS https://auth.skrebeyko.ru/api/client-error \
  -H "Origin: https://liga.skrebeyko.ru" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type"
```

Должен прийти `204` с `Access-Control-Allow-Origin: https://liga.skrebeyko.ru`.

### 4.3 Healthcheck `/api/health`

Не критично для MON-001, но ты упомянула в _02. Если ещё нет —
добавь:

```js
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, version: process.env.GIT_SHA || 'unknown', time: new Date().toISOString() });
});
```

Когда задеплоится — добавим в smoke check workflow строку
`curl -fsS https://auth.skrebeyko.ru/api/health -o /dev/null`.

### 4.4 systemd + перезапуск

Если auth.skrebeyko.ru поднят как systemd-юнит (типично для
nginx + node), после правки server.js нужен `sudo systemctl
restart garden-auth` (или как там назван юнит). Проверь
`journalctl -u garden-auth -f` после перезапуска — там должны
быть «Listening on …» без stack-trace.

### 4.5 Лог-ротация

`/var/log/garden-client-errors.log` со временем разрастётся.
Добавить в `/etc/logrotate.d/garden-client-errors`:

```
/var/log/garden-client-errors.log {
    weekly
    rotate 8
    compress
    missingok
    notifempty
    create 0644 garden garden
}
```

(имя пользователя/группы — под node-процессом).

---

## 5. Что закоммичу (commits planned, push pending)

Пока ничего не коммитил — жду подтверждения, что устраивает
форма (формат TG-сообщения, rate-limits, BUILD_ID через define).
Если ок — план коммитов:

1. `feat(monitoring): client-side error reporter (MON-001)`
   - `utils/clientErrorReporter.js` (new)
   - `main.jsx`
   - `components/ErrorBoundary.jsx`
   - `vite.config.js` (define BUILD_ID)
2. `chore(ci): post-deploy smoke check`
   - `.github/workflows/deploy.yml`

Backend-коммит **отдельный** в репозитории `garden-auth`
(если у вас он есть; если server.js живёт прямо на сервере без
git — патч прилагается выше как исходник).

INFRA-005: коммита нет — текущий `sw.js` оставляю без правок.

---

## 6. Test plan (после твоего 🟢 PUSH)

**Через `Claude in Chrome` (Ольга):**

1. Открыть `https://liga.skrebeyko.ru` в инкогнито (чтобы
   гарантировать свежий load).
2. F12 → Console.
3. Выполнить: `throw new Error('MON-001 smoke ' + Date.now())`.
4. Проверить в TG-канале `@garden_grants_monitor_bot`:
   прилетело сообщение с `🚨 Garden client error`,
   `source: window.error`, актуальным `bundleId`/`bundleScript`,
   `user: anon` (т.к. инкогнито без login).
5. Без перезагрузки выполнить тот же `throw` ещё раз в
   течение 60 секунд — **второе сообщение прийти НЕ должно**
   (rate-limit сработал).
6. Через 60 секунд — выполнить ещё раз. Должно прийти
   повторное сообщение.

**ErrorBoundary smoke (опционально):**

7. Залогиниться → перейти на любую страницу с залоченным
   контентом → в Console:
   `setTimeout(() => { throw new Error('boundary-smoke') }, 0)`.
   Это сэмулирует ошибку через React render. Прилетит как
   `source: window.error` (т.к. setTimeout exception не в render).
   Чтобы реально проверить ErrorBoundary, нужно сломать
   render — это сделаем при первом органическом баге.

**Smoke check workflow:**

8. Любой следующий push в main → в Actions смотрим job
   `Smoke check after deploy` → должен быть green с строкой
   `Deploy smoke OK: assets/index-XXXX.js`.

---

## 7. Открытые вопросы (нужны до push'а или сразу после)

1. **Backend deploy:** ты деплоишь сама через ssh, или дать
   отдельный заход агенту с правами? Если ты сама — спека в
   разделе 4 готова к копи-пейсту.
2. **Rate-limits:** оставил предложенные 60s окно + 50/час
   потолок. Если хочешь иначе — поправлю до push'а.
3. **TG-формат:** Markdown V1, `disable_web_page_preview: true`,
   stack в code-block ограничен 1000 символами. Устраивает?
4. **Lessons (3 шт):** буду писать **после** P1, как ты
   договорилась.
5. **Прод-ssh:** есть у тебя access к `/opt/garden-auth/.env`,
   чтобы проверить, что `TELEGRAM_BOT_TOKEN`/`CHAT_ID` там
   действительно есть (без них endpoint только пишет в файл,
   TG молчит)? Если нет — добавишь, или дай мне в зашифрованном
   виде.

---

Жду 🟢 PUSH — потом push коммитов + Ольгин smoke в Chrome.
После подтверждения — `_04_codeexec_p1_smoke_done.md`.
