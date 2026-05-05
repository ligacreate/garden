-- migrations/2026-05-05_phase23_grants_safety_net.sql
--
-- SEC-014 phase 23 — safety net против повторных wipe'ов кастомных GRANT'ов
-- на authenticated/web_anon после DDL-миграций.
--
-- Контекст:
--   2 P0 GRANT WIPEOUT за 2 дня (2026-05-04 после phase 21 +
--   2026-05-05 после phase 22). Recovery каждый раз — re-apply
--   phase 16 + 17 + 18 PART 1.
--
--   Гипотеза: Timeweb managed-Postgres делает массовый REVOKE
--   кастомных grants (или resync ACL с some baseline) после
--   schema-changing операций. Точная природа неизвестна (event-
--   triggers пустые, никто из людей в Timeweb UI не заходил).
--   Тикет в support — отдельным таском.
--
-- Защита трёхслойная (полный набор — SEC-014):
--   1. **stored procedure** ensure_garden_grants() — этот файл.
--      Идемпотентная функция, приводит ACL в нужное состояние
--      одной командой `SELECT public.ensure_garden_grants()`.
--   2. inline-call в каждой будущей DDL-миграции (см. RUNBOOK 1.3) —
--      сразу после изменений схемы, ДО COMMIT.
--   3. cron-monitor scripts/check_grants.sh + auto-recovery
--      scripts/recover_grants.sh (сервер /opt/garden-monitor/).
--
-- Контракт ensure_garden_grants():
--   PART 1. Re-apply phase 16 PART 1: GRANT SELECT/INSERT/UPDATE/DELETE
--           для authenticated на 39 явно перечисленных public-таблиц.
--   PART 2. Re-apply phase 16 PART 2: GRANT SELECT, INSERT на pvl_audit_log
--           (Tier-2 append-only).
--   PART 3. Re-apply phase 16 PART 3: GRANT USAGE ON ALL SEQUENCES
--           TO authenticated.
--   PART 4. Re-apply phase 17: GRANT EXECUTE на is_admin(),
--           is_mentor_for(uuid) для authenticated.
--   PART 5. Re-apply phase 18 PART 1: GRANT SELECT для web_anon
--           на 4 таблицы (events, cities, notebooks, questions).
--           PART 2 phase 18 (REVOKE writes на events) НЕ повторяем —
--           откатано в phase 19.
--   PART 6. NOTIFY pgrst, 'reload schema'.
--
-- Источники истины:
--   migrations/2026-05-03_phase16_grant_role_switch_bulk.sql
--   migrations/2026-05-03_phase17_grant_execute_rls_helpers.sql
--   migrations/2026-05-04_phase18_meetings_anon_read_revoke_events_writes.sql
--
-- SECURITY DEFINER + SET search_path = public → исполняется под
-- gen_user (owner) с явным search_path; безопасно для cron-вызова
-- от любой роли с EXECUTE.
--
-- Apply: scp + psql под gen_user.
--
--   ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
--     PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
--     -v ON_ERROR_STOP=1 -f /tmp/2026-05-05_phase23_grants_safety_net.sql'

\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION public.ensure_garden_grants()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- ── PART 1: Tier-1 — full CRUD для authenticated (39 таблиц) ──
    -- Источник: phase 16 PART 1.
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
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvl_student_certification_criteria_scores TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvl_student_certification_scores TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvl_student_content_progress TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvl_student_course_points TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvl_student_course_progress TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvl_student_disputes TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvl_student_homework_submissions TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvl_student_questions TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvl_students TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.questions TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.scenarios TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.shop_items TO authenticated;

    -- ── PART 2: Tier-2 — append-only защита для compliance ──
    -- Источник: phase 16 PART 2.
    GRANT SELECT, INSERT ON public.pvl_audit_log TO authenticated;

    -- ── PART 3: sequences для serial PK ──
    -- Источник: phase 16 PART 3.
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

    -- ── PART 4: EXECUTE на RLS-helper функции ──
    -- Источник: phase 17.
    GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
    GRANT EXECUTE ON FUNCTION public.is_mentor_for(uuid) TO authenticated;

    -- ── PART 5: web_anon SELECT для public-read таблиц ──
    -- Источник: phase 18 PART 1. PART 2 phase 18 (REVOKE writes
    -- на events для authenticated) откатано в phase 19, не повторяем.
    GRANT SELECT ON public.events    TO web_anon;
    GRANT SELECT ON public.cities    TO web_anon;
    GRANT SELECT ON public.notebooks TO web_anon;
    GRANT SELECT ON public.questions TO web_anon;

    -- ── PART 6: PostgREST schema cache reload ──
    NOTIFY pgrst, 'reload schema';
END;
$$;

-- Сразу вызвать внутри той же транзакции — на случай если Timeweb
-- revoke происходит синхронно с COMMIT DDL-миграции, чтобы новый
-- ACL применился до возврата на caller.
SELECT public.ensure_garden_grants();

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- VERIFY (вне транзакции)
-- ─────────────────────────────────────────────────────────────────────

\echo === V1: authenticated grant-rows на public-таблицы (ожидание: 158) ===
SELECT count(*) AS authenticated_grants
FROM information_schema.role_table_grants
WHERE grantee='authenticated' AND table_schema='public';
-- 39 таблиц × 4 priv (SELECT,INSERT,UPDATE,DELETE) = 156
-- + pvl_audit_log × 2 (SELECT,INSERT) = 2
-- = 158

\echo === V2: web_anon grant-rows на public-таблицы (ожидание: 4) ===
SELECT count(*) AS web_anon_grants
FROM information_schema.role_table_grants
WHERE grantee='web_anon' AND table_schema='public';
-- events, cities, notebooks, questions × 1 priv (SELECT) = 4

\echo === V3: ensure_garden_grants() — функция создана, SECURITY DEFINER ===
SELECT proname, prosecdef AS is_definer,
       pg_get_function_arguments(oid) AS args,
       pg_get_function_result(oid) AS returns
FROM pg_proc
WHERE proname='ensure_garden_grants' AND pronamespace='public'::regnamespace;
-- ожидание: 1 строка, is_definer=t, args=пусто, returns=void

\echo === V4: EXECUTE grants на is_admin, is_mentor_for ===
SELECT
  p.proname,
  EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants g
    WHERE g.specific_schema='public' AND g.routine_name=p.proname
      AND g.grantee='authenticated' AND g.privilege_type='EXECUTE'
  ) AS auth_has_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('is_admin','is_mentor_for')
ORDER BY p.proname;
-- ожидание: обе t
