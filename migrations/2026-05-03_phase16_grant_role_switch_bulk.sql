-- migrations/2026-05-03_phase16_grant_role_switch_bulk.sql
--
-- SEC-001 phase 16 — bulk GRANT для authenticated на 40 таблиц.
--
-- Контекст:
--   После SEC-001 PostgREST переключился на role-switch через JWT
--   (роль authenticated/web_anon из JWT-claim). DDL-блок с
--   GRANT ... TO authenticated был пропущен в фазах 1-15+14.5 → у роли
--   authenticated не было даже SELECT на public-таблицы.
--   Live-smoke 2026-05-03 поймал блокер: alert "permission denied for
--   table profiles" на каждом login (NEW-BUG-007). До этого баг был
--   замаскирован stale SW-cache; шаг 3 batch frontend fix
--   (purge legacy caches, commit bf57606) обнажил дыру.
--
-- Диагностика (read-only SELECT'ы, см. docs/EXEC_2026-05-03_post_smoke_repeat.md):
--   Q1: GRANTS на public.profiles → только gen_user, ни authenticated, ни web_anon
--   Q2: RLS state → relrowsecurity=t, relforcerowsecurity=f
--   Q3: 4 policies на profiles (select_authenticated, insert_own, update_own, update_admin)
--   Q4: 45 public-таблиц без SELECT для authenticated
--   Q5a: web_anon → 0 grants (anon не делает PostgREST-запросов на фронте)
--   Q5b: фронт-разведка → anon-context bezопасен; первый PostgREST-call
--        идёт после login через _fetchProfile → попадает в 42501
--   Q6: 40 из 45 имеют RLS-policies; 5 без policies (RLS deny by default)
--   Q7: messages, push_subscriptions, events_archive, to_archive, users_auth
--       → RLS=on без policies, deferred-таски
--   Q8: 0 таблиц с RLS=off среди 45 → защита не дырявая
--
-- Контракт:
--   Tier-1: GRANT SELECT, INSERT, UPDATE, DELETE на 39 таблиц
--   Tier-2: GRANT SELECT, INSERT на pvl_audit_log (append-only audit)
--   sequences: GRANT USAGE on all sequences (превентивно для serial PK)
--   NOTIFY pgrst, 'reload schema' — заставить PostgREST обновить кэш ACL
--
-- Не включены (deferred / closed):
--   messages           — SEC-007 (нужны новые RLS-policies, фронт активно использует)
--   push_subscriptions — SEC-008 (fallback INSERT, push-server главный)
--   users_auth         — auth-service internal, не для PostgREST API (0 фронт-callsites)
--   events_archive     — read-only архив, фронт не читает
--   to_archive         — read-only архив, фронт не читает
--
-- Связанные документы:
--   docs/EXEC_2026-05-03_post_smoke_repeat.md
--   docs/EXEC_2026-05-03_post_smoke_diag_403_inserts.md
--
-- Apply: psql под gen_user, \set ON_ERROR_STOP on, \i этот файл.
-- Verify-блок ниже исполнится после COMMIT (отдельные SELECT'ы вне транзакции).

\set ON_ERROR_STOP on

BEGIN;

-- ── PART 1: Tier-1 — full CRUD для authenticated (39 таблиц, по алфавиту) ──
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
GRANT SELECT, INSERT ON public.pvl_audit_log TO authenticated;

-- ── PART 3: sequences для serial PK ──
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ── PART 4: PostgREST schema cache reload ──
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- VERIFY-блок (исполняется после COMMIT, вне транзакции)
-- ─────────────────────────────────────────────────────────────────────

\echo === V1: гранты на authenticated ===
SELECT table_name, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee = 'authenticated'
GROUP BY table_name
ORDER BY table_name;

\echo === V2: контрольный пробег Q4 — public-таблицы без SELECT для authenticated ===
\echo Ожидание: events_archive, messages, push_subscriptions, to_archive, users_auth (5 строк)
SELECT t.table_name
FROM information_schema.tables t
WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants g
    WHERE g.table_schema = t.table_schema AND g.table_name = t.table_name
      AND g.grantee = 'authenticated' AND g.privilege_type = 'SELECT'
  )
ORDER BY t.table_name;
