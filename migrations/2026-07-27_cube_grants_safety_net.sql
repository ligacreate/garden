-- Кубик ведущей — ensure_garden_grants() узнаёт про cube_participants и cube_cells.
--
-- ЗАЧЕМ ЭТОТ ФАЙЛ ОТДЕЛЬНО
--   Timeweb сносил кастомные GRANT'ы вскоре после DDL — два P0 за май 2026
--   (RUNBOOK §1.3). Защита: монитор /opt/garden-monitor/check_grants.sh каждую
--   минуту ловит просадку и зовёт recover_grants.sh → ensure_garden_grants().
--   Но функция выдаёт права только тем таблицам, которые в ней перечислены.
--   Не добавить туда cube_* — значит после ближайшего wipe вся платформа
--   восстановится, а кубик останется мёртвым с 42501, и монитор промолчит:
--   его порог (authenticated < 100) двумя таблицами не пробить.
--
-- ПОРЯДОК: строго ПОСЛЕ 2026-07-27_cube_participants_and_gate.sql
--          и 2026-07-27_cube_cells.sql — тела грантов ссылаются на их таблицы.
--
-- ТЕЛО ФУНКЦИИ взято из последней версии в репозитории —
--   database/pvl/migrations/2026-07-09_phase45_billing_plans_orders.sql —
--   и дополнено четырьмя строками (два GRANT на таблицы, два EXECUTE на
--   хелперы). Больше в теле не изменено ничего.
--
-- ЗАЩИТА ОТ ДРЕЙФА: перед заменой проверяем, что на проде лежит ожидаемая
--   версия. Если кто-то менял функцию мимо репозитория, миграция падает и не
--   затирает чужие правки. Тогда порядок такой: снять актуальное тело
--     SELECT prosrc FROM pg_proc WHERE proname = 'ensure_garden_grants';
--   дописать в него те же четыре строки и пересобрать этот файл.

\set ON_ERROR_STOP on

BEGIN;

-- ── 0. Pre-check: на проде ожидаемая версия функции ─────────────────────────
DO $$
DECLARE
    v_src text;
BEGIN
    SELECT p.prosrc INTO v_src
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'ensure_garden_grants';

    IF v_src IS NULL THEN
        RAISE EXCEPTION 'ensure_garden_grants() не найдена — не тот стенд или функция удалена';
    END IF;

    -- Маркеры phase38/40/45. Если их нет — на проде версия старше или другая.
    IF v_src NOT LIKE '%pvl_training_sessions%'
       OR v_src NOT LIKE '%pvl_student_certification_mentor%'
       OR v_src NOT LIKE '%billing_plans%'
    THEN
        RAISE EXCEPTION 'Тело ensure_garden_grants() на проде не совпадает с ожидаемым (нет маркеров phase38/40/45). Снять prosrc и пересобрать миграцию, не затирая чужие правки.';
    END IF;

    IF v_src LIKE '%cube_cells%' THEN
        RAISE NOTICE 'ensure_garden_grants() уже знает про cube_* — миграция просто перезапишет тем же телом';
    END IF;
END $$;

-- ── 1. Прямые гранты (на случай если wipe уже случился) ─────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cube_participants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cube_cells        TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_course_staff()     TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_cube_participant() TO authenticated;

-- ── 2. Функция ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ensure_garden_grants()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- ── PART 1: Tier-1 — full CRUD для authenticated (43 таблицы) ──
    -- Источник: phase 16 PART 1 + phase 38 + phase 40 (swap certification tables)
    --           + Кубик ведущей (2026-07-27).
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.birthday_templates TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.cities TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_progress TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.cube_cells TO authenticated;         -- Кубик
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.cube_participants TO authenticated;  -- Кубик
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
    GRANT EXECUTE ON FUNCTION public.is_course_staff() TO authenticated;         -- Кубик
    GRANT EXECUTE ON FUNCTION public.is_cube_participant() TO authenticated;     -- Кубик

    -- ── PART 5: web_anon SELECT для public-read таблиц ──
    -- cube_* сюда НЕ добавляем сознательно: наружу кубик не показывается.
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

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFY (вне транзакции)
-- ─────────────────────────────────────────────────────────────────────────────

\echo === V1: функция знает про кубик (ожидание: обе t) ===
SELECT prosrc LIKE '%cube_cells%'       AS knows_cube_cells,
       prosrc LIKE '%cube_participants%' AS knows_cube_participants
FROM pg_proc WHERE proname = 'ensure_garden_grants' AND pronamespace = 'public'::regnamespace;

\echo === V2: гранты на cube_* реально выданы ===
SELECT table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'authenticated' AND table_schema = 'public'
  AND table_name IN ('cube_cells', 'cube_participants')
ORDER BY table_name, privilege_type;

\echo === V3: общий счётчик грантов не просел (ожидание: authenticated >= 100, web_anon = 4) ===
SELECT grantee, count(*) AS grants
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee IN ('authenticated', 'web_anon')
GROUP BY grantee ORDER BY grantee;

-- ─────────────────────────────────────────────────────────────────────────────
-- ОТКАТ
-- ─────────────────────────────────────────────────────────────────────────────
-- Вернуть тело функции из database/pvl/migrations/2026-07-09_phase45_billing_plans_orders.sql
-- (блок CREATE OR REPLACE FUNCTION public.ensure_garden_grants) и выполнить его.
-- Гранты на cube_* при этом останутся выданными — снимать их отдельно не нужно.
