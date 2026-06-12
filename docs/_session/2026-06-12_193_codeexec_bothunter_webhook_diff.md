# Diff на ревью — приёмник BotHunter-вебхука для авто-паузы (FEAT-015)

**Дата:** 2026-06-12. **Автор:** codeexec. **Статус:** написано локально, тесты 31/31 зелёные. **Жду 🟢 на деплой.**
**Handover:** `docs/_session/2026-06-11_192_strategist_autopause_bothunter_handover.md`

## 1. TL;DR

Новый endpoint `POST /webhooks/bothunter?token=…` принимает `{username, event}` от блока «Запрос во вне» BotHunter, матчит по `profiles.telegram` и переиспользует существующий `applyAccessState`:
- `event:'expired'` → `finish` → `paused_expired` (если нет `paused_manual`/`exempt`);
- `event:'active'` → `payment_success` → `active` + `paid_until = now()+31д`.

Лог пишется в `billing_webhook_logs` с **`provider='bothunter'`** (параметризовал провайдера, прежнее prodamus-поведение не тронуто). Тесты на нормализацию username и маппинг событий.

**Изменено 3 файла:** `push-server/billingLogic.mjs`, `push-server/server.mjs`, `push-server/billingLogic.test.mjs` (+ `.env.example`).

## 2. Дизайн-решения

1. **Auth — токен в query, не в заголовке.** BotHunter «Запрос во вне» может не уметь кастомные заголовки. Сравнение с `BOTHUNTER_WEBHOOK_TOKEN`; пустой env → **503** (endpoint выключен, как `bothunter=off`). Неверный токен → **403**.
2. **Нормализация username — одна функция на обе стороны.** `normalizeTelegramUsername()` применяется и к входящему `username`, и к `profiles.telegram`. Гарантирует «та же нормализация». Инвайт-ссылка `t.me/+XXX` (и `joinchat`) → `null`:
   - на входе → **422** (это не username);
   - на стороне БД (прод-запись `t.me/+...`) → `null` → **никогда не матчится** (требование 3).
3. **Матч в JS, а не в SQL.** SQL-prefilter `lower(telegram) like '%username%'` сужает выборку, точное совпадение подтверждается той же `normalizeTelegramUsername` в JS. Бесхитростно и устойчиво к разнобою префиксов; webhook редкий, профилей мало.
4. **Параметризация провайдера.** `persistWebhookLog` и `applyAccessState` получили опциональный `provider` (дефолт `PRODAMUS_PROVIDER_NAME`). Prodamus-вызовы провайдер не передают → их поведение байт-в-байт прежнее. BotHunter передаёт `'bothunter'` → отдельные строки в `subscriptions`/`billing_webhook_logs`.
5. **Идемпотентность с гранулярностью «день».** `external_id = '<event>:<username>:<YYYY-MM-DD>'`. Повтор того же события за день → дедуп через partial-unique-index (`is_processed` → `duplicate:true`, не двигает `paid_until` дважды). Ежемесячное продление (`active` в новом месяце) — новый `external_id` → обрабатывается. Re-apply того же статуса безопасен на уровне БД.
6. **Роль-гейт leader/mentor.** Профиль не leader/mentor → **202** `role_not_eligible` (требование 4). `isExemptRole` внутри `applyAccessState` дополнительно защищает admin/applicant; `auto_pause_exempt` (бартер) логируется как `SKIPPED_BY_AUTO_PAUSE_EXEMPT`.
7. **Приоритет ручной паузы сохранён.** Для `paused_manual` `deriveAccessMutation('finish')` оставляет `paused_manual` — Пограницкая, поставленная вручную ⏸, такой и останется (требование smoke b).

## 3. Полный diff

### `push-server/billingLogic.mjs` — +2 экспорта

```diff
+// FEAT-015 BotHunter path: матч по Telegram-username, а не email.
+export const normalizeTelegramUsername = (input) => {
+  let s = String(input ?? '').trim();
+  if (!s) return null;
+  s = s.replace(/^https?:\/\//i, '');
+  s = s.replace(/^(www\.)?(t\.me|telegram\.me|telegram\.dog)\//i, '');
+  s = s.replace(/^@+/, '');
+  s = s.split(/[/?#]/)[0].trim();
+  if (!s) return null;
+  if (s.startsWith('+')) return null;            // инвайт t.me/+XXXX
+  const lower = s.toLowerCase();
+  if (lower === 'joinchat') return null;         // старый инвайт
+  if (!/^[a-z0-9_]+$/.test(lower)) return null;  // валидный TG-логин
+  return lower;
+};
+
+export const mapBotHunterEvent = (event) => {
+  const e = String(event ?? '').trim().toLowerCase();
+  if (e === 'expired') return 'finish';
+  if (e === 'active') return 'payment_success';
+  return null;
+};
+
 export const deriveAccessMutation = ({ eventName, currentAccessStatus, autoPauseExempt = false }) => {
```

### `push-server/server.mjs`

```diff
-import { classifyProdamusEvent, deriveAccessMutation, isExemptRole } from './billingLogic.mjs';
+import { classifyProdamusEvent, deriveAccessMutation, isExemptRole, normalizeTelegramUsername, mapBotHunterEvent } from './billingLogic.mjs';

   DEFAULT_BOT_RENEW_URL = '',
-  BILLING_TIMEZONE = 'Europe/Warsaw'
+  BILLING_TIMEZONE = 'Europe/Warsaw',
+  BOTHUNTER_WEBHOOK_TOKEN = '',
+  BOTHUNTER_PROVIDER_NAME = 'bothunter'
 } = process.env;
```

```diff
-const persistWebhookLog = async (client, { eventName, externalId, payload, signatureValid }) => {
+const persistWebhookLog = async (client, { provider = PRODAMUS_PROVIDER_NAME, eventName, externalId, payload, signatureValid }) => {
   ...
-    [PRODAMUS_PROVIDER_NAME, eventName, externalId, JSON.stringify(payload || {}), Boolean(signatureValid)]
+    [provider, eventName, externalId, JSON.stringify(payload || {}), Boolean(signatureValid)]
   ...
-    [PRODAMUS_PROVIDER_NAME, externalId]   // fallback select
+    [provider, externalId]

-const applyAccessState = async (db, profile, { eventName, paidUntil, payload, customerIds }) => {
+const applyAccessState = async (db, profile, { provider = PRODAMUS_PROVIDER_NAME, eventName, paidUntil, payload, customerIds }) => {
   ...
   // оба insert в public.subscriptions:
-    [profile.id, PRODAMUS_PROVIDER_NAME, subscriptionId || `${profile.id}`, ...]
+    [profile.id, provider, subscriptionId || `${profile.id}`, ...]
```

Новый handler (после регистрации prodamus-роутов):

```diff
+const bothunterEnabled = Boolean(BOTHUNTER_WEBHOOK_TOKEN);
+
+const handleBotHunterWebhook = async (req, res) => {
+  if (!bothunterEnabled) return res.status(503).json({ error: 'BotHunter webhook is not configured' });
+  const token = String(req.query?.token || '');
+  if (!token || token !== BOTHUNTER_WEBHOOK_TOKEN) return res.status(403).json({ error: 'Forbidden' });
+
+  const body = req.body || {};
+  const username = normalizeTelegramUsername(body.username);
+  if (!username) return res.status(422).json({ error: 'invalid_username', ... });
+  const eventName = mapBotHunterEvent(body.event);
+  if (!eventName) return res.status(422).json({ error: 'unknown_event', ... });
+
+  const day = new Date().toISOString().slice(0, 10);
+  const externalId = `${eventName}:${username}:${day}`.slice(0, 512);
+  const lockKey = `billing:${BOTHUNTER_PROVIDER_NAME}:${externalId}`;
+  const client = await pool.connect();
+  try {
+    await client.query('begin');
+    await client.query('select pg_advisory_xact_lock(hashtext($1))', [lockKey]);
+    const log = await persistWebhookLog(client, { provider: BOTHUNTER_PROVIDER_NAME, eventName, externalId, payload: body, signatureValid: true });
+    if (!log?.id) { await client.query('rollback'); return res.status(500)...; }
+    if (log.is_processed) { await client.query('commit'); return res.json({ ok:true, duplicate:true, ... }); }
+
+    const { rows } = await client.query(
+      `select id, role, telegram, access_status, auto_pause_exempt from public.profiles
+        where telegram is not null and lower(telegram) like '%' || $1 || '%'`, [username]);
+    const profile = rows.find((r) => normalizeTelegramUsername(r.telegram) === username) || null;
+
+    if (!profile) { markWebhookLogState(... 'Profile not found (replayable)'); commit; return res.status(202).json({ processed:false, reason:'profile_not_found' }); }
+    const role = String(profile.role || '').toLowerCase();
+    if (role !== 'leader' && role !== 'mentor') { markWebhookLogState(... `SKIPPED_BY_ROLE:${role}`); commit; return res.status(202).json({ processed:false, reason:'role_not_eligible' }); }
+
+    await applyAccessState(client, profile, { provider: BOTHUNTER_PROVIDER_NAME, eventName, paidUntil: null, payload: body, customerIds: { subscriptionId:null, customerId:null } });
+
+    let skipReason = null;
+    if (eventName === 'finish') {
+      if (isExemptRole(profile.role)) skipReason = 'SKIPPED_BY_ROLE';
+      else if (Boolean(profile.auto_pause_exempt)) skipReason = 'SKIPPED_BY_AUTO_PAUSE_EXEMPT';
+    }
+    await markWebhookLogState(client, log.id, { processed: true, errorText: skipReason });
+    await client.query('commit');
+    return res.json({ ok:true, processed:true, event:eventName, username, profile_id: profile.id });
+  } catch (e) { await client.query('rollback').catch(()=>{}); return res.status(500)...; }
+  finally { client.release(); }
+};
+
+app.post('/webhooks/bothunter', handleBotHunterWebhook);
```

```diff
-  console.log(`Server started on :${PORT} (push=…, prodamus=…)`);
+  console.log(`Server started on :${PORT} (push=…, prodamus=…, bothunter=${bothunterEnabled ? 'on' : 'off'})`);
```

### `push-server/billingLogic.test.mjs` — +7 тестов
Нормализация (@/name/ссылки/регистр/trim → логин; trailing slash/query/hash; инвайт+мусор → null; согласованность двух сторон), `mapBotHunterEvent`, и сквозная проверка маппинг↔`deriveAccessMutation` (включая приоритет `paused_manual`).

### `push-server/.env.example`
```diff
+# FEAT-015 BotHunter авто-пауза: токен в query ?token=… (пустой → endpoint отдаёт 503)
+BOTHUNTER_WEBHOOK_TOKEN=
```

## 4. Что НЕ затронуто
- `handleProdamusWebhook` и его роуты — без изменений (провайдер по дефолту = prodamus).
- `prodamusVerify.mjs`, `upcomingApi.mjs`, `runNightlyExpiryReconcile` — не тронуты.
- Схема БД — миграций нет, используются существующие `billing_webhook_logs` / `subscriptions` / `profiles`.
- Прод `.env` — rsync его не трогает; `BOTHUNTER_WEBHOOK_TOKEN` добавляется руками (шаг 1 деплоя).

## 5. Edge-case'ы
- Пустой `BOTHUNTER_WEBHOOK_TOKEN` на проде до добавления → endpoint **503** (безопасный дефолт, не открыт).
- `username` уже ссылка (`body.username = "https://t.me/x"`) — нормализуется корректно.
- Кириллица/дефис/пробелы в логине → `null` → 422 (TG-логины только `[a-z0-9_]`).
- Несколько профилей с похожим telegram → JS-`find` берёт первый с точным совпадением нормализации.
- Запись-исключение `t.me/+...` в проде → `normalize=null` → не матчится никогда.
- Повторный одинаковый запрос за день → `duplicate:true` (200), статус уже выставлен — не ломается.

## 6. Apply-порядок (после 🟢)
1. **Прод `.env`:** добавить в `/opt/push-server/.env` строку
   `BOTHUNTER_WEBHOOK_TOKEN=e9c83ef459ee2af61207e6d2f31f64eda4bcb15f37b8ede984c9221c077f857e`
   (append, не перезаписывать файл).
2. `git add` только: `push-server/billingLogic.mjs push-server/server.mjs push-server/billingLogic.test.mjs push-server/.env.example` + этот diff-док.
3. Commit (см. §7) → `git push origin main`.
4. `rsync` push-server → `/opt/push-server/` (exclude `node_modules`, `*.test.mjs`, `.env`, `package-lock.json`).
5. `ssh systemctl restart push-server.service` + verify active + `journalctl` tail (ждём `bothunter=on`).
6. External smoke (curl):
   - (a) неверный токен → **403**;
   - (b) `username=olgapogranitskaya&event=expired` → **200** `processed:true`; профиль **остаётся `paused_manual`**; в `billing_webhook_logs` строка `provider='bothunter'`;
   - (c) `username=nonexistent` → **202** `processed:false`.
7. Отчёт о деплое в `_session/..._deployed.md`.

## 7. Предлагаемый commit message
```
feat(push-server): BotHunter webhook receiver for subscription auto-pause (FEAT-015)

POST /webhooks/bothunter?token=… matches {username,event} against
profiles.telegram and reuses applyAccessState (expired→finish,
active→payment_success). Logs under provider='bothunter' (parameterized
persistWebhookLog/applyAccessState; prodamus path unchanged). Token auth
in query (BotHunter «Запрос во вне» can't set custom headers); empty env
→ 503. Telegram username normalization + event mapping with unit tests;
invite links (t.me/+…) rejected. Day-grained idempotency, leader/mentor
role gate, manual-pause priority preserved.
```

## Итоговое для блока «Запрос во вне» BotHunter
- **URL (окончание подписки):** `https://push.skrebeyko.ru/webhooks/bothunter?token=e9c83ef459ee2af61207e6d2f31f64eda4bcb15f37b8ede984c9221c077f857e`
  Метод **POST**, тело JSON: `{ "username": "{username}", "event": "expired" }`
- **URL (возобновление):** тот же, тело `{ "username": "{username}", "event": "active" }`
- **Токен:** `e9c83ef459ee2af61207e6d2f31f64eda4bcb15f37b8ede984c9221c077f857e`
</content>
</invoke>
