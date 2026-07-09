# DIFF на ревью — Фаза 1e: ручная отметка оплаты (админ)

**Дата:** 2026-07-09 · **Автор:** codeexec · **Статус:** DIFF — миграция НЕ применена, backend НЕ задеплоен, фронт НЕ выкачен. Всё после 🟢.
**Проверки:** `node --check` ок, 16/16 юнит-тестов зелёные, **`npm run build` ✓** (фронт компилируется).

## Утверждённая модель (из обсуждения)
- Месяцы — свободное число + пресеты 1/3/6.
- **Явная дата «оплачено до» = источник истины** (не months+stacking). Пресеты подставляют дату, поле редактируемое.
- Реальная `amount` (предзаполнено из billing_plans, редактируемо) — для будущих отчётов.
- Кнопка для всех ролей (без role-гейта). Паузу не трогаем.
- Идемпотентность на двойной клик.

## Изменения

### 1. Миграция `database/pvl/migrations/2026-07-09_phase46_payment_orders_manual.sql`
`ALTER payment_orders`: `+ months, marked_by(uuid→profiles), note, granted_until, idempotency_key`; `plan_code` → nullable; provider CHECK `+= 'manual'`; unique index на `idempotency_key`. VERIFY V1–V4 (включая dry-run manual-INSERT). Живой биллинг не тронут.

### 2. `push-server/server.mjs`
- **Новое ядро `applyPayment(db, {userId, months|until, meta})`** — два режима:
  - `months` → стопка `greatest(now, paid_until)+N мес` (вебхук 1c).
  - `until` → **явная дата** (конец дня `until 23:59:59`) — ручная отметка 1e.
  - Общее: `subscription_status=active`, `access_status` active кроме `paused_manual`, `last_payment_at`, upsert в `subscriptions`.
- **`applyPlanPayment` (1c) отрефакторен** на общее ядро; months берёт из `payment_orders.months` (fallback — join billing_plans). Идемпотентность 1c без изменений.
- **checkout (1b)** теперь пишет `months` в заказ.
- **`requireAdmin`** middleware: JWT → user_id → DB-lookup `profiles.role='admin'` (app-роль в JWT нет).
- **`POST /api/billing/admin/mark-paid`** (`handleAdminMarkPaid`): валидация → идемпотентный `INSERT payment_orders(provider='manual', status='paid', marked_by, note, granted_until, idempotency_key) ON CONFLICT(idempotency_key) DO NOTHING` → если 0 строк `{duplicate:true}`, иначе `applyPayment(until=...)`. Всё в транзакции.

### 3. `services/dataService.js`
- `getBillingPlans()` — активные тарифы (для предзаполнения суммы; RLS пускает authenticated).
- `adminMarkPaid(userId, {untilDate, months, planCode, amount, paymentDate, note, idempotencyKey})` — POST на push-server под JWT админа. **idempotencyKey приходит из UI** (генерится при открытии модалки → стабилен на двойной клик).

### 4. `views/AdminPanel.jsx`
- Кнопка `Wallet` в ряду действий карточки — **для всех ролей** (вне `!== 'admin'`-гейта). Синяя если `paid_until` есть.
- Модалка `editingPaymentUser` (образец exempt-модалки): пресеты +1/+3/+6 (подставляют `until` и `amount` из billing_plans), поле **«Оплачено до»** (источник истины, редактируемое), сумма ₽, дата оплаты, комментарий. Save → `api.adminMarkPaid`. `savingPayment` дизейблит кнопку (клиентский guard). `idemKey` генерится при открытии.
- Оптимистичный `onUserPatched` (обновляет `paid_until` в списке).

## Идемпотентность (2 слоя)
1. **Клиент:** `savingPayment` дизейблит кнопку на время запроса.
2. **Сервер:** `idempotency_key` (uuid, стабилен на открытие модалки) + unique index → повтор = `{duplicate:true}`, `applyPayment` не вызывается.

## Поведение (подтверждено в обсуждении)
- **Задним числом:** `payment_date` — только аудит. Целевой доступ = явная дата «оплачено до» (не зависит от даты платежа). Over-credit исключён (нет greatest()).
- **paused_manual** ручной оплатой НЕ снимаем (как в applyPayment).
- **Все роли**, включая applicant — оплата безвредна, паузу не трогаем.

## Прошлая дата — ОТКЛОНЯЕМ (правка по ревью 2026-07-09)
- Backend `handleAdminMarkPaid`: `until < today` → **400 `until_date_in_past`**.
- Frontend: поле «Оплачено до» имеет `min=сегодня`.
Двойная защита — бессмысленную прошлую дату ввести нельзя.

## Деплой по 🟢 (порядок)
1. **Миграция phase46** — psql (VERIFY V1–V4). Бэкенд.
2. **push-server** — rsync + restart (env с 1b на месте). Бэкенд, **окна 403 нет**.
3. **Фронт (AdminPanel)** — сборка уже прошла; выкатка через CI/FTP = **clean-slate → окно 403** (см. память про деплой). Выкатывать в спокойное время.
4. **Smoke:** отметить оплату тест-юзеру (напр. Шиловой — реальный кейс) → `paid_until` = введённая дата, `payment_orders` строка provider=manual/paid/marked_by; повтор той же модалкой → duplicate; не-админ токеном → 403.

Коммит 1e — по твоей команде (могу вместе с деплоем).
