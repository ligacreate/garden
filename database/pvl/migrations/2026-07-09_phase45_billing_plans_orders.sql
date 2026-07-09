-- database/pvl/migrations/2026-07-09_phase45_billing_plans_orders.sql
--
-- ФАЗА 1a — фундамент подписочной оплаты Лиги (платформо-инициированный checkout).
-- Проект: project-garden-subscription-payments. Дизайн-recon: docs/_session/2026-07-08_212.
--
-- ЧТО ДЕЛАЕТ (песочница-safe, только НОВОЕ):
--   1. public.billing_plans   — каталог тарифов (1m/3m/6m), цены редактируются в БД без деплоя.
--   2. public.payment_orders  — заказы; id=order_id = ИСТОЧНИК ИСТИНЫ для матча вебхука по user_id.
--   3. RLS: юзер читает только свои заказы (+admin все); запись — только owner (push-server / gen_user).
--   4. ensure_garden_grants() — аддитивно +2 SELECT-гранта (daily Timeweb wipe их восстановит).
--
-- ЧТО НЕ ТРОГАЕТ (переиспользуем, не ломаем):
--   public.subscriptions, public.billing_webhook_logs, profiles.paid_until/access_status,
--   Prodamus/BotHunter webhook-логику push-server. Ноль изменений в живом биллинге.
--
-- ВАЖНО ПО RLS: на billing_plans/payment_orders СОЗНАТЕЛЬНО НЕТ has_platform_access-guard —
--   приостановленный (paused_expired/paused_manual) юзер ДОЛЖЕН видеть тарифы и свои заказы,
--   чтобы продлить подписку. Это отличие от Tier-1 таблиц.
--
-- Apply:
--   ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
--     PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
--     -v ON_ERROR_STOP=1 -f /tmp/2026-07-09_phase45_billing_plans_orders.sql'

\set ON_ERROR_STOP on

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. billing_plans — каталог тарифов
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_plans (
  code        text PRIMARY KEY,                 -- '1m' | '3m' | '6m'
  title       text NOT NULL,
  months      integer NOT NULL CHECK (months > 0),
  amount_rub  integer NOT NULL CHECK (amount_rub >= 0),
  active      boolean NOT NULL DEFAULT true,
  sort        integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Сид тарифов (идемпотентно; цены далее редактируются UPDATE'ом без деплоя)
INSERT INTO public.billing_plans (code, title, months, amount_rub, sort) VALUES
  ('1m', 'Лига — 1 месяц',  1,  2000, 1),
  ('3m', 'Лига — 3 месяца', 3,  5500, 2),
  ('6m', 'Лига — 6 месяцев',6, 10000, 3)
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- 2. payment_orders — заказы (order_id = источник истины матча вебхука)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_orders (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- = order_id
  user_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_code           text NOT NULL REFERENCES public.billing_plans(code) ON DELETE RESTRICT,
  provider            text NOT NULL CHECK (provider IN ('yookassa','prodamus')),
  amount              integer NOT NULL CHECK (amount >= 0),
  status              text NOT NULL DEFAULT 'created'
                        CHECK (status IN ('created','paid','failed','expired')),
  external_payment_id text,                                          -- id платежа у провайдера (появляется позже)
  created_at          timestamptz NOT NULL DEFAULT now(),
  paid_at             timestamptz
);

CREATE INDEX IF NOT EXISTS payment_orders_user_id_idx           ON public.payment_orders (user_id);
CREATE INDEX IF NOT EXISTS payment_orders_status_idx            ON public.payment_orders (status);
CREATE INDEX IF NOT EXISTS payment_orders_external_pay_idx      ON public.payment_orders (external_payment_id);
-- идемпотентность матча вебхука: один external_payment_id на провайдера
CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_provider_extpay_uidx
  ON public.payment_orders (provider, external_payment_id)
  WHERE external_payment_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 3. RLS
--    billing_plans:  authenticated читает активные (+admin все). Запись — owner.
--    payment_orders: authenticated читает СВОИ (+admin все). Запись — owner (push-server).
--    Гарда has_platform_access НЕ вешаем (см. заголовок).
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.billing_plans  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY billing_plans_select_active
  ON public.billing_plans FOR SELECT TO authenticated
  USING (active = true OR public.is_admin());

-- admin правит тарифы (future-proof под админ-UI; цены пока меняем UPDATE'ом через psql).
-- payment_orders СОЗНАТЕЛЬНО без write-политики — записи о платежах только под сервером.
CREATE POLICY billing_plans_admin_write
  ON public.billing_plans FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY payment_orders_select_own_or_admin
  ON public.payment_orders FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());
-- INSERT/UPDATE/DELETE политик для authenticated НЕТ:
-- заказы создаёт/обновляет только push-server как owner (gen_user), в обход RLS.

-- ─────────────────────────────────────────────────────────────────────
-- 4. GRANTs (прямые сейчас + в ensure_garden_grants() для авто-восстановления)
--    Только SELECT для authenticated. Запись остаётся у owner (gen_user).
-- ─────────────────────────────────────────────────────────────────────
-- billing_plans: full CRUD на уровне грантов, запись гейтит RLS-политика is_admin().
-- payment_orders: только SELECT (запись — owner/gen_user в обход RLS).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_plans  TO authenticated;
GRANT SELECT                        ON public.payment_orders TO authenticated;

CREATE OR REPLACE FUNCTION public.ensure_garden_grants()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- ── PART 1: Tier-1 — full CRUD для authenticated (41 таблица) ──
    -- Источник: phase 16 PART 1 + phase 38 + phase 40 (swap certification tables).
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.birthday_templates TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.cities TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_progress TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.goals TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_base TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.meetings TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.news TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.notebooks TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.practices TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvl_calendar_events TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvl_checklist_items TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvl_cohorts TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvl_content_items TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvl_content_placements TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvl_course_lessons TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvl_course_weeks TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvl_direct_messages TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvl_faq_items TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvl_garden_mentor_links TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvl_homework_items TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvl_homework_status_history TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvl_mentors TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvl_notifications TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvl_student_certification_mentor TO authenticated;  -- phase 40 (swap)
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvl_student_certification_self TO authenticated;    -- phase 40 (swap)
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvl_student_content_progress TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvl_student_course_points TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvl_student_course_progress TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvl_student_disputes TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvl_student_homework_submissions TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvl_student_questions TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvl_students TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvl_training_feedback TO authenticated;     -- phase 38
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvl_training_sessions TO authenticated;     -- phase 38
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.questions TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.scenarios TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.shop_items TO authenticated;

    -- ── PART 2: Tier-2 — append-only защита для compliance ──
    GRANT SELECT, INSERT ON public.pvl_audit_log TO authenticated;

    -- ── PART 2b: billing (Фаза 1a) ──
    -- billing_plans: full CRUD (write гейтит RLS is_admin()); payment_orders: SELECT only.
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_plans  TO authenticated;
    GRANT SELECT                        ON public.payment_orders TO authenticated;

    -- ── PART 3: sequences для serial PK ──
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

    -- ── PART 4: EXECUTE на RLS-helper функции ──
    GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
    GRANT EXECUTE ON FUNCTION public.is_mentor_for(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.is_pvl_cohort_peer(uuid) TO authenticated;  -- phase 38

    -- ── PART 5: web_anon SELECT для public-read таблиц ──
    GRANT SELECT ON public.events    TO web_anon;
    GRANT SELECT ON public.cities    TO web_anon;
    GRANT SELECT ON public.notebooks TO web_anon;
    GRANT SELECT ON public.questions TO web_anon;

    -- ── PART 6: PostgREST schema cache reload ──
    NOTIFY pgrst, 'reload schema';
END;
$function$;

SELECT public.ensure_garden_grants();  -- RUNBOOK §1.3

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- VERIFY (вне транзакции)
-- ─────────────────────────────────────────────────────────────────────
\echo === V1: тарифы засижены (ожидаем 3) ===
SELECT code, title, months, amount_rub, active FROM public.billing_plans ORDER BY sort;

\echo === V2: payment_orders колонки + типы ===
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name='payment_orders' ORDER BY ordinal_position;

\echo === V3: индексы payment_orders (ожидаем 4: pk + user + status + extpay + uniq) ===
SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='payment_orders' ORDER BY 1;

\echo === V4: RLS-политики (ожидаем billing_plans_select_active, payment_orders_select_own_or_admin) ===
SELECT tablename, policyname, cmd FROM pg_policies
WHERE schemaname='public' AND tablename IN ('billing_plans','payment_orders') ORDER BY 1,2;

\echo === V5: RLS включён на обеих + гранты authenticated=SELECT ===
SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('billing_plans','payment_orders');
SELECT table_name, privilege_type FROM information_schema.role_table_grants
WHERE grantee='authenticated' AND table_name IN ('billing_plans','payment_orders') ORDER BY 1,2;

\echo === V6: ensure_garden_grants() содержит billing (ожидаем 2 совпадения) ===
SELECT count(*) AS billing_lines_in_fn
FROM regexp_matches(pg_get_functiondef('public.ensure_garden_grants()'::regprocedure), 'public\.(billing_plans|payment_orders)', 'g');

\echo === V7: НЕ тронули живой биллинг (subscriptions/billing_webhook_logs существуют, paid_until цел) ===
SELECT to_regclass('public.subscriptions') AS subs, to_regclass('public.billing_webhook_logs') AS logs,
       (SELECT count(*) FROM public.profiles WHERE paid_until IS NOT NULL) AS profiles_with_paid_until;

\echo === V8: ensure_garden_grants() прогоняется ЧИСТО повторно (recovery-функция цела) ===
SELECT public.ensure_garden_grants();
\echo '(если строк ошибок нет выше — функция валидна, daily-wipe recovery не сломан)'
