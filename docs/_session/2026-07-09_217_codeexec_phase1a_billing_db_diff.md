# DIFF на ревью — Фаза 1a: фундамент БД подписочной оплаты

**Дата:** 2026-07-09 · **Автор:** codeexec · **Проект:** project-garden-subscription-payments
**Файл миграции:** `database/pvl/migrations/2026-07-09_phase45_billing_plans_orders.sql`
**Статус:** DIFF — НЕ применено. Применю после 🟢, затем verify-SELECT (V1–V7 встроены).

## Что создаём (только НОВОЕ, песочница-safe)
1. **`public.billing_plans`** — `code` PK (`1m`/`3m`/`6m`), `title`, `months`, `amount_rub`, `active`, `sort`, `created/updated_at`. Сид: 1м=2000, 3м=5500, 6м=10000 (идемпотентный INSERT ... ON CONFLICT DO NOTHING; далее цены правятся UPDATE'ом без деплоя).
2. **`public.payment_orders`** — `id uuid PK = order_id` (источник истины матча вебхука), `user_id` FK→profiles(id) CASCADE, `plan_code` FK→billing_plans(code) RESTRICT, `provider` CHECK(yookassa|prodamus), `amount`, `status` CHECK(created|paid|failed|expired) def 'created', `external_payment_id`, `created_at`, `paid_at`.
3. **Индексы:** `user_id`, `status`, `external_payment_id` + **partial UNIQUE (provider, external_payment_id) WHERE ext IS NOT NULL** (идемпотентность вебхука).
4. **RLS:** `billing_plans` — authenticated читает `active` (+admin все); `payment_orders` — authenticated читает `user_id=auth.uid()` (+admin). Запись обеих — **только owner (gen_user = push-server), в обход RLS** (нет INSERT/UPDATE политик для authenticated).
5. **`ensure_garden_grants()`** — аддитивно +2 строки (`GRANT SELECT ON billing_plans/payment_orders TO authenticated`), тело скопировано 1:1 с прода (41 таблица сохранена), чтобы daily Timeweb wipe восстанавливал новые гранты.

## Ключевые дизайн-решения (на что смотреть ревьюеру)
- **⚠ СОЗНАТЕЛЬНО НЕТ `has_platform_access`-guard** на этих таблицах. Причина: приостановленный (`paused_expired`/`paused_manual`) юзер **должен** видеть тарифы и свои заказы, чтобы продлить. Tier-1 таблицы (profiles/events/…) guard имеют — эти две намеренно нет.
- **Запись только owner'ом.** Checkout-endpoint (Фаза 1b) будет писать заказы как gen_user (push-server DATABASE_URL). Юзер напрямую заказ создать не может (anti-tamper: user_id/amount берём на сервере, не из тела).
- **Матч по order_id.** `payment_orders.id` кладётся в заказ провайдера → вебхук (1c) находит юзера детерминированно, без email-fuzzy.
- **Ничего живого не тронуто:** `subscriptions`, `billing_webhook_logs`, `profiles.paid_until/access_status`, Prodamus/BotHunter-логика — ноль изменений. V7 это проверяет.
- **Единственный shared-объект под CREATE OR REPLACE — `ensure_garden_grants()`**, изменение чисто аддитивное (2 SELECT-гранта).

## Открытые вопросы (не блокеры 1a)
- **Редактирование тарифов Ольгой:** сейчас write у owner → цены меняются `UPDATE billing_plans` через psql (я помогу) или отдельным admin-UI позже. Нужен ли admin-write через RLS (`is_admin()`)? Могу добавить политику `billing_plans` FOR ALL USING(is_admin()). Скажи — доложу в 1a или отдельно.
- **provider на заказе фиксируется при checkout** (юзер выбрал карту РФ/зарубеж). Ок?
- Placement миграции — в `database/pvl/migrations` по твоему указанию (хотя таблицы не pvl; корневой `migrations/` тоже вариант). Оставил как просила.

## После 🟢
Применю одним транзакционным psql (файл уже готов), покажу V1–V7. Затем — 1b (checkout-endpoint), для которого **понадобятся sandbox-креды провайдеров** (YooKassa test shopId/secret; Prodamus payform-домен + demo) — попрошу отдельно.
