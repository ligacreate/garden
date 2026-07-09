# Платёжная система подписки Лиги (платформо-инициированный checkout)

**Создано:** 2026-07-09
**Память:** `project-garden-subscription-payments`
**Дизайн-recon:** [`docs/_session/2026-07-08_212_codeexec_billing_recon_report.md`](../docs/_session/2026-07-08_212_codeexec_billing_recon_report.md)
**Сверка ростера/платежей (перед миграцией):** `_session/213`, `214`, `215`, `216`

## Что строим

Подписка на **Лигу развивающих практиков** через платформу (Сад = источник правды).
Модель: **ручная оплата** планов 1/3/6 мес + **напоминания** (НЕ автопродление).
Платёж инициирует ПЛАТФОРМА → кладёт `order_id`/`user_id` в заказ → вебхук точно знает,
кто оплатил (конец fuzzy-матчу по email/телефону). Карты платформа НЕ трогает —
только hosted-checkout провайдера.

## Утверждённая модель (зафиксировано 2026-07-09)

- **Провайдеры:** YooKassa (РФ-карты) + Prodamus (зарубежные). Юзер выбирает
  «российская / зарубежная карта» → провайдер.
- **Планы и цены** (в `billing_plans`, для всех одинаково, правятся без деплоя):
  - `1m` — 1 мес — **2000 ₽**
  - `3m` — 3 мес — **5500 ₽**
  - `6m` — 6 мес — **10000 ₽**
- **Источник правды — платформа:** заказ несёт `order_id` (uuid) + `user_id` (из JWT);
  вебхук матчит детерминированно по `payment_orders.id`. Никакого email/phone-матча.
- **paid_until** продлевается стопкой: `max(now, paid_until) + N месяцев` (не фикс +31д).

## ГАРДРЕЙЛ (критично)

- **Enforcement таргетит только ЛИГУ** — платящие роли `intern` (стажёры) + `leader`/`mentor` (ведущие).
  **Курсовые роли НЕ трогать:** `applicant` (абитуриенты ПВЛ) не паузим по подписке Лиги,
  даже если они платят Лигу отдельно. `admin` — служебные.
- Любая авто-пауза/блокировка проверяет роль ∈ (`intern`,`leader`,`mentor`).
- Billing-страницы (тарифы/заказы) **без** `has_platform_access`-guard: приостановленный
  юзер должен видеть тарифы и оплатить, иначе заперт навсегда.

## Сосуществование со старой моделью

- Сейчас живёт **recurring Prodamus** (16 активных auto_payment) + BotHunter для ведущих.
  **Не ломаем принудительно** — coexist: старые recurring дорабатывают, новые платежи идут
  через платформо-инициированные планы.
- **Cutover** (перевод/отмена recurring в кабинете Prodamus/TargetHunter) — **позже**, отдельно.
- **Hard-block** (резать доступ по истечении `paid_until` через `_assertActive`) — **отдельной
  поздней фазой** после обкатки напоминаний и наполнения `paid_until`. В Фазе 1 — soft
  (баннер/карточка, доступ не режем).
- **Корневая проблема** (webhook↔TargetHunter не пишет `paid_until` у части оплат) — чинить
  до cutover, иначе новая система унаследует дыру. См. `_session/214`.

## Переиспользуем (не ломаем)

`public.subscriptions` (история), `public.billing_webhook_logs` (идемпотентность + подпись),
`profiles.paid_until/access_status/session_version`, `runNightlyExpiryReconcile`,
push-server Prodamus/BotHunter webhook-логику.

## Фазы

### Phase 1a — фундамент БД ✅ DONE (2026-07-09)
- `billing_plans` (сид 2000/5500/10000), `payment_orders` (`id`=order_id, `user_id` FK, `plan_code`,
  `provider`, `amount`, `status`, `external_payment_id`), индексы + partial-unique для идемпотентности.
- RLS: юзер читает свои заказы; `billing_plans` admin-write (`is_admin()`); `payment_orders` server-write only.
- `ensure_garden_grants()` дополнена аддитивно (+2 гранта). Живой биллинг не тронут (V7).
- Миграция: [`database/pvl/migrations/2026-07-09_phase45_billing_plans_orders.sql`](../database/pvl/migrations/2026-07-09_phase45_billing_plans_orders.sql).
  Diff-review: `_session/217`. Verify V1–V8 зелёные.

### Phase 1b — checkout-endpoint [ ]
- `POST /api/billing/checkout` на push-server. Auth: JWT юзера → `user_id` берём из токена (anti-tamper).
- Body `{ plan_code, provider }`. Валидируем план из `billing_plans`, создаём `payment_orders` (status=created).
- **YooKassa:** `POST /v3/payments` (Basic shopId:secret), `metadata={user_id,order_id,plan_code,months}`,
  `Idempotence-Key=order_id`, `confirmation{type:redirect,return_url}` → сохраняем `external_payment_id`,
  возвращаем `confirmation_url`.
- **Prodamus:** payform-URL `https://<shop>.payform.ru/?order_id=<id>&_param_user_id=<uid>&products[...]=...`
  → возвращаем URL (API-ключ не нужен).
- **НУЖНЫ sandbox-креды:** YooKassa test `shopId`+`secretKey`; Prodamus payform-домен + demo-режим.
  Env: `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY`, `YOOKASSA_RETURN_URL`, `PRODAMUS_PAYFORM_URL`.

### Phase 1c — вебхуки [ ]
- **Prodamus** (расширить существующий `/webhooks/prodamus`): если есть `order_id` → находим
  `payment_orders`, берём `user_id`+`months` из заказа (не из payload/email). Подпись — существующий
  `verifyProdamusSignature`. Обратная совместимость: нет order_id → старый recurring-путь.
- **YooKassa** (`/webhooks/yookassa`, новый): `payment.succeeded`, `metadata.order_id`. Верификация:
  IP-allowlist + обратный `GET /v3/payments/{id}` (подписи нет).
- **Apply платежа** (общий): `paid_until = max(now, paid_until)+N мес`, `access_status=active`,
  `subscription_status=active`, `payment_orders.status=paid/paid_at`, запись в `subscriptions`.
  Идемпотентность — `billing_webhook_logs` + partial-unique заказа + advisory-lock по order_id.

### Phase 1d — UI «Моя подписка» [ ]
- Карточка в [`views/ProfileView.jsx`](../views/ProfileView.jsx): статус (активна до DD.MM / истекла) + «Продлить».
- Экран выбора плана (1/3/6 из `billing_plans`) + радио «российская/зарубежная карта» →
  `POST /api/billing/checkout` → редирект на hosted-checkout.
- Баннер на `StatsDashboardView` при близком/истёкшем `paid_until`. **Soft** (доступ не режем).

### Phase 1e — ручная отметка оплаты (админ) [ ]
- Обязательна: для прямых переводов (кейс Шиловой и др. off-platform-плательщиков).
- Админ-UI: выбрать юзера + план/дату → создать `payment_orders` (provider='manual'? или отметка) +
  проставить `paid_until = дата + N мес`. Аудит в `billing_webhook_logs`/`subscriptions`.
- Согласовать: отдельный `provider='manual'` в CHECK payment_orders (сейчас yookassa|prodamus) —
  добавить миграцией при реализации 1e.

### Phase 1f — напоминания T-7/3/1/expired [ ]
- Ночной проход (расширить `runNightlyExpiryReconcile` или отдельный job): платящие роли,
  `access_status=active`, `paid_until` в окнах T-7/T-3/T-1/T0 → задача в **garden-auth
  tg_notifications_queue** (`@garden_notifications_bot`) + email (SMTP) fallback.
- Дедуп: таблица `billing_reminders_sent (user_id, paid_until, window)` unique.
- **НЕ автосписание** — только напоминание со ссылкой на `/subscription`.
- Уточнить контракт `tg_notifications_queue` в garden-auth.

## Открытые вопросы
- Sandbox-креды провайдеров (блокер 1b).
- Prodamus payform-домен + наличие demo/sandbox.
- Контракт `tg_notifications_queue` (garden-auth) для 1f.
- `AUTH_SERVICE_SECRET` на push-server — задать для реального logout-all (при hard-block).
- Backfill исторического «хвоста» (off-platform плательщики без `paid_until`) — через 1e.

## Статус фаз
- [x] 1a — БД (2026-07-09)
- [ ] 1b — checkout
- [ ] 1c — вебхуки
- [ ] 1d — UI
- [ ] 1e — ручная отметка
- [ ] 1f — напоминания
