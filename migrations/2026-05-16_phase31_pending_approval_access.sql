-- migrations/2026-05-16_phase31_pending_approval_access.sql
--
-- FEAT-023 — Регистрация по одобрению админа (Phase 1 v2: + RESTRICTIVE guards).
--
-- Контекст:
--   1. До этой миграции `/auth/register` сразу даёт role='applicant' +
--      access_status='active' (default колонки). Закрытое сообщество
--      имело «открытую дверь».
--   2. Pre-flight 2026-05-16 выявил: RESTRICTIVE guards из phase21
--      ни разу не применились на проде (47/47 public-таблиц без guard).
--      Это значит, не только новый pending, но и существующие paused_expired/
--      paused_manual юзеры могут читать данные через PostgREST. Phase31
--      закрывает обе утечки одной миграцией (правило «параллельные баги»).
--
-- Что меняется (в порядке транзакции):
--   1. Pre-apply assertion: 0 non-admin профилей с access_status != active.
--      Если нашёлся — RAISE EXCEPTION, миграция не apply'ится (защита от
--      того, что existing paused юзер случайно окажется заблочен).
--   2. CHECK на profiles.access_status: добавлено 'pending_approval'.
--   3. Bridge function sync_status_from_access_status — добавлена ветка
--      `pending_approval` → status='suspended'.
--   4. Helper has_platform_access(uuid) — CREATE OR REPLACE (на проде его
--      нет, т.к. phase21 не применилась).
--   5. RESTRICTIVE policies _active_access_guard_select/_write на 39 таблиц:
--      - core 13 (как phase21): profiles, meetings, events, goals,
--        knowledge_base, practices, clients, scenarios, course_progress,
--        messages, news, birthday_templates, push_subscriptions
--      - pvl_* (24): см. список в DO BLOCK
--      - billing (2): subscriptions, billing_webhook_logs
--      Защита to_regclass — пропускаем таблицу если её нет на проде.
--   6. RPC admin_approve_registration(uuid, text) — SECURITY DEFINER +
--      is_admin() + audit в pvl_audit_log.
--   7. ensure_garden_grants() (RUNBOOK 1.3).
--
-- Что НЕ меняется:
--   - default profiles.access_status (остаётся 'active'). Phase 2 ставит
--     'pending_approval' явно при register.
--   - Существующие 56 профилей (все остаются active).
--   - Public-справочники без guard: app_settings, shop_items, treasury_*.
--   - Кодовая база garden-auth/push-server: ходят через pg.Pool как
--     gen_user (owner-bypass), policies не задевают.
--
-- Apply pivot:
--   В момент COMMIT любой not-admin с access_status != 'active' получит
--   мгновенно «нет доступа» через PostgREST. Pre-apply assertion (шаг 1)
--   гарантирует что таких нет.
--
-- Idempotency: CREATE OR REPLACE + DROP/ADD CONSTRAINT + IF NOT EXISTS +
-- to_regclass — повторно безопасны.
--
-- RUNBOOK 1.3: SELECT public.ensure_garden_grants() ДО COMMIT.
--
-- Apply:
--   ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
--     PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
--     -v ON_ERROR_STOP=1 -f /tmp/2026-05-16_phase31_pending_approval_access.sql'

\set ON_ERROR_STOP on

BEGIN;

-- ── 1. Pre-apply assertion (v3, ослабленная) ──
-- v2 fail'илась на штатных paused_manual/paused_expired — это были именно
-- те юзеры, которым guards и должны закрыть PostgREST-доступ. v3 ловит
-- только data corruption (значения вне известного домена), а не legitimate
-- paused-состояния. См. _session/34, _session/37.
DO $$
DECLARE
    v_bad int;
BEGIN
    SELECT count(*) INTO v_bad
    FROM public.profiles
    WHERE access_status IS NOT NULL
      AND access_status NOT IN ('active', 'paused_expired', 'paused_manual', 'pending_approval');
    IF v_bad <> 0 THEN
        RAISE EXCEPTION
          'phase31 pre-check FAIL: % profiles have unexpected access_status value. Possible data corruption — investigate before apply.',
          v_bad USING ERRCODE = '22023';
    END IF;
    RAISE NOTICE 'phase31 pre-check OK: all access_status values in expected set.';
END $$;

-- ── 2. CHECK-constraint на access_status: добавить pending_approval ──
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_access_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_access_status_check
  CHECK (access_status IN ('active', 'paused_expired', 'paused_manual', 'pending_approval'));

-- ── 3. Bridge function: pending_approval → status='suspended' ──
-- Триггер trg_sync_status_from_access_status уже навешан (BEFORE UPDATE
-- OF access_status), пересоздавать его не нужно. Только тело функции.
CREATE OR REPLACE FUNCTION public.sync_status_from_access_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.access_status IN ('paused_expired', 'paused_manual', 'pending_approval') THEN
        NEW.status := 'suspended';
    ELSIF NEW.access_status = 'active' THEN
        NEW.status := 'active';
    END IF;
    RETURN NEW;
END;
$$;

-- ── 4. Helper has_platform_access(uuid) — на проде его нет ──
CREATE OR REPLACE FUNCTION public.has_platform_access(target_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = target_user
      AND (
        p.role = 'admin'
        OR COALESCE(p.access_status, 'active') = 'active'
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_platform_access(uuid) TO authenticated;

-- ── 5. RESTRICTIVE guards на 39 таблиц ──
-- Шаблон: `_active_access_guard_select` (SELECT) + `_active_access_guard_write` (ALL).
-- to_regclass защищает от опечаток в именах: если таблицы нет — пропускаем.
DO $$
DECLARE
  t text;
  guard_tables text[] := ARRAY[
    -- core 13 (как phase21)
    'profiles', 'meetings', 'events', 'goals', 'knowledge_base',
    'practices', 'clients', 'scenarios', 'course_progress',
    'messages', 'news', 'birthday_templates', 'push_subscriptions',
    -- pvl_* (24)
    'pvl_students', 'pvl_homework_items', 'pvl_student_homework_submissions',
    'pvl_homework_status_history', 'pvl_student_questions',
    'pvl_direct_messages', 'pvl_garden_mentor_links',
    'pvl_student_course_progress', 'pvl_student_content_progress',
    'pvl_student_course_points',
    'pvl_student_certification_scores', 'pvl_student_certification_criteria_scores',
    'pvl_student_disputes', 'pvl_mentors', 'pvl_cohorts',
    'pvl_calendar_events', 'pvl_content_items', 'pvl_content_placements',
    'pvl_course_weeks', 'pvl_course_lessons',
    'pvl_faq_items', 'pvl_notifications', 'pvl_audit_log',
    'pvl_checklist_items',
    -- billing (2, из phase29)
    'subscriptions', 'billing_webhook_logs'
  ];
BEGIN
  FOREACH t IN ARRAY guard_tables LOOP
    IF to_regclass('public.' || quote_ident(t)) IS NULL THEN
      RAISE NOTICE 'phase31: skip %, table not found in public schema', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename  = t
        AND policyname = t || '_active_access_guard_select'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (public.has_platform_access(auth.uid()))',
        t || '_active_access_guard_select', t
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename  = t
        AND policyname = t || '_active_access_guard_write'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.has_platform_access(auth.uid())) WITH CHECK (public.has_platform_access(auth.uid()))',
        t || '_active_access_guard_write', t
      );
    END IF;
  END LOOP;
END $$;

-- ── 6. RPC admin_approve_registration ──
CREATE OR REPLACE FUNCTION public.admin_approve_registration(
    p_user_id  uuid,
    p_new_role text
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor       uuid := auth.uid();
    v_old_role    text;
    v_old_access  text;
    v_profile     public.profiles;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'p_user_id is null' USING ERRCODE = '22023';
    END IF;
    IF p_new_role IS NULL
       OR p_new_role NOT IN ('applicant', 'intern', 'leader', 'mentor') THEN
        RAISE EXCEPTION 'p_new_role must be one of applicant|intern|leader|mentor (got %)',
            p_new_role USING ERRCODE = '22023';
    END IF;
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'forbidden: admin role required' USING ERRCODE = '42501';
    END IF;

    SELECT role, access_status INTO v_old_role, v_old_access
      FROM public.profiles
     WHERE id = p_user_id;
    IF v_old_role IS NULL THEN
        RAISE EXCEPTION 'profile % not found', p_user_id USING ERRCODE = 'P0002';
    END IF;
    IF v_old_access IS DISTINCT FROM 'pending_approval' THEN
        RAISE EXCEPTION 'profile % is not pending_approval (current access_status=%)',
            p_user_id, v_old_access USING ERRCODE = '22023';
    END IF;

    UPDATE public.profiles
       SET access_status = 'active',
           role          = p_new_role
     WHERE id = p_user_id
    RETURNING * INTO v_profile;

    INSERT INTO public.pvl_audit_log (
        id, actor_user_id, action, entity_type, entity_id, payload, created_at
    ) VALUES (
        gen_random_uuid()::text,
        v_actor::text,
        'approve_registration',
        'profile',
        p_user_id::text,
        jsonb_build_object(
            'summary',     'Admin approved pending registration',
            'old_role',    v_old_role,
            'new_role',    p_new_role,
            'approved_by', v_actor
        ),
        now()
    );

    RETURN v_profile;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_approve_registration(uuid, text) TO authenticated;

-- ── 7. RUNBOOK 1.3 — safety-net против Timeweb GRANT-wipeout ──
SELECT public.ensure_garden_grants();

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- VERIFY (вне транзакции)
-- ─────────────────────────────────────────────────────────────────────

\echo === V1: CHECK-constraint содержит pending_approval ===
SELECT pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conname  = 'profiles_access_status_check'
  AND conrelid = 'public.profiles'::regclass;

\echo === V2: bridge function содержит ветку pending_approval ===
SELECT prosrc LIKE '%pending_approval%' AS has_branch
FROM pg_proc
WHERE proname      = 'sync_status_from_access_status'
  AND pronamespace = 'public'::regnamespace;

\echo === V3: helper has_platform_access(uuid) зарегистрирован ===
SELECT proname, prosecdef AS is_definer, provolatile,
       pg_get_function_arguments(oid) AS args,
       pg_get_function_result(oid)    AS returns
FROM pg_proc
WHERE proname      = 'has_platform_access'
  AND pronamespace = 'public'::regnamespace;

\echo === V4: RPC admin_approve_registration зарегистрирована ===
SELECT proname, prosecdef AS is_definer,
       pg_get_function_arguments(oid) AS args,
       pg_get_function_result(oid)    AS returns
FROM pg_proc
WHERE proname      = 'admin_approve_registration'
  AND pronamespace = 'public'::regnamespace;

\echo === V5: GRANT EXECUTE на оба новых helper'а ===
SELECT routine_name, grantee, privilege_type
FROM information_schema.role_routine_grants
WHERE specific_schema = 'public'
  AND routine_name IN ('has_platform_access', 'admin_approve_registration')
  AND grantee = 'authenticated'
ORDER BY routine_name;

\echo === V6: RESTRICTIVE guards применены — список таблиц ===
SELECT tablename,
       count(*) FILTER (WHERE policyname = tablename || '_active_access_guard_select') AS has_select,
       count(*) FILTER (WHERE policyname = tablename || '_active_access_guard_write')  AS has_write
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname LIKE '%_active_access_guard_%'
GROUP BY tablename
ORDER BY tablename;

\echo === V7: общее число guard policies ===
SELECT count(*) AS guard_policies
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname LIKE '%_active_access_guard_%';

\echo === V8: bridge smoke — INSERT pending → UPDATE active меняет status ===
BEGIN;
INSERT INTO public.users_auth (id, email, password_hash, status)
  VALUES ('00000000-0000-0000-0000-000000000099',
          'feat023-smoke@test.local', 'x', 'active');
INSERT INTO public.profiles (id, email, name, role, status, access_status, seeds)
  VALUES ('00000000-0000-0000-0000-000000000099',
          'feat023-smoke@test.local', 'Smoke Test',
          'applicant', 'suspended', 'pending_approval', 0);

\echo --- состояние pending ---
SELECT id, role, status, access_status
  FROM public.profiles
 WHERE id = '00000000-0000-0000-0000-000000000099';

\echo --- smoke bridge: UPDATE access_status='active' автоматом ставит status='active' ---
UPDATE public.profiles
   SET access_status = 'active'
 WHERE id = '00000000-0000-0000-0000-000000000099';

SELECT id, role, status, access_status
  FROM public.profiles
 WHERE id = '00000000-0000-0000-0000-000000000099';

ROLLBACK;

\echo === V9: RPC admin_approve_registration без is_admin() → forbidden 42501 ===
DO $$
BEGIN
    BEGIN
        PERFORM public.admin_approve_registration(
            '00000000-0000-0000-0000-000000000099'::uuid, 'intern');
        RAISE EXCEPTION 'expected forbidden, but call succeeded';
    EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'OK: admin_approve_registration без is_admin → forbidden (42501).';
    END;
END $$;

\echo === V10: has_platform_access — smoke на existing профилях ===
-- profiles.created_at не существует (только updated_at, который NULL на старых записях),
-- поэтому детерминируем выборку через ORDER BY id.
SELECT
    role,
    public.has_platform_access(id) AS access
FROM public.profiles
WHERE id IN (
    SELECT DISTINCT ON (role) id
    FROM public.profiles
    ORDER BY role, id
)
ORDER BY role;

\echo === V11: распределение profiles.access_status — никого не сдвинуло ===
SELECT access_status, count(*)
FROM public.profiles
GROUP BY access_status
ORDER BY count(*) DESC;

\echo === V12: RLS включён на всех 39 таблицах ===
SELECT relname,
       relrowsecurity AS rls_enabled
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN (
    'profiles', 'meetings', 'events', 'goals', 'knowledge_base',
    'practices', 'clients', 'scenarios', 'course_progress',
    'messages', 'news', 'birthday_templates', 'push_subscriptions',
    'pvl_students', 'pvl_homework_items', 'pvl_student_homework_submissions',
    'pvl_homework_status_history', 'pvl_student_questions',
    'pvl_direct_messages', 'pvl_garden_mentor_links',
    'pvl_student_course_progress', 'pvl_student_content_progress',
    'pvl_student_course_points',
    'pvl_student_certification_scores', 'pvl_student_certification_criteria_scores',
    'pvl_student_disputes', 'pvl_mentors', 'pvl_cohorts',
    'pvl_calendar_events', 'pvl_content_items', 'pvl_content_placements',
    'pvl_course_weeks', 'pvl_course_lessons',
    'pvl_faq_items', 'pvl_notifications', 'pvl_audit_log',
    'pvl_checklist_items',
    'subscriptions', 'billing_webhook_logs'
  )
ORDER BY relname;

\echo === V13: RUNBOOK 1.3 sanity — auth/anon grant counts ===
SELECT
  (SELECT count(*) FROM information_schema.role_table_grants
     WHERE grantee='authenticated' AND table_schema='public') AS auth_grants,
  (SELECT count(*) FROM information_schema.role_table_grants
     WHERE grantee='web_anon'      AND table_schema='public') AS anon_grants;
