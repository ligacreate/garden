# RECON FEAT-015 — Prodamus webhook → авто-пауза ведущей

**Дата:** 2026-05-15
**Тип:** разведка перед планом, кода нет.
**Источник задачи:** prompt от Ольги 2026-05-16.
**Главный вывод одной строкой:** *95% инфраструктуры FEAT-015 уже написано в репо и почти задеплоено* — Ольга может не знать, что её «вариант А упрощённый» отменяет работу прошлой итерации.

---

## 1. Текущее состояние инфраструктуры

### 1.1. Push-server — задеплоен и работает

| Параметр | Значение |
|---|---|
| Hostname | `push.skrebeyko.ru` (отдельный сервер, **не** 5.129.251.56) |
| Health | `GET /health` → `{"ok":true}` ✅ |
| Webhook endpoint | `POST /api/billing/prodamus/webhook` (alias `/webhooks/prodamus`) |
| **Webhook сейчас** | `503 {"error":"Webhook disabled"}` — `PRODAMUS_WEBHOOK_ENABLED=false` |
| Reverse proxy | Caddy → `localhost:8787` |
| Systemd unit | `push-server.service` (НЕ `garden-push`) |
| Деплой | 2026-05-11, журнал [docs/_session/2026-05-11_06_codeexec_push_server_deployed.md](../_session/2026-05-11_06_codeexec_push_server_deployed.md) |

### 1.2. Webhook handler — полностью реализован

Файл [push-server/server.mjs](../../push-server/server.mjs), 436 строк. Содержит:

- **Verification:** [push-server/prodamusVerify.mjs](../../push-server/prodamusVerify.mjs) — HMAC SHA256/SHA1/MD5 + sorted-base, 5 кандидатов сверяются с `signature`/`sign`/`hash` в payload.
- **Event classifier:** [push-server/billingLogic.mjs](../../push-server/billingLogic.mjs) — `classifyProdamusEvent(payload)` → `{payment_success, auto_payment, deactivation, finish, unknown}`.
- **Customer match:** `findProfileByCustomer({email, phone, extId})` — 3-стадийный поиск: `extId → email → phone`.
- **Idempotency:** `pg_advisory_xact_lock(hashtext(externalId))` + `ON CONFLICT (provider, external_id) DO NOTHING` в `billing_webhook_logs`.
- **State machine:** `deriveAccessMutation()` — `paused_manual` НЕ перетирается успешным платежом (это и есть «защита от автопаузы», которую Ольга сейчас просит).
- **Cross-service logout:** при finish/deactivation вызывает `POST /auth/logout-all` в auth-service (если `paused_manual` — пропускает).
- **Nightly reconcile:** запускается каждые 24ч, переводит overdue юзеров (paid_until < now) в `paused_expired`.
- **Тесты:** `billingLogic.test.mjs` есть, прогоняются `npm test`.

### 1.3. Миграция 21 — НЕ applied на проде

| Где | Статус |
|---|---|
| Файл | [migrations/21_billing_subscription_access.sql](../../migrations/21_billing_subscription_access.sql) — 169 строк, готова |
| Прод колонки `access_status`, `subscription_status`, `paid_until`, `prodamus_*`, `session_version` | **0 в `information_schema.columns`** — миграция не запущена |
| Прод таблицы `subscriptions`, `billing_webhook_logs` | **Нет в `pg_tables`** |
| Что блокирует webhook | Если включить webhook, на первом же event-е будет SQL error: `relation "public.billing_webhook_logs" does not exist` |

Миграция 21 включает в себя:
- 9 новых колонок в `profiles` (access_status, subscription_status, paid_until, last_payment_at, prodamus_subscription_id, prodamus_customer_id, last_prodamus_event, last_prodamus_payload, bot_renew_url, session_version).
- 2 CHECK constraints (access_status ∈ {active, paused_expired, paused_manual}; subscription_status ∈ {active, overdue, deactivated, finished}).
- Таблицы `subscriptions` (история подписок per-user) и `billing_webhook_logs` (audit raw event payloads).
- Helper `has_platform_access(target_user uuid) → boolean` (SECURITY DEFINER).
- **Trigger zone:** `RESTRICTIVE` policies на 13 таблицах (`profiles`, `meetings`, `events`, `goals`, `knowledge_base`, `practices`, `clients`, `scenarios`, `course_progress`, `messages`, `news`, `birthday_templates`, `push_subscriptions`) — все используют `has_platform_access(auth.uid())`.

⚠️ **RESTRICTIVE policies = breaking change.** После apply миграции 21, **все юзеры** с `access_status != 'active'` (и не админы) **перестают** видеть/писать данные. Дефолт колонки = `'active'` (`add column ... default 'active'`), так что все 50 active профилей сразу получат доступ. Но любой юзер, для которого что-то пойдёт не так с access_status, окажется заблокирован.

### 1.4. Прошлая итерация: что было сделано и что не закрыто

[docs/journal/subscription-task-final-status.md](subscription-task-final-status.md):

**Закрыто:**
- Prodamus webhook integration в push-server ✅
- Server-side access block через PostgREST + RLS ✅
- Разделение `paused_manual` vs `paused_expired` ✅
- Subscription renewal screen UX ✅
- Nightly reconcile fallback ✅
- Webhook idempotency ✅
- Replayable `profile_not_found` handling ✅
- Removed hardcoded email bypass ✅
- `subscriptions.updated_at` trigger ✅
- SQL replay scenarios: [docs/prodamus-replay-scenarios.sql](../prodamus-replay-scenarios.sql) ✅
- RLS audit script: `docs/rls-audit-check.sql`

**НЕ закрыто (внешняя зависимость):**
- Hard invalidation уже выпущенных JWT по `session_version` в auth-service. Patch-инструкции: [docs/journal/auth-service-session-version-patch.md](auth-service-session-version-patch.md) + [docs/journal/auth-service-handoff.md](auth-service-handoff.md).

Без session_version invalidation: после `deactivation` юзер с уже-выпущенным JWT может продолжать делать запросы до истечения токена. RLS гард `has_platform_access()` всё равно его остановит на уровне БД — он получит 403/empty results, но active session жив.

---

## 2. Ответы на пункты recon Ольги

### 2.1. Prodamus webhook API — формат событий

WebSearch не нашёл публичной официальной документации. **Источники правды для этого проекта:**

- [push-server/prodamusVerify.mjs](../../push-server/prodamusVerify.mjs) — что мы умеем верифицировать.
- [docs/prodamus-replay-scenarios.sql](../prodamus-replay-scenarios.sql) — реальные примеры payload'ов.
- [push-server/billingLogic.mjs:1-8](../../push-server/billingLogic.mjs#L1-L8) — известные значения `event` field.

**События** (`flat.event` или `flat.type` или `flat.status`):

| Класс (наш) | Триггеры в payload |
|---|---|
| `payment_success` | success / paid / payment_success / completed |
| `auto_payment` | auto_payment / autopayment / recurrent |
| `deactivation` | deactivation / deactivate |
| `finish` | finish / finished / ended / stop |
| `unknown` | всё остальное → лог + ignore |

**Payload (form-encoded или JSON):**
```json
{
  "event": "auto_payment",
  "event_id": "evt-pay-001",        // для idempotency
  "email": "user@example.com",      // primary match
  "customer_id": "12345",           // вторичный match
  "subscription_id": "sub-789",
  "paid_until": "2030-12-31T00:00:00Z",
  "signature": "<hex>"
}
```

**Identifier:**
- `event_id` / `notification_id` / `transaction_id` / `payment_id` / `order_id` — **любой** из них для дедупа. Если нет — fallback к sha256(payload).
- Customer: 3-уровневый match `external_id || user_id || client_id` → `email` → `phone` (`telegram` поле).

**Signature:** HMAC SHA256 от sorted-base или raw JSON, secret = `PRODAMUS_SECRET_KEY` из dashboard. Кандидатов 5 — пробуем все, любой совпавший = валидно. Это устойчиво к смене формата на стороне Prodamus.

### 2.2. Идентификация профилей — email match готов

**Прод данные (2026-05-15):**
- `profiles` total: 56 (50 active + 6 suspended)
- Профилей с пустым/NULL email: **0**
- Дубль email'ов (case-insensitive): **0**

✅ Email — надёжный primary match. Существующий `findProfileByCustomer` уже:
1. Сначала пробует `extId` (id::text или prodamus_customer_id).
2. Потом email (case+trim insensitive).
3. Потом phone (regexp_replace в telegram).

**Open question:** в Garden у нас 56 профилей, но платящих ведущих ~40. Webhook прилетит для 40 → match по email → 16 профилей не получат webhook'и (это бесплатные роли: applicant/intern/admin). Это нормально, обработчик их просто не тронет.

### 2.3. Куда поселить webhook handler

Уже там: **push-server/server.mjs**. Запущен на push.skrebeyko.ru, отдельный systemd unit.

⚠️ Ольга в задании пишет «Endpoint в garden-auth». Это **не нужно** — handler уже в push-server. Возможно, Ольга это забыла, потому что в BACKLOG FEAT-015 (стр. 265) написано «Webhook endpoint в `garden-auth` (Express)» — это устаревший контекст до прошлой итерации.

### 2.4. Существующее использование profiles.status

**Где читается/пишется:**

| Слой | Файл | Что делает |
|---|---|---|
| UI admin toggle | [views/AdminPanel.jsx:1236-1252](../../views/AdminPanel.jsx#L1236) | `api.toggleUserStatus(u.id, isSuspended ? 'active' : 'suspended')` |
| API client | services/dataService.js | `toggleUserStatus()` — PATCH profiles.status |
| Trigger source | phase21 миграция | sync_meeting_to_event() читает owner.status='suspended' и не зеркалит events |
| Trigger consumer | `on_profile_status_change_resync_events` ([прод подтверждено]) | `AFTER UPDATE OF status` — при любом изменении status пересчитывает зеркала events для этого user_id |

✅ **Триггер на проде ЕСТЬ и работает.** `WHEN (old.status IS DISTINCT FROM new.status)`. Любой UPDATE status → resync events. Webhook handler нашего FEAT-015 просто пишет profiles.status, всё остальное автоматом.

⚠️ **Несовместимость:** push-server/server.mjs **не пишет** в `profiles.status`. Он пишет в `access_status`, `subscription_status`, `paid_until` (которых нет на проде). То есть текущий код **никогда не дёрнет** триггер `on_profile_status_change_resync_events`. Это и есть архитектурная развилка (см. §3).

### 2.5. Bootstrap данных

**Прод сейчас:**
```
status     | count
-----------+-------
active     |    50
suspended  |     6
```

Ольга упомянула «~40 платящих». Реальность: 50 active. Дельта 10 — вероятно, не-платящие active роли (admin, applicant, intern, mentor — они не платят подписку). Уточнить у Ольги.

«Забытые active без оплаты» (масштаб ручного труда) — нельзя ответить без paid_until. Сейчас этого поля нет на проде. После apply миграции 21 + бэкфилла из Prodamus — будет видно.

---

## 3. Архитектурная развилка — главное решение

Ольга в задании просит **«вариант А упрощённый, только profiles.status, новые колонки manual_override/note/until»**. Это прямое противоречие с уже написанным кодом, который работает с `access_status` (paused_manual ≈ manual_override концептуально).

### 3.1. Путь A — упрощённый по prompt'у Ольги

**Что делаем:**
1. Apply мини-миграцию: только `manual_override`, `manual_override_note`, `manual_override_until` + `prodamus_webhook_log`.
2. Переписать [push-server/server.mjs](../../push-server/server.mjs) `applyAccessState()` под `profiles.status` ('active'/'suspended'). Убрать access_status, subscription_status, paid_until logic.
3. Переписать `deriveAccessMutation()` — другая state machine.
4. Удалить (или не использовать) `subscriptions` table logic, `bot_renew_url`, `session_version` bump, cross-service logout.
5. Cron auto-expire `manual_override_until` (отдельный процесс или at-read в webhook).
6. Admin UI новый: «Manual override» секция в карточке профиля (не использовать существующий paused_manual UI, потому что его нет).

**Бюджет:** ~3 сессии (включая UI admin).
**Что выкидываем:** ~80% готового кода в push-server (access_status logic, subscriptions, paid_until, session_version, RESTRICTIVE policies, paused_manual concept).
**Плюс:** меньший scope, меньше колонок, нет breaking change через RESTRICTIVE policies.
**Минус:** дублирование работы (manual_override = paused_manual концептуально), теряем историю платежей (subscriptions), теряем nightly reconcile логику для overdue.

### 3.2. Путь B — закрыть готовое (recommended)

**Что делаем:**
1. Apply миграцию 21 (`migrations/21_billing_subscription_access.sql`) — она идемпотентна (`if not exists` везде). **С backfill `access_status='active'`** для всех существующих профилей до RESTRICTIVE-блока.
2. Apply patch session_version в auth-service (внешняя задача из subscription-task-final-status.md). **БЛОКЕР** — без него юзеры с старыми JWT остаются с доступом до истечения токена.
3. Включить `PRODAMUS_WEBHOOK_ENABLED=true` + проставить `PRODAMUS_SECRET_KEY` из dashboard Prodamus.
4. Setup webhook URL в Prodamus dashboard.
5. **Add bridge: profiles.status ← access_status.** Триггер в БД: при `access_status='paused_expired'` → `status='suspended'`, при `access_status='active'` → `status='active'`. Это сохраняет обратную совместимость с `on_profile_status_change_resync_events` и AdminPanel toggle.
6. Admin UI: переименовать существующий paused_manual UX в «manual_override» терминологии (или оставить как есть — концепт тот же).
7. End-to-end smoke по [docs/prodamus-replay-scenarios.sql](../prodamus-replay-scenarios.sql).

**Бюджет:** ~1.5 сессии (миграция + bridge trigger + smoke; auth-service patch — отдельный канал).
**Плюс:** используем 95% готового кода, истории платежей, nightly reconcile, session_version invalidation.
**Минус:** auth-service patch — внешняя зависимость (нужен доступ к auth-service репо, отдельному агенту). RESTRICTIVE policies — потенциальный риск (надо точно backfill access_status). Большая модель (10 колонок vs 3).

### 3.3. Путь C — гибрид (compromise)

**Что делаем:**
1. Apply из миграции 21 **только колонки + 2 таблицы**, БЕЗ helper has_platform_access() и БЕЗ RESTRICTIVE policies.
2. Webhook handler — оставляем существующий, **но НЕ полагаемся** на RLS access guard. Доступ контролируется только через `profiles.status` + триггер resync_events (как сейчас вручную работает).
3. Add bridge trigger: `access_status` change → `profiles.status` (как в Пути B).
4. Не делать auth-service patch — нам не нужен session_version, потому что доступ режется через resync_events (events просто исчезают из публичного фида), а не через JWT.
5. Manual override: использовать существующий `paused_manual` (или добавить `manual_override` как алиас; решить по UX).

**Бюджет:** ~2 сессии.
**Плюс:** используем готовый код, нет breaking change через RESTRICTIVE, нет внешней зависимости от auth-service.
**Минус:** несогласованная модель (есть access_status, но он не RLS-гард), нужно объяснять разработчикам что это «лог-only» поле.

### 3.4. Моя рекомендация

**Путь B**, если auth-service patch достижим (есть ли доступ к репо/команде auth-service?).
Если auth-service patch недостижим в этом цикле → **Путь C** (закрыть FEAT-015 без session_version invalidation, заведя его как technical debt).
**Путь A** — только если есть продуктовая причина выкинуть paused_manual концепцию (например, Ольга считает что access_status модель неправильная). Но я не вижу такой причины — paused_manual = manual_override.

---

## 4. План фаз (черновой, для всех 3 путей)

### 4.1. Общие фазы (одинаковые во всех путях)

| Фаза | Что | Бюджет |
|---|---|---|
| Phase 0 | RECON (этот документ) | ✅ done |
| Phase X | Решение Ольги по A/B/C | блокер |

### 4.2. Если Путь B (recommended)

| Фаза | Что | Бюджет |
|---|---|---|
| B1 | Pre-migration audit: backfill `access_status='active'` для всех 50 active + 6 suspended (явный UPDATE до apply RESTRICTIVE) | 0.2 |
| B2 | Apply migration 21 на проде, VERIFY 13 RESTRICTIVE policies + colonки + helper | 0.3 |
| B3 | Bridge trigger: `BEFORE UPDATE OF access_status ON profiles` → если paused_expired/paused_manual → `NEW.status='suspended'`; если active → `NEW.status='active'` | 0.2 |
| B4 | Smoke на staging с тестовым платежом (если есть staging Prodamus) или dry-run replay через `docs/prodamus-replay-scenarios.sql` | 0.3 |
| B5 | Прод: проставить `PRODAMUS_SECRET_KEY` + `PRODAMUS_WEBHOOK_ENABLED=true` в `/opt/push-server/.env`, restart push-server.service | 0.1 |
| B6 | Setup webhook URL в Prodamus dashboard, тестовый платёж от тестового юзера | 0.2 |
| B7 | **Внешний канал:** patch session_version в auth-service по [docs/auth-service-session-version-patch.md](auth-service-session-version-patch.md). Не блокирует MVP, но без него — каждый деактивированный юзер живёт до истечения JWT. | 0.5 (внешний агент) |
| B8 | Admin UI: секция «Manual override» в карточке профиля (это `access_status='paused_manual'` toggle + причина + дата автоснятия) | 0.5 |
| B9 | Admin UI: таблица «Профили с manual_override» в AdminPanel | 0.3 |
| B10 | Smoke + урок | 0.2 |

**Итого B (без B7): ~2.3 сессии.** B7 — параллельный канал, не блокер MVP.

### 4.3. Если Путь A (упрощённый)

| Фаза | Что | Бюджет |
|---|---|---|
| A1 | Минимиграция: только manual_override колонки + prodamus_webhook_log таблица | 0.3 |
| A2 | Переписать push-server/server.mjs applyAccessState() под profiles.status. Убрать access_status, subscriptions, session_version, cross-service logout, nightly reconcile | 0.7 |
| A3 | Переписать billingLogic.mjs deriveAccessMutation() | 0.2 |
| A4 | Cron auto-expire manual_override_until | 0.3 |
| A5 | Setup .env + Prodamus dashboard | 0.2 |
| A6 | Admin UI manual_override: секция в профиле + таблица | 0.7 |
| A7 | E2E smoke | 0.3 |
| A8 | Урок | 0.1 |

**Итого A: ~2.8 сессии.** Дороже потому что переписываем готовый код.

### 4.4. Если Путь C (гибрид)

| Фаза | Что | Бюджет |
|---|---|---|
| C1 | Урезанная миграция 21: только колонки + 2 таблицы + helper, БЕЗ RESTRICTIVE policies | 0.4 |
| C2 | Bridge trigger access_status → status (как в B3) | 0.2 |
| C3 | Backfill access_status='active' для всех существующих | 0.1 |
| C4 | Setup .env + Prodamus dashboard | 0.2 |
| C5 | E2E smoke по replay-scenarios | 0.3 |
| C6 | Admin UI manual_override (используем paused_manual внутри, label «Manual override» снаружи) | 0.5 |
| C7 | Урок | 0.1 |

**Итого C: ~1.8 сессии.** Самый быстрый, без auth-service патча.

---

## 5. Открытые вопросы для Ольги

1. **🔴 Главное: путь A / B / C?** Знала ли Ольга, что push-server и миграция 21 уже почти готовы? Это меняет scope с 4-5 сессий на 1.5-2.
2. **auth-service patch session_version** — есть ли доступ к репо auth-service? Кто его поддерживает (другая команда / она сама / Claude в другой репе)? Это блокер для Пути B.
3. **Доступ к Prodamus dashboard:** есть ли у Claude (Ольги) права настроить webhook URL и получить `PRODAMUS_SECRET_KEY`? Какая ставка на staging vs прод (Prodamus поддерживает sandbox?).
4. **Тестовый платёж:** Прокатывать на реальном платеже Ольги (~монетка) или есть тестовый customer в Prodamus?
5. **Несоответствие 50 active vs 40 платящих:** какая роль не платит? `applicant` (10 человек?) — роль абитуриентов, не платит. `admin` (3 человека) — внутренняя команда. `intern`/`mentor` — платят?
6. **«Список ведущих с manual_override» в AdminPanel** — отдельная страница или фильтр в существующем списке пользователей? UX-вопрос.
7. **Auto-expire manual_override_until** — cron в push-server (каждые 24ч в `runNightlyExpiryReconcile`-стиле) или at-read в webhook handler? Я бы делал cron — at-read страдает если webhook не приходит.

---

## 6. Что я нашёл «между делом»

- **Нет `garden-push` systemd unit на проде**, есть `push-server.service`. README.md проекта упоминает «Push-сервер: Node.js + Express 5 + Web Push (VAPID), порт 8787» — корректно.
- **VITE_PUSH_URL fallback на AUTH_URL** ([services/dataService.js:10](../../services/dataService.js#L10)) — если push.skrebeyko.ru недоступен, фронт идёт на auth.skrebeyko.ru. Хороший fail-over для public read-only API.
- **`docs/prodamus-subscription-access-report.pdf`** — есть полный технический отчёт прошлой итерации в PDF (не читал, рекомендую Ольге глянуть).
- **`PRODAMUS_ALLOWED_IPS`** в .env push-server — пустой. Полагаемся только на signature verification. Если Prodamus публикует список своих IP — стоит добавить как defense-in-depth.

---

## 7. Что ждёт следующий шаг

Решение Ольги по А/B/C → план сессий → код. До решения — ничего не пишу.
