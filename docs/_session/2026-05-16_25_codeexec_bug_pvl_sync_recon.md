# BUG-PVL-SYNC-FAILED-TO-FETCH — recon

**Дата:** 2026-05-16
**Автор:** codeexec
**Тип:** RECON (без кода)
**Связано:** MON-001 alerts, BUG-PVL-ADMIN-AS-MENTOR-EMPTY (Variant B reporters)

---

## TL;DR

**Гипотеза в задаче не подтвердилась.** В `services/pvlPostgrestApi.js`
**нет silent anon-fallback'а** при PGRST300/PGRST302 — код кидает
`POSTGREST_JWT_MISCONFIG` и наверх. И поле `"user":null` в алертах —
это не «JWT не отправляется», а «`garden_currentUser` в localStorage
не было в момент репорта».

**Настоящая причина** алертов в MON-001: `TypeError: Failed to fetch`
и `TypeError: Load failed` — это **network-layer ошибки браузера**, а
не ответы PostgREST. Они происходят, когда `fetch()` не получает HTTP
response (потеря связи, abort при навигации, CORS/DNS/TLS hiccup),
особенно у мобильных пользователей.

garden-auth здоров: за 24h в `journalctl` ни одного error/401/refused,
TTL access-token = **30 дней**, refresh endpoint **отсутствует**.

Архитектурное решение в задаче (refresh/redirect-on-401) **этот баг
не лечит** — оно про другой класс ошибок. См. §5 ниже.

---

## 1. Что про silent fallback на самом деле в коде

### `services/pvlPostgrestApi.js`

Файл [services/pvlPostgrestApi.js](services/pvlPostgrestApi.js),
721 строка. Логика JWT и PGRST300/PGRST302:

- **[pvlPostgrestApi.js:53-63](services/pvlPostgrestApi.js#L53-L63)**
  `buildHeaders()` — берёт `garden_auth_token` из localStorage,
  кладёт в `Authorization: Bearer ...`. Если токена **нет** — заголовок
  просто не выставляется (анонимный запрос), но это не «fallback»,
  это исходное состояние без токена.

- **[pvlPostgrestApi.js:18-27](services/pvlPostgrestApi.js#L18-L27)**
  `isPgrstJwtError(bodyText)` — детектит `PGRST300`/`PGRST302`/«JWT
  secret» в теле ответа.

- **[pvlPostgrestApi.js:88-103](services/pvlPostgrestApi.js#L88-L103)**
  При `!response.ok` и матче `isPgrstJwtError(text)` — **кидается
  ошибка** с `err.code = 'POSTGREST_JWT_MISCONFIG'`. **Никаких
  `localStorage.removeItem` / повторных запросов без Authorization
  нет.**

То же самое во второй копии в [services/dataService.js:22-67](services/dataService.js#L22-L67) —
тоже throw, тоже без silent-fallback'а.

### Где POSTGREST_JWT_MISCONFIG ловится наверху

- [App.jsx:115-117, 158-162, 183-187, 240-245](App.jsx#L115-L117) —
  ставится `maintenanceBanner` с reason `POSTGREST_JWT_MISCONFIG`
  (баннер «обслуживание»). 401 → `api.logout()` + clearCurrentUser.
- [views/AdminPvlProgress.jsx:63](views/AdminPvlProgress.jsx#L63) —
  человекочитаемое сообщение об ошибке.

**Вывод:** контракт уже корректный — при настоящей JWT-проблеме фронт
показывает баннер, а не молча идёт анонимно.

### Откуда тогда `"user":null` в алертах

[utils/clientErrorReporter.js:67-78](utils/clientErrorReporter.js#L67-L78) —
`getCurrentUserSummary()` читает `garden_currentUser` из localStorage,
возвращает `null` если ключа нет. Этот ключ ставится только в
[services/dataService.js:465, 499](services/dataService.js#L465)
(после `login()` и `register()`). Поэтому `"user":null` означает:

- юзер открыл `liga.skrebeyko.ru` без логина (публичный визит/SEO-бот), **или**
- сессия localStorage была сброшена / приватный режим, **или**
- error выстрелил **до** того, как `garden_currentUser` записался
  (короткое окно между `setAuthToken` и `setItem('garden_currentUser')`).

Это **не симптом** того, что JWT не отправляется.

### → Память надо обновить

В [memory/MEMORY.md](memory/MEMORY.md) (или связанной project-памяти)
есть утверждение про «silent anon-fallback при PGRST300/PGRST302» — оно
**устарело/неверно**. Предлагаю удалить или переформулировать: «в
прошлом обсуждался — фактически не реализован; сейчас контракт через
`POSTGREST_JWT_MISCONFIG` → maintenanceBanner».

---

## 2. Логи garden-auth за 24h

`ssh root@5.129.251.56`:

```
systemctl is-active garden-auth → active
journalctl -u garden-auth --since "24 hours ago" | grep -iE 'error|fail|401|403|expir|refused|timeout|jwt' → пусто
```

**Никаких отказов выдать токен / refresh / JWT-ошибок** за последние 24 часа.
Сервис здоров. В 07:00 МСК (когда были алерты) — тишина в логах auth'а.

Refresh endpoint **отсутствует**:

```
/opt/garden-auth/server.js routes:
  GET  /health, /api/health
  POST /api/client-error
  POST /storage/sign            (authMiddleware)
  POST /auth/register
  POST /auth/login
  GET  /auth/me                 (authMiddleware)
  POST /auth/request-reset
  POST /auth/reset
```

Токен живёт **30 дней**: [server.js:71](opt/garden-auth/server.js#L71)
`jwt.sign(..., { expiresIn: '30d' })`. Истечение токена — не наш
типичный кейс (на бордере месяца возможны единичные случаи, но не
«несколько раз в день»).

---

## 3. Что на самом деле в логе клиентских ошибок

Источник: `/var/log/garden-client-errors.log` на проде (тот же сервер).

За **3 дня (13–16 мая)** — **9 алертов** `syncTrackerAndHomework` /
`hydrate_mentor_links` (≈3/день, не «несколько раз в день каждый
день»). Все 100% — `TypeError: Failed to fetch` или `TypeError: Load
failed`. Все 100% — `"user":null`.

| ts (UTC)             | ip               | source                  | err           | UA                              |
|----------------------|------------------|-------------------------|---------------|---------------------------------|
| 2026-05-13 03:46:10  | 176.125.103.235  | pvlMockApi.syncTracker  | Failed to fetch | YaBrowser desktop            |
| 2026-05-14 15:33:52  | 91.215.89.244    | pvlMockApi.hydrate      | Load failed   | **iPhone iOS 18.7 Safari**     |
| 2026-05-14 15:51:17  | 91.215.89.244    | pvlMockApi.syncTracker  | Load failed   | **iPhone iOS 18.7 Safari**     |
| 2026-05-15 17:29:31  | 128.70.160.229   | pvlMockApi.syncTracker  | Load failed   | **iPhone iOS 18.7 Safari**     |
| 2026-05-15 17:35:15  | 128.70.160.229   | pvlMockApi.syncTracker  | Load failed   | **iPhone iOS 18.7 Safari**     |
| 2026-05-15 18:31:50  | 37.203.35.7      | pvlMockApi.syncTracker  | Failed to fetch | macOS Chrome 147             |
| 2026-05-15 18:31:59  | 37.203.35.7      | pvlMockApi.syncTracker  | Failed to fetch | macOS Chrome 147 (через 9 сек) |
| 2026-05-16 04:00:46  | 109.198.227.160  | pvlMockApi.syncTracker  | Failed to fetch | Win Chrome 148                |
| 2026-05-16 04:00:56  | 109.198.227.160  | pvlMockApi.hydrate      | Failed to fetch | Win Chrome 148 (через 10 сек) |

**Паттерны:**

1. **Пары** «syncTracker + hydrate с одного IP в течение 10 сек» —
   значит один пользователь, одна сессия, обе фоновые гидрации
   упали одновременно. Это типичный профиль для сетевого сбоя:
   браузер прервал все pending'и (например, переход на другую
   вкладку, спин-даун wifi, мобильник заснул).
2. **Доля мобильного Safari велика** (4 из 9). `TypeError: Load
   failed` — это **Safari-специфичный** текст для тех же причин, что
   и `Failed to fetch` в Chrome (network/abort/CORS), у Safari на
   iOS реальная флакушесть сети.
3. **Никаких HTTP-статусов** (`status: 401/403/PGRST`) в стеках нет
   — `fetch()` вообще не получил response. Эта семантика
   принципиально иная, чем «PostgREST вернул PGRST300».

**Вывод:** баг не серверный, не auth'овый. Это шум сетевых сбоев
клиентов, который мы сейчас alert'им в TG как «🚨».

---

## 4. Где в коде ловятся и как репортятся

[services/pvlMockApi.js:1340-1393](services/pvlMockApi.js#L1340-L1393)
— catch'и в `syncPvlActorsFromGarden`:

- `hydrate_mentor_links` (try/catch на [1340-1364](services/pvlMockApi.js#L1340-L1364)) —
  ловит `hydrateGardenMentorAssignmentsFromDb()`, шлёт `reportClientError`
  с `source: 'pvlMockApi.hydrate'`.
- `syncTrackerAndHomeworkFromDb` (try/catch на [1369-1393](services/pvlMockApi.js#L1369-L1393)) —
  то же самое, source `pvlMockApi.syncTracker`.

Оба catch'а помечены коммитом BUG-PVL-ADMIN-AS-MENTOR-EMPTY Variant B
— «silent fail — это плохо, шлём в MON-001». Это решение было
правильным для real DB failures, но **слишком чувствительно** к
network blip'ам клиента.

---

## 5. Архитектурное решение — переоценка вариантов A/B/C

Варианты из задачи (refresh/redirect-on-401) лечат **другой** баг —
«access-token истёк или невалиден». Этот сценарий у нас **не
наблюдается** (TTL 30 дней + чистые логи garden-auth). Поэтому:

### Вариант A (refresh-token endpoint)
**Не применим сейчас.** Refresh endpoint в garden-auth отсутствует,
TTL = 30d. Делать refresh-flow ради гипотетического истечения
30-дневного токена — преждевременная оптимизация. Когда понадобится
(если перейдём на короткий TTL) — добавим тогда.

### Вариант B (убрать silent fallback, при 401 → редирект + toast)
**Уже частично реализовано.** `App.jsx` при `has401` зовёт
`api.logout()` и сбрасывает currentUser. Toast добавить можно, но
**не решит наш текущий MON-001-spam** — там нет 401, там есть
`Failed to fetch`.

### Вариант C (гибрид)
Тоже про JWT-flow, не про наш случай.

### Что **на самом деле нужно** для BUG-PVL-SYNC-FAILED-TO-FETCH

Пред­лагаю разделить на 2 уровня и обсудить со стратегом:

**Уровень 1 — снизить шум алертов (минимально, быстро):**

В `clientErrorReporter` или прямо в catch'ах `pvlMockApi` —
**не репортить** в MON-001 ошибки, где `message` начинается с
`TypeError: Failed to fetch` / `TypeError: Load failed`, **если**
это фоновая гидрация (`source: pvlMockApi.*`). Они:

- ничего не ломают для юзера (это фоновый sync, UI деградирует
  тихо),
- не воспроизводимы (одноразовый network blip),
- забивают канал MON-001 и снижают сигнал для реальных
  серверных проблем.

Альтернатива: репортить, но в отдельный канал «низкоприоритетный»
или агрегированно (counter, а не 🚨).

**Уровень 2 — robustness гидрации (правильно, дольше):**

При `TypeError: Failed to fetch` в `pvlPostgrestApi.request`
сделать **1 retry с задержкой 1-2 сек** (только для GET'ов, без
side-effects). 90% network blip'ов — кратковременные, retry
поможет. Если retry тоже упал — тогда уже log+silent, без
MON-001-алерта.

Не делать retry на HTTP-ошибках (401/PGRST*) — они означают
содержательный отказ, retry бессмысленен.

**Уровень 3 — отдельно, потом, не в этом баге:**

Различать в MON-001 алертах **network-layer** (Failed to fetch /
Load failed / Aborted) от **server-layer** (401/403/5xx/PGRST*).
Сейчас всё свалено в одну кучу.

---

## 6. План фаз

### Фаза 1 — Sync с памятью и стратегом (СЕЙЧАС)

- [ ] Передать этот recon стратегу (claude.ai).
- [ ] Обновить [memory/project_pvl_postgrest_jwt.md] (или где
  лежит) — убрать «silent anon-fallback при PGRST300/302»,
  заменить на «throw POSTGREST_JWT_MISCONFIG → maintenanceBanner».
- [ ] Согласовать со стратегом: идём по Уровню 1 + 2, или сначала
  только Уровень 1?

### Фаза 2 — Recon доделать (если стратег попросит)

- [ ] Проверить, есть ли `AbortController` в `pvlPostgrestApi` /
  React effects, который мог бы рвать запросы при unmount → если
  есть, дополнить картину.
- [ ] Глянуть Caddy access-log на 5xx/timeout от PostgREST в те же
  таймстампы — точно ли network был чисто клиентский?

### Фаза 3 — Diff-on-review (после 🟢 на план)

- [ ] Если Уровень 1: маленький патч в `clientErrorReporter` или
  `pvlMockApi` catch'ах — фильтр по `message.startsWith('TypeError:
  Failed to fetch'/'TypeError: Load failed')`.
- [ ] Если Уровень 2: retry-wrapper вокруг `fetch()` в
  `pvlPostgrestApi.request`, только для GET, 1 попытка, 1.5s
  backoff, **только** на `TypeError`.
- [ ] Diff в `docs/_session/2026-05-16_NN_codeexec_bug_pvl_sync_diff.md`,
  ждать 🟢.

### Фаза 4 — Smoke

- [ ] DevTools → Network throttle «Offline» на 2 сек → проверить, что
  retry отрабатывает И что после двойного фейла ошибка пишется в
  consoleи **не** уходит в MON-001.
- [ ] 24h после деплоя — сравнить количество MON-001 алертов
  `pvlMockApi.*` с baseline (9/3 дня).

### Фаза 5 — Урок

- [ ] `docs/lessons/2026-05-MM-bug-pvl-sync-failed-to-fetch.md` по
  шаблону из `CLAUDE.md` (Симптом / Корневая причина / Почему
  пропустили / Как починили / Что проверять).

---

## 7. Открытые вопросы для стратега

1. **Подтвердить тёзис**: эти алерты — действительно «допустимый
   шум network blip'ов», а не серверная проблема, которую мы
   маскируем? Я считаю — да (logs auth'а чистые, паттерн
   мобильных пар, формат `TypeError` без статуса).
2. **Уровень амбиции**: глушим алерты (быстро, 1 файл) или ещё и
   retry'им (правильно, 2 файла)? Я бы делал оба, но если ужать —
   сначала глушение, потом retry отдельным PR.
3. **Обновить ли память про silent-fallback**: я уверен в том,
   что её надо переписать (код реально другой). Подтверди и я
   обновлю.
4. **Memory cleanup**: возможно стоит проверить, нет ли других
   таких же «зомби-фактов» из старых решений, которые в коде уже
   изменены.

---

## Файлы, к которым обращался recon

- [services/pvlPostgrestApi.js](services/pvlPostgrestApi.js) — 721 строка, основной API client
- [services/dataService.js](services/dataService.js) — `postgrestFetch`, `authFetch`, login/logout
- [services/jwtUtils.js](services/jwtUtils.js) — `getAuthUserId()` из JWT sub
- [services/pvlMockApi.js:1340-1424](services/pvlMockApi.js#L1340-L1424) — catch'и hydrate/syncTracker
- [utils/clientErrorReporter.js](utils/clientErrorReporter.js) — `reportClientError`, `user:null` логика
- [App.jsx:103-198](App.jsx#L103-L198) — init flow, обработка `POSTGREST_JWT_MISCONFIG`/`401`

Прод:
- `/opt/garden-auth/server.js` — endpoints, TTL 30d, без refresh
- `/var/log/garden-client-errors.log` — 9 PVL-алертов за 3 дня
- `journalctl -u garden-auth` за 24h — чисто
