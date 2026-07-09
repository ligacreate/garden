# DIFF на ревью — Фаза 1b: checkout-endpoint (YooKassa + Prodamus)

**Дата:** 2026-07-09 · **Автор:** codeexec · **Проект:** project-garden-subscription-payments
**Статус:** DIFF — код написан, НЕ задеплоен. Деплой (rsync + restart) только после 🟢.
**Тесты:** `billingCheckout.test.mjs` — 16/16 зелёные. `node --check` ок. **Ни одного сетевого вызова при разработке.**

## Файлы
- **NEW** `push-server/billingCheckout.mjs` — чистые хелперы (JWT verify, cred-resolver, payload/URL builders).
- **NEW** `push-server/billingCheckout.test.mjs` — 16 тестов (fail-safe, JWT, receipt, demo_mode).
- **EDIT** `push-server/server.mjs` — import + env + `handleBillingCheckout` + route `POST /api/billing/checkout` + startup-log.

## Endpoint `POST /api/billing/checkout`
- **Auth:** JWT `Bearer` (garden-auth HS256, `JWT_SECRET`) → `user_id` из `sub`. **Anti-tamper:** user_id и сумма НЕ из тела.
- **Body:** `{ plan_code, provider }` (provider ∈ yookassa|prodamus).
- **Поток:** verify JWT → план из `billing_plans` (active, цена оттуда) → email из profiles → проверка доступности провайдера **до** создания заказа → INSERT `payment_orders` (status=created) → инициация у провайдера с embedded `order_id`.
- **YooKassa:** `POST /v3/payments`, Basic shopId:secret, `Idempotence-Key=order_id`, `metadata{user_id,order_id,plan_code,months}`, `confirmation{redirect,return_url}`, **`receipt`: без НДС (`vat_code=1`), «услуга» (`payment_subject=service`), email покупателя**. Успех → `external_payment_id=payment.id`, вернуть `confirmation_url`. Ошибка → order=failed, 502.
- **Prodamus:** payform-ссылка `https://skrebeyko.payform.ru/?order_id=…&products[0][…]&customer_email=…&_param_user_id=…&do=pay[&demo_mode=1]` → вернуть URL. Заказ остаётся `created` до вебхука (1c).
- **return_url:** `https://liga.skrebeyko.ru/#/subscription?status=ok`.

## 🔒 FAIL-SAFE (по твоему уточнению — тест-магазина нет, live только на осознанный клик)
Развязал провайдеры на **два независимых флага:**
- **`BILLING_SANDBOX`** (по умолчанию ВКЛ, выключается только явным `0`/`false`) — управляет **только Prodamus demo_mode**. Dev: `demo_mode=1`, тестируем свободно.
- **`YOOKASSA_LIVE_ENABLED`** — **отдельный явный gate на боевой YooKassa-вызов.** Пока ≠`1`:
  - `resolveYooKassaCreds()` → `null` → endpoint отдаёт `503 yookassa_disabled`, **YooKassa live НЕ дёргается вообще** (ни в dev, ни в prod-режиме).
  - Live-креды `1100657` читаются **только** когда флаг явно включён.
- **Как делать самоплатёж (сквозной YooKassa-smoke):** временно `YOOKASSA_LIVE_ENABLED=1` на push-server → один реальный клик Ольги → выключить флаг обратно. Prodamus при этом остаётся в demo (флаги независимы).
- **Гарантия:** во время разработки боевой YooKassa-вызов невозможен — нет ни одной ветки, читающей live-креды без `YOOKASSA_LIVE_ENABLED=1`. Покрыто тестами («dev без LIVE_ENABLED → null», «prod без LIVE_ENABLED → null»).

## Env для `/opt/push-server/.env` (добавлю точечно при деплое, с твоего ок; в git НЕ идут)
```
GARDEN_JWT_SECRET=<= garden-auth JWT_SECRET, скопирую с прода при деплое>
PRODAMUS_PAYFORM_URL=https://skrebeyko.payform.ru
BILLING_SANDBOX=1
YOOKASSA_SHOP_ID=1100657
YOOKASSA_SECRET_KEY=<live-секрет, есть у меня из чата>
YOOKASSA_LIVE_ENABLED=            # ПУСТО на время разработки. =1 только под самоплатёж.
# YOOKASSA_RETURN_URL по умолчанию https://liga.skrebeyko.ru/#/subscription?status=ok
```
`GARDEN_JWT_SECRET` = значение `JWT_SECRET` из `/opt/garden-auth/.env` (тот же секрет, которым PostgREST валидирует токен). Скопирую сервер-сайд, в чат/код не выношу.

## Что НЕ входит в 1b (следующие диффы)
- **1c — вебхуки:** матч по `order_id`→`payment_orders`, apply платежа (`paid_until += N мес`, order=paid), идемпотентность. YooKassa `/webhooks/yookassa` + расширение Prodamus. Демо-вебхук Prodamus проверю здесь.
- **1d — UI «Моя подписка»** (кнопка дергает этот endpoint).
- Rate-limit на endpoint — followup (пока нет; endpoint за JWT).

## Деплой по 🟢 (RUNBOOK push-server)
1. rsync push-server → прод (exclude tests/.env/lock).
2. Добавить env-строки в `/opt/push-server/.env` (точечно).
3. `systemctl restart push-server` + проверить startup-log: `checkout[sandbox=true, jwt=on, yk=off, prodamus=on(demo=true)]`.
4. Smoke: `curl -X POST .../api/billing/checkout` без токена → `401`; с токеном + provider=prodamus → вернёт demo-ссылку (открою в браузере, оплата тест-картой); provider=yookassa → `503 yookassa_disabled` (ожидаемо, live off).
