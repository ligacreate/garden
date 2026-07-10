# RECON + ДИЗАЙН (на обсуждение) — Фаза 1e: ручная отметка оплаты (админ)

**Дата:** 2026-07-09 · **Автор:** codeexec · **Статус:** recon, изменений НЕТ. Дизайн — на обсуждение до diff.

## Recon (ответы на 3 вопроса)

### 1. Где в AdminPanel работа с профилями ведущих
`views/AdminPanel.jsx` — на карточке каждого юзера уже есть блок действий:
- **Suspend/restore** — кнопка → `api.toggleUserStatus(u.id, ...)` (`:1363`), оптимистичный `onUserPatched`.
- **«Льгота» (auto_pause_exempt)** — кнопка Shield/ShieldOff (`:1383-1399`) открывает модалку `editingExemptUser` (`:1858-2000`) → `api.setProfileAutoPauseExempt(...)`.
- Отдельная вкладка «Льготы» (`:1768+`) — сводный список.

**Логичная точка для «Отметить оплату»:** ещё одна per-user кнопка рядом с Shield (напр. иконка `Wallet`/`BadgeRuble`), открывающая модалку `editingPaymentUser` по образцу exempt-модалки. Плюс (позже) вкладка «Платежи» со списком ручных отметок. **Паттерн копируем 1:1 с exempt-модалки** — минимум нового кода.

### 2. Серверный контур — переиспользуем `applyPlanPayment`?
**Да, ядро переиспользуем, но через НОВЫЙ push-server admin-эндпоинт** (не напрямую фронтом):
- `payment_orders` — **server-write-only** (в phase45 мы намеренно НЕ дали authenticated INSERT; RLS только SELECT своих). → фронт не может вставить аудит-строку ручной оплаты через PostgREST. Значит запись обязана идти через push-server.
- `applyPlanPayment(db, orderId, payload)` (server.mjs) уже делает: stacking `paid_until = greatest(now, paid_until)+N мес`, `subscription_status=active`, `paused_manual` не снимает, upsert в `subscriptions`. **Рефакторим:** вынести ядро `applyPaidMonths(db, {userId, months, meta, extPay, paidAt})`, которое зовут ОБА пути — вебхук (1c) и admin mark-paid (1e).

**Вывод:** нужен **параллельный admin-эндпоинт `POST /api/billing/admin/mark-paid`**, переиспользующий вынесенное ядро. Прямой вызов `applyPlanPayment` не годится (он читает существующий заказ по id; ручная оплата заказ ещё создаёт).

### 3. Auth-гвард админских эндпоинтов
- Существующие admin-мутации (`toggleUserStatus`, `setProfileAutoPauseExempt`) идут **через PostgREST PATCH profiles** с JWT bearer, гейтит **RLS `is_admin()`** (не push-server).
- push-server сейчас: `/push/news` — `requireAdminToken` (статичный `ADMIN_PUSH_TOKEN` bearer); `/api/billing/checkout` — `verifyJwtHS256` → user_id, **но роль НЕ проверяет** (JWT несёт `sub` + `role:'authenticated'` PostgREST-роль, а НЕ app-роль admin/leader).
- → Для mark-paid **нужен новый гвард `requireAdmin`:** `verifyJwtHS256` → user_id → **DB-lookup `profiles.role='admin'`**. App-роль в JWT нет, её берём из БД. Фронт уже умеет слать свой JWT на push-server (`PUSH_URL` + `Authorization: Bearer`, dataService `:121-124`).

---

## Дизайн (заложить, обсудим на diff)

### Эндпоинт
`POST /api/billing/admin/mark-paid` (push-server). Гвард `requireAdmin`.
Body: `{ user_id, plan_code? | months?, payment_date?, note?, idempotency_key }`.
- `plan_code` (1m/3m/6m) **или** `months` (произвольное N) — одно из.
- `payment_date` — дата оплаты (может быть задним числом; идёт в аудит, НЕ влияет на базу stacking — как договорились, интервал считаем от `greatest(now, paid_until)`).
- `note` — свободный комментарий (напр. «перевод на карту 08.07»).
- `idempotency_key` — uuid, фронт генерит при открытии модалки (см. идемпотентность).

### Эффект (как у Prodamus-платежа, через общее ядро)
1. Создать `payment_orders`: `provider='manual'`, `status='paid'`, `months=N`, `amount` (опц., из плана или 0), `marked_by=<admin id>`, `paid_at=payment_date`, `note`, `idempotency_key`.
2. `applyPaidMonths`: `paid_until = greatest(now, coalesce(paid_until, now)) + N мес`, `subscription_status='active'`, `access_status` active кроме `paused_manual`, `last_payment_at`, `last_prodamus_event='manual_payment'`.
3. upsert в `subscriptions` (provider='manual', provider_subscription_id = order uuid).

### Мини-миграция 1e (обсудим)
`ALTER TABLE payment_orders`:
- `+ months integer` (источник длительности; и для checkout проставим при создании → `applyPaidMonths` берёт `order.months`, убираем зависимость от join'а billing_plans).
- `+ marked_by uuid references profiles(id)` (кто отметил; NULL для авто).
- `+ note text`.
- `+ idempotency_key text` + **unique** (идемпотентность).
- `plan_code` → сделать **nullable** (ручная оплата с произвольными месяцами без плана).
- `provider` CHECK: `('yookassa','prodamus')` → **`+ 'manual'`**.
- `ensure_garden_grants()` не трогаем (грант SELECT уже есть; запись — owner).

### Идемпотентность на повторный клик
Двойной клик по «Отметить» не должен начислить дважды. Механизм:
- Фронт генерит `idempotency_key` (uuid) при открытии модалки, шлёт в теле.
- Сервер: `INSERT payment_orders ... ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`. Если 0 строк (ключ уже был) → ответ `{duplicate:true}`, `applyPaidMonths` НЕ вызываем.
- Плюс клиентский guard (disable кнопки на время запроса) — как в exempt-модалке (`savingExempt`).

### Фронт (dataService + AdminPanel)
- `dataService.adminMarkPaid(userId, { planCode|months, paymentDate, note })` → POST на `PUSH_URL/api/billing/admin/mark-paid` с Bearer + сгенерённым `idempotency_key`.
- AdminPanel: кнопка + модалка `editingPaymentUser` (образец exempt-модалки): селект плана/месяцев, date-picker, note, Save. Оптимистичный `onUserPatched` (обновить `paid_until` в списке).

### Открытые вопросы к обсуждению
1. **months vs plan_code:** храним `months` на заказе (гибко, произвольное N) — ок? Или ручную ограничить только 1m/3m/6m?
2. **amount** для ручной: брать из плана, или оставлять 0/NULL (деньги мимо кассы, суммы может не быть)?
3. **paid_at = payment_date задним числом** — ок, что базой stacking всё равно `greatest(now, paid_until)` (а не payment_date)? Т.е. если отметить платёж «задним числом» за прошлый месяц — доступ продлится от СЕГОДНЯ+N, не от прошлой даты. Для оцифровки текущих (Шилова) это правильно (продлеваем вперёд). Подтверди.
4. **Кто «ведущие» в списке:** показывать кнопку «Отметить оплату» для всех платящих ролей (intern/leader/mentor) или всех? Гардрейл: applicant (курсовые) — показывать? Думаю да (они тоже платят Лигу), но не паузить их — оплата безвредна.

**НЕ строю до согласования дизайна + 🟢 на diff.**
