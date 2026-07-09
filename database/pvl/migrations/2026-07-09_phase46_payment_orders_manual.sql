-- database/pvl/migrations/2026-07-09_phase46_payment_orders_manual.sql
--
-- ФАЗА 1e — ручная отметка оплаты (админ): расширяем payment_orders.
-- Провайдер 'manual' (прямые переводы/нал мимо Prodamus — Шилова и др.).
-- Песочница-safe: только ALTER новой таблицы payment_orders (создана phase45),
-- живой биллинг (subscriptions/billing_webhook_logs/profiles) не трогаем.
--
-- Apply:
--   ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
--     PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
--     -v ON_ERROR_STOP=1 -f /tmp/2026-07-09_phase46_payment_orders_manual.sql'

\set ON_ERROR_STOP on

BEGIN;

ALTER TABLE public.payment_orders
  ADD COLUMN IF NOT EXISTS months          integer,                                            -- длительность (для отчётности; checkout проставляет из плана)
  ADD COLUMN IF NOT EXISTS marked_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,  -- какой админ отметил (NULL для авто-платежей)
  ADD COLUMN IF NOT EXISTS note            text,                                               -- свободный комментарий («перевод на карту 08.07»)
  ADD COLUMN IF NOT EXISTS granted_until   timestamptz,                                        -- целевой paid_until, который проставила эта оплата (аудит)
  ADD COLUMN IF NOT EXISTS idempotency_key text;                                               -- ключ идемпотентности ручной отметки

-- plan_code больше не обязателен: ручная оплата может быть с произвольным числом месяцев без плана.
ALTER TABLE public.payment_orders ALTER COLUMN plan_code DROP NOT NULL;

-- provider: + 'manual'
ALTER TABLE public.payment_orders DROP CONSTRAINT IF EXISTS payment_orders_provider_check;
ALTER TABLE public.payment_orders
  ADD CONSTRAINT payment_orders_provider_check CHECK (provider IN ('yookassa', 'prodamus', 'manual'));

-- идемпотентность ручной отметки (повторный клик с тем же ключом → no-op)
CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_idempotency_key_uidx
  ON public.payment_orders (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_orders_marked_by_idx ON public.payment_orders (marked_by);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- VERIFY (вне транзакции)
-- ─────────────────────────────────────────────────────────────────────
\echo === V1: новые колонки payment_orders ===
SELECT column_name, data_type, is_nullable FROM information_schema.columns
WHERE table_schema='public' AND table_name='payment_orders'
  AND column_name IN ('months','marked_by','note','granted_until','idempotency_key','plan_code')
ORDER BY column_name;

\echo === V2: provider CHECK включает manual ===
SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='payment_orders_provider_check';

\echo === V3: unique index на idempotency_key ===
SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='payment_orders' AND indexname LIKE '%idempotency%';

\echo === V4: manual-заказ проходит CHECK (dry-run BEGIN/ROLLBACK) ===
BEGIN;
INSERT INTO public.payment_orders(user_id, provider, amount, months, status, idempotency_key, marked_by)
SELECT id, 'manual', 2000, 1, 'paid', 'verify-dry-run', id FROM public.profiles WHERE role='admin' LIMIT 1;
SELECT provider, status, months FROM public.payment_orders WHERE idempotency_key='verify-dry-run';
ROLLBACK;
