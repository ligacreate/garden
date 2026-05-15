# FEAT-015 — Prodamus webhook → авто-пауза (Путь C)

**Создано:** 2026-05-15
**Источник:** [`docs/journal/RECON_2026-05-15_feat015_prodamus.md`](../docs/journal/RECON_2026-05-15_feat015_prodamus.md)
**Решение по развилке:** Путь C (гибрид) утверждён Ольгой 2026-05-15.
**Связано с BACKLOG:** FEAT-015 (P1).

## Семантика

Два разных состояния — оба нужны:

- **`access_status='paused_manual'`** — админ вручную поставил на паузу. **Нет доступа.** Существующая концепция из миграции 21.
- **`auto_pause_exempt=true`** — защита от автопаузы по неоплате. **Есть доступ.** Webhook'и от Prodamus игнорируются для этих профилей. Новая концепция, добавляется в phase29.

Не путать. paused_manual блокирует доступ по решению админа (бан, расследование). exempt оставляет доступ независимо от webhook (бартер, постоянная льгота, служебный аккаунт).

## Архитектурные решения (зафиксированы 2026-05-15)

1. Используем **существующий push-server** (`push.skrebeyko.ru`) — webhook handler уже написан в прошлой итерации.
2. **Apply урезанная версия миграции 21** (новая phase29) — без RESTRICTIVE policies и без `has_platform_access()` helper.
3. **Bridge trigger** `BEFORE UPDATE OF access_status ON profiles` → синхронизирует `status` для совместимости с существующим `on_profile_status_change_resync_events`.
4. **Защита доступа** — через триггер `on_profile_status_change_resync_events` на `status` (events исчезают из публичного фида), а не через RLS.
5. **session_version invalidation** — НЕ делаем. Заводим как `TECH-DEBT-AUTH-SESSION-INVALIDATION` (P3). Garden — закрытая платформа, JWT TTL короткий, угроза не критична.
6. **Backfill exempt:** все профили с `role IN ('admin', 'applicant', 'intern')` помечаются `auto_pause_exempt=true` (они не платят подписку). Менторы и leader'ы платят — их не помечаем.
7. **Auto-expire `auto_pause_exempt_until`** — встроить в существующий `runNightlyExpiryReconcile`. Логировать в `billing_webhook_logs` отдельным `event_name='auto_pause_exempt_expired'`.

## Pre-flight (2026-05-15)

| Метрика | Значение |
|---|---|
| profiles total | 56 |
| status=active | 50 |
| status=suspended | 6 |
| Платящих ролей (leader + mentor) | 18 + 7 = **25** |
| Backfill exempt=true (admin + applicant + intern) | 3 + 15 + 13 = **31** |
| Профилей с пустым/NULL email | 0 ✅ |
| Дубль email (case-insensitive) | 0 ✅ |
| Триггер `on_profile_status_change_resync_events` на проде | ✅ active |
| push-server `/health` | ✅ 200 |
| push-server webhook | 503 (`PRODAMUS_WEBHOOK_ENABLED=false`) — выкл намеренно |
| Миграция 21 на проде | ❌ не applied (0 колонок, 0 таблиц) |

## Что из миграции 21 НЕ применяем

Миграция 21 широкая. Вот что **НЕ берём** в phase29:

- ❌ Helper `public.has_platform_access(target_user uuid) → boolean` — не нужен без RESTRICTIVE.
- ❌ **RESTRICTIVE policies** на 13 таблицах: `profiles`, `meetings`, `events`, `goals`, `knowledge_base`, `practices`, `clients`, `scenarios`, `course_progress`, `messages`, `news`, `birthday_templates`, `push_subscriptions` — это и есть отличие пути C от пути B. Без них доступ контролируется через `status` + триггер resync_events.
- ❌ Bumping `session_version` в push-server — оставляем код как есть, но в проде это поле не существует. Заведём в backlog как TECH-DEBT.

## Что из миграции 21 берём

- ✅ 9 колонок в `profiles`: `access_status` (default 'active'), `subscription_status` (default 'active'), `paid_until`, `last_payment_at`, `prodamus_subscription_id`, `prodamus_customer_id`, `last_prodamus_event`, `last_prodamus_payload`, `bot_renew_url`, `session_version`.
- ✅ 2 CHECK constraints (`access_status`, `subscription_status`).
- ✅ Индексы на новых колонках.
- ✅ Таблица `subscriptions` (история платежей).
- ✅ Таблица `billing_webhook_logs` (audit raw event payloads).
- ✅ Триггер `touch_subscriptions_updated_at`.

## Что добавляем НОВОГО в phase29

- ➕ Колонка `auto_pause_exempt boolean NOT NULL DEFAULT false`.
- ➕ Колонка `auto_pause_exempt_until date NULL` (если NULL — постоянно).
- ➕ Колонка `auto_pause_exempt_note text NULL`.
- ➕ Partial index `idx_profiles_auto_pause_exempt` WHERE `auto_pause_exempt=true` (для admin-вью «Без автопаузы»).
- ➕ Partial index `idx_profiles_auto_pause_exempt_until` WHERE `auto_pause_exempt_until IS NOT NULL` (для cron expire).
- ➕ Backfill `access_status='active'` (явный UPDATE — default уже стоит, но фиксируем состояние).
- ➕ Backfill `auto_pause_exempt=true WHERE role IN ('admin','applicant','intern')` (31 профиль).
- ➕ Bridge trigger `trg_sync_status_from_access_status` (BEFORE UPDATE OF access_status):
  - `access_status='active'` → `NEW.status='active'`
  - `access_status IN ('paused_expired','paused_manual')` → `NEW.status='suspended'`
- ➕ `SELECT public.ensure_garden_grants();` до COMMIT (RUNBOOK 1.3).
- ➕ 7 VERIFY-блоков.

**Файл:** [`migrations/2026-05-15_phase29_prodamus_path_c.sql`](../migrations/2026-05-15_phase29_prodamus_path_c.sql).

## Фазы

### Phase C0: pre-flight (✅ done 2026-05-15)

Распределение по ролям, проверка email match, статус миграции 21, статус push-server. См. таблицу выше.

### Phase C1: миграция БД (phase29) — ждёт 🟢

Apply на проде через стандартный pipeline (scp + ssh psql). Verify по 7 блокам. См. ниже.

### Phase C2: доработка push-server

Минимальные изменения, чтобы:

1. **`billingLogic.mjs` `deriveAccessMutation`** — добавить параметр `autoPauseExempt`. Если true и event ∈ (deactivation, finish) → `access_status` остаётся `'active'`, subscription_status переходит в `deactivated/finished` (для аудита), `bumpSessionVersion=false`. Полная иммунность к автопаузе, но платёж по-прежнему регистрируется.

2. **`server.mjs` `applyAccessState`** — передать `autoPauseExempt: profile.auto_pause_exempt` в `deriveAccessMutation`. Если webhook на exempt-профиль → залогировать в `billing_webhook_logs.error_text='SKIPPED_BY_AUTO_PAUSE_EXEMPT'` (но всё равно `is_processed=true` — событие учтено).

3. **`server.mjs` `runNightlyExpiryReconcile`** — добавить два UPDATE:
   - Существующий overdue→paused_expired: добавить `AND COALESCE(auto_pause_exempt, false) = false` (не трогать exempt).
   - Новый: `UPDATE profiles SET auto_pause_exempt=false, auto_pause_exempt_until=NULL WHERE auto_pause_exempt=true AND auto_pause_exempt_until IS NOT NULL AND auto_pause_exempt_until < CURRENT_DATE` — auto-expire срока exempt.
   - INSERT в `billing_webhook_logs` с `event_name='auto_pause_exempt_expired'` и `external_id='exempt_expired:<profile_id>:<date>'` для аудита.

Тесты `billingLogic.test.mjs` обновить — добавить кейс exempt.

### Phase C3: env config + restart

На проде в `/opt/push-server/.env`:
- Проставить `PRODAMUS_SECRET_KEY=<from Prodamus dashboard>` (Ольга предоставит).
- Включить `PRODAMUS_WEBHOOK_ENABLED=true`.
- Опционально `PRODAMUS_ALLOWED_IPS=<comma-list>` — если Prodamus публикует whitelist.
- `systemctl restart push-server.service` + проверка логов.

### Phase C4: Prodamus dashboard setup

**Ольга делает в Prodamus dashboard:**
- Webhook URL: `https://push.skrebeyko.ru/api/billing/prodamus/webhook`
- Secret key выдаётся из dashboard, копируется в `.env` push-server (Phase C3).
- События для подписки: payment_success, auto_payment, deactivation, finish.

### Phase C5: end-to-end smoke

По [`docs/prodamus-replay-scenarios.sql`](../docs/prodamus-replay-scenarios.sql):
- 1 тестовый юзер (можно Ольгин аккаунт).
- 1 тестовый платёж (живой ~1₽ или sandbox если есть — вопрос на финале).
- Проверка: webhook прилетел → log записан → access_status='active' → status='active'.
- Проверка деактивации (если есть способ симулировать без реального refund): UPDATE access_status='paused_expired' вручную → status='suspended' (триггер) → events исчезли из публичного фида.
- Проверка exempt: на exempt-профиле тот же deactivation webhook → log с error_text='SKIPPED_BY_AUTO_PAUSE_EXEMPT', access_status остался 'active'.

### Phase C6: Admin UI

**Уточнение от стратега 2026-05-16:** обновить существующий
`api.toggleUserStatus` (вызывается из AdminPanel) — писать в **оба** поля
сразу, чтобы не получать рассинхрон `status='suspended', access_status='active'`:
- toggle к `'suspended'` → `status='suspended'` AND `access_status='paused_manual'`.
- toggle к `'active'` → `status='active'` AND `access_status='active'`.
Bridge trigger односторонний (access_status → status) — обратная сторона
(старый UI пишет только status) ломает семантику. Делаем фикс в одной фазе.

**В карточке профиля** (`views/AdminPanel.jsx` user details):
- Секция «Не паузить автоматически».
- Чекбокс `auto_pause_exempt`.
- Радио «Всегда» / «До даты». При «До даты» — date picker для `auto_pause_exempt_until`.
- Текстовое поле «Почему» (`auto_pause_exempt_note`).
- Save → PATCH через PostgREST.

**В AdminPanel** новый таб или страница «Без автопаузы»:
- Раздел 1: «Всегда бесплатно» — `WHERE auto_pause_exempt=true AND auto_pause_exempt_until IS NULL`. Без сортировки по дате (бессрочно).
- Раздел 2: «Бесплатно до даты» — `WHERE auto_pause_exempt_until IS NOT NULL`, `ORDER BY auto_pause_exempt_until ASC` (ближайшие сверху). Это ревью-лист для Ольги.

Существующий paused_manual UX (toggle suspended в списке) **не трогаем** — это другая семантика, продолжает работать.

### Phase C7: backlog + lesson

- Завести `TECH-DEBT-AUTH-SESSION-INVALIDATION` (P3) в [`plans/BACKLOG.md`](BACKLOG.md). Описать: после `deactivation` webhook'а юзер с уже-выпущенным JWT может делать запросы до истечения токена. Митигация: события исчезают из публичного фида через resync_events; в карточке профиля админка может вручную выгнать через `/auth/logout-all`. Patch — отдельная задача в auth-service по `docs/journal/auth-service-session-version-patch.md`.
- Если что-то всплыло на smoke — урок в `docs/lessons/`.
- Обновить FEAT-015 в BACKLOG: 🔴 TODO → 🟢 DONE 2026-05-XX (после smoke).

## Бюджет

| Фаза | Что | Сессий |
|---|---|---|
| C0 | Pre-flight | ✅ done |
| C1 | Migration apply + VERIFY | 0.3 |
| C2 | push-server (deriveAccessMutation + applyAccessState + reconcile + tests) | 0.5 |
| C3 | .env + restart | 0.1 |
| C4 | Prodamus dashboard (Ольга) | внешнее |
| C5 | E2E smoke | 0.4 |
| C6 | Admin UI (карточка + 2 списка) | 0.5 |
| C7 | Backlog + lesson | 0.1 |

**Итого: ~1.9 сессии** (без C4).

## Открытые вопросы

- ❓ **Тестовый платёж в Prodamus** — sandbox или живая монетка? Уточняется у Ольги.

## Статус фаз

- [x] Phase C0. Pre-flight (2026-05-15)
- [x] Phase C1. Миграция phase29 (apply 2026-05-15, b87ee2a)
- [x] Phase C2. push-server изменения (8ddc198 — biz-logic + tests, +e0d60cf partial-index fix)
- [x] Phase C3. .env + restart + dark deploy (2026-05-15)
- [x] Phase C4. `.env` update + webhook ON (Ольга, 2026-05-15)
- [x] Phase C5. E2E smoke — sandbox 200 OK + idempotency duplicate detection (2026-05-16)
- [x] Phase C6. Admin UI (85a93f2 — auto_pause_exempt UI + toggleUserStatus две колонки)
- [x] Phase C7. Backlog + lesson — 3 урока, BACKLOG.md обновлён (2026-05-16)

## Итог

**🟢 FEAT-015 DONE 2026-05-16.** Все 8 фаз закрыты. Закрыты по пути:
- `BUG-PRODAMUS-SIGNATURE-HEADER` (7dcab90)
- `BUG-WEBHOOK-LOG-PARTIAL-INDEX` (e0d60cf)
- `BUG-PRODAMUS-SIGNATURE-ALGO` (eb2d67a, revert debug 464779d)
- `TECH-DEBT-PUSH-SERVER-RECONCILE-LOGSPAM` (apply phase29)

Заведено: `TECH-DEBT-PUSH-SERVER-STDERR-ALERTING` (P3, BACKLOG.md:3186).

Уроки:
- `docs/lessons/2026-05-16-prodamus-signature-algorithm.md`
- `docs/lessons/2026-05-16-partial-unique-index-on-conflict.md`
- `docs/lessons/2026-05-16-push-server-silent-crash-observability.md`

Открытые followup'ы (не блокеры):
- Полный E2E с реальным платежом (~100₽) — отложенный smoke task.
- Smoke Phase C6 UI на проде — Ольга проверит вкладку «Без автопаузы».
