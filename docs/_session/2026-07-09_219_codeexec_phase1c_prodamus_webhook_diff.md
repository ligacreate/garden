# DIFF на ревью — Фаза 1c: Prodamus-вебхук план-платежей (Prodamus-only)

**Дата:** 2026-07-09 · **Автор:** codeexec · **Проект:** project-garden-subscription-payments
**Статус:** DIFF — код написан, НЕ задеплоен. Деплой (rsync+restart) после 🟢.
**Тесты:** 16/16 зелёные, `node --check` ок. Ни одного сетевого вызова.
**Решение:** Prodamus-only (2026-07-09). YooKassa-код спит (gated off), `/webhooks/yookassa` НЕ делаем.

## Recon-фундамент (реальный payload из billing_webhook_logs)
```
order_id: "46517754"           ← ВНУТРЕННИЙ номер Prodamus (перезаписывает наш!)
_param_custom: "6a4e5d0f…"     ← кастомный параметр TargetHunter'а вернулся КАК ЕСТЬ
payment_status: "success"      ← классификация payment_success
currency: "eur", commission:10 ← зарубежная карта через Prodamus (подтверждает Prodamus-only)
```
Вывод: наш order_id надо возить в **кастом-параметре** (`_param_order_id`), не в нативном `order_id`.

## Изменения

### 1. `billingCheckout.mjs` — `buildProdamusUrl`
Добавлен `_param_order_id=<orderId>` (источник истины матча) + сохранён `_param_user_id`/`_param_plan`.
Нативный `order_id` оставлен для читаемости (Prodamus его перезапишет в вебхуке). +тест.

### 2. `server.mjs` — `handleProdamusWebhook` + `applyPlanPayment`
Новая ветка ПОСЛЕ проверки подписи и дедупа, ПЕРЕД fuzzy-матчем:
```
orderRef = payload._param_order_id
if orderRef && event ∈ (payment_success, auto_payment):
    applyPlanPayment(order) → return (план-путь, БЕЗ fuzzy по email)
else:
    старый recurring/fuzzy путь (не тронут — backward-compat)
```
**`applyPlanPayment(orderId, payload)`:**
- Находит `payment_orders` + `billing_plans.months` по `id=orderRef`.
- `order.status='paid'` → уже применён (идемпотентно), выходим.
- **`paid_until = greatest(now, coalesce(paid_until, now)) + make_interval(months=>N)`** — продление стопкой.
- `access_status` = active (кроме `paused_manual` — ручной бан админа не снимаем платежом).
- `subscription_status=active`, `last_payment_at`, `last_prodamus_event='plan_payment'`, payload.
- `payment_orders.status='paid'`, `paid_at`, `external_payment_id` = Prodamus order_id.
- upsert в `subscriptions` (provider_subscription_id = наш order uuid).

### Идемпотентность (3 слоя)
1. `billing_webhook_logs` unique (provider, external_id) — повтор того же Prodamus order_id → `duplicate`.
2. `payment_orders.status='paid'` guard — повторный apply не двигает `paid_until` второй раз.
3. `pg_advisory_xact_lock` по external_id — гонки.

### Что НЕ тронуто
Старый recurring/BotHunter путь (`applyAccessState`, fuzzy `findProfileByCustomer`), подпись
`verifyProdamusSignature`, `runNightlyExpiryReconcile`. 16 старых тестов зелёные.

## ⚠️ К проверке на ПЕРВОМ реальном/демо платеже
**Round-trip `_param_order_id`.** Доказан только `_param_custom`. Если Prodamus вернёт наш order_id
под другим ключом (или переименует) — план-путь не сматчится и упадёт в recurring-fuzzy (деградация,
не поломка: применит generic +31д по email, но не отметит заказ `paid`). Ловим на 1-м платеже,
правим имя ключа одной строкой. Читаю `_param_order_id` и `param_order_id` (на всякий).

## Демо-оплата
Прошлая demo упала («Ошибка проведения») — вероятно `demo_mode=1` на договорном магазине ушёл
на реальный Сбер-эквайринг, тест-карту отверг. Для чистого демо: кабинет Prodamus → Настройки →
«Деморежим без приёма оплаты», затем повтор. ЛИБО тестируем на первом реальном платеже (структура
известна, демо не блокер).

## Деплой по 🟢
1. rsync push-server (billingCheckout.mjs + server.mjs).
2. `systemctl restart push-server` (env уже на месте с 1b).
3. Сгенерю свежую demo/боевую ссылку → оплата → снимаю `billing_webhook_logs` по нашему order_id:
   проверяю path='plan_order', `payment_orders.status=paid`, `profiles.paid_until` += 1 мес,
   идемпотентность (повторный вебхук → duplicate).
