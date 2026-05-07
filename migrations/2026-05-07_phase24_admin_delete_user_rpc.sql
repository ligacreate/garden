-- migrations/2026-05-07_phase24_admin_delete_user_rpc.sql
--
-- BUG-ADMIN-DELETE-USER + CLEAN-013 — RPC admin-only хард-удаления.
--
-- Проблема:
--   На public.profiles нет RLS-policy FOR DELETE. Полный набор:
--     profiles_insert_own, profiles_select_authenticated,
--     profiles_update_own, profiles_update_admin
--   GRANT DELETE для authenticated есть, но без policy RLS режет
--   любой DELETE до 0 rows → silent no-op в админке.
--   Verified read-only под gen_user 2026-05-07.
--
-- Решение:
--   SECURITY DEFINER RPC public.admin_delete_user_full(uuid).
--   Исполняется под gen_user (owner-bypass), явный is_admin()-чек,
--   audit-запись BEFORE delete, удаление в порядке "дети → родители".
--
-- FK-карта (см. RECON в чате):
--   FK на profiles:
--     course_progress.user_id  → CASCADE
--     meetings.user_id         → нет CASCADE, NOT NULL → DELETE first
--   Связи без FK (orphan-риск, чистим явно):
--     users_auth.id
--     pvl_students.id (→ каскадирует на 7 PVL-таблиц)
--     pvl_garden_mentor_links (student_id | mentor_id)
--     pvl_direct_messages (author_user_id | mentor_id | student_id)
--   Сознательно НЕ чистим (orphan по design — audit-trail):
--     pvl_audit_log.actor_user_id
--     pvl_homework_status_history.changed_by
--
-- Idempotency: CREATE OR REPLACE + GRANT повторно безопасны.
-- RUNBOOK 1.3: SELECT public.ensure_garden_grants() ДО COMMIT.
--
-- Apply:
--   ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
--     PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
--     -v ON_ERROR_STOP=1 -f /tmp/2026-05-07_phase24_admin_delete_user_rpc.sql'

\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_delete_user_full(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor uuid := auth.uid();
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'p_user_id is null' USING ERRCODE = '22023';
    END IF;
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'forbidden: admin role required' USING ERRCODE = '42501';
    END IF;

    -- Audit BEFORE delete (actor сохраняется до того как ссылочная
    -- цепочка может что-то стереть). entity_id и actor_user_id —
    -- text по схеме pvl_audit_log.
    INSERT INTO public.pvl_audit_log (
        id, actor_user_id, action, entity_type, entity_id, payload, created_at
    ) VALUES (
        gen_random_uuid()::text,
        v_actor::text,
        'admin_delete_user_full',
        'profile',
        p_user_id::text,
        jsonb_build_object(
            'summary', 'Admin hard-deleted user profile',
            'deleted_user_id', p_user_id
        ),
        now()
    );

    -- 1. meetings: FK без CASCADE → иначе FK violation на шаге 6
    DELETE FROM public.meetings WHERE user_id = p_user_id;

    -- 2. pvl_direct_messages: нет FK
    DELETE FROM public.pvl_direct_messages
    WHERE author_user_id = p_user_id
       OR mentor_id      = p_user_id
       OR student_id     = p_user_id;

    -- 3. pvl_garden_mentor_links: нет FK
    DELETE FROM public.pvl_garden_mentor_links
    WHERE student_id = p_user_id OR mentor_id = p_user_id;

    -- 4. pvl_students: каскадирует на 7 дочерних PVL-таблиц
    DELETE FROM public.pvl_students WHERE id = p_user_id;

    -- 5. users_auth: нет FK
    DELETE FROM public.users_auth WHERE id = p_user_id;

    -- 6. profiles: каскадирует на course_progress
    DELETE FROM public.profiles WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_user_full(uuid) TO authenticated;

-- RUNBOOK 1.3 — safety-net против Timeweb GRANT-wipeout после DDL.
-- ДО COMMIT, в той же транзакции.
SELECT public.ensure_garden_grants();

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- VERIFY (вне транзакции)
-- ─────────────────────────────────────────────────────────────────────

\echo === V1: функция admin_delete_user_full зарегистрирована, SECURITY DEFINER ===
SELECT proname, prosecdef AS is_definer,
       pg_get_function_arguments(oid) AS args,
       pg_get_function_result(oid) AS returns
FROM pg_proc
WHERE proname='admin_delete_user_full' AND pronamespace='public'::regnamespace;
-- ожидание: 1 строка, is_definer=t, args='p_user_id uuid', returns=void

\echo === V2: GRANT EXECUTE для authenticated ===
SELECT grantee, privilege_type
FROM information_schema.role_routine_grants
WHERE specific_schema='public' AND routine_name='admin_delete_user_full'
  AND grantee='authenticated';
-- ожидание: 1 строка, EXECUTE

\echo === V3: RUNBOOK 1.3 sanity — auth/anon grant counts ===
SELECT
  (SELECT count(*) FROM information_schema.role_table_grants
     WHERE grantee='authenticated' AND table_schema='public') AS auth_grants,
  (SELECT count(*) FROM information_schema.role_table_grants
     WHERE grantee='web_anon' AND table_schema='public') AS anon_grants;
-- ожидание: 158 / 4
