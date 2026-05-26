-- database/pvl/migrations/2026-05-26_phase38_pvl_training_breakfasts.sql
--
-- phase38 — Этап 1 ТЗ _134: личная страница участницы курса ПВЛ
-- + тренировочные завтраки + peer-отзывы.
--
-- Создаёт:
--   - таблица pvl_training_sessions (факт проведённого завтрака менти)
--   - таблица pvl_training_feedback (4-полевой отзыв peer-менти)
--   - helper is_pvl_cohort_peer(uuid) с фильтром role='applicant'
--     (отсекает 13 Garden-интернов из той же когорты — phase37 backfill,
--     см. _130_cohort_audit)
--   - trigger constraint лимита 2 сессий на менти
--   - RLS-политики (RESTRICTIVE guards + PERMISSIVE select/insert/update/delete)
--   - GRANTs на authenticated
--   - ОБНОВЛЯЕТ ensure_garden_grants() — добавляет 2 новые таблицы в Part 1,
--     чтобы daily Timeweb wipe + recover_grants.sh их восстанавливал
--     (см. SEC-014 phase 23 + memory project-garden-daily-wipe).
--
-- Apply (после 🟢 от стратега):
--   scp database/pvl/migrations/2026-05-26_phase38_pvl_training_breakfasts.sql \
--     root@5.129.251.56:/tmp/
--   ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
--     PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
--     -v ON_ERROR_STOP=1 -f /tmp/2026-05-26_phase38_pvl_training_breakfasts.sql'
--
-- После apply:
--   - обновить /opt/garden-monitor/recover_grants.sh: AUTH_CNT baseline 158 → 166
--     (39 → 41 таблиц × 4 priv = 164 + pvl_audit_log × 2 = 166)
--   - запустить /opt/garden-monitor/recover_grants.sh вручную для verify
--
-- ТЗ:    docs/_session/2026-05-26_134_strategist_tz_etap1_training_feedback.md
-- Recon: _129 (recon pvl student page) + _130_cohort1_audit

\set ON_ERROR_STOP on

BEGIN;

-- ============================================================================
-- Section 1: Таблица pvl_training_sessions
-- ============================================================================
CREATE TABLE pvl_training_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      uuid NOT NULL REFERENCES pvl_students(id) ON DELETE CASCADE,
  conducted_at    timestamptz NOT NULL,
  scenario_topic  text NOT NULL CHECK (length(scenario_topic) >= 1),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pvl_training_sessions_student_id
  ON pvl_training_sessions(student_id);
CREATE INDEX idx_pvl_training_sessions_conducted_at
  ON pvl_training_sessions(conducted_at);

-- ----------------------------------------------------------------------------
-- Triggered constraint: жёсткий лимит 2 сессий на менти (ТЗ §2 решение #3)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_pvl_training_sessions_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (SELECT count(*) FROM pvl_training_sessions
      WHERE student_id = NEW.student_id) >= 2 THEN
    RAISE EXCEPTION
      'Лимит тренировочных завтраков превышен (максимум 2 на менти)'
      USING HINT = 'Удалите старый завтрак через админа перед добавлением нового';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pvl_training_sessions_limit
  BEFORE INSERT ON pvl_training_sessions
  FOR EACH ROW EXECUTE FUNCTION enforce_pvl_training_sessions_limit();

CREATE TRIGGER trg_pvl_training_sessions_updated_at
  BEFORE UPDATE ON pvl_training_sessions
  FOR EACH ROW EXECUTE FUNCTION pvl_set_updated_at();

-- ============================================================================
-- Section 2: Таблица pvl_training_feedback
-- ============================================================================
CREATE TABLE pvl_training_feedback (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id               uuid NOT NULL REFERENCES pvl_training_sessions(id) ON DELETE CASCADE,
  author_id                uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  text_what_worked         text NOT NULL DEFAULT '',
  text_what_to_strengthen  text NOT NULL DEFAULT '',
  text_one_technique       text NOT NULL DEFAULT '',
  text_open_question       text NOT NULL DEFAULT '',
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, author_id)
);

CREATE INDEX idx_pvl_training_feedback_session_id
  ON pvl_training_feedback(session_id);
CREATE INDEX idx_pvl_training_feedback_author_id
  ON pvl_training_feedback(author_id);

CREATE TRIGGER trg_pvl_training_feedback_updated_at
  BEFORE UPDATE ON pvl_training_feedback
  FOR EACH ROW EXECUTE FUNCTION pvl_set_updated_at();

-- ============================================================================
-- Section 3: Helper is_pvl_cohort_peer (фильтр role='applicant' критичен —
-- отсекает 13 Garden-интернов из той же когорты, см. _130_cohort_audit)
-- ============================================================================
CREATE OR REPLACE FUNCTION is_pvl_cohort_peer(target_student uuid)
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM pvl_students me
    JOIN pvl_students them ON me.cohort_id = them.cohort_id
    JOIN profiles them_p   ON them_p.id = them.id
    WHERE me.id = auth.uid()
      AND them.id = target_student
      AND me.cohort_id IS NOT NULL
      AND them_p.role = 'applicant'
  );
$$;

-- Сразу выдать EXECUTE на authenticated — иначе RLS даст false под applicant.
GRANT EXECUTE ON FUNCTION is_pvl_cohort_peer(uuid) TO authenticated;

-- ============================================================================
-- Section 4: RLS — pvl_training_sessions
-- ============================================================================
ALTER TABLE pvl_training_sessions ENABLE ROW LEVEL SECURITY;

-- RESTRICTIVE guard (паттерн всех pvl_* — has_platform_access AND'ится поверх)
CREATE POLICY pvl_training_sessions_active_access_guard_select
  ON pvl_training_sessions AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (has_platform_access(auth.uid()));

CREATE POLICY pvl_training_sessions_active_access_guard_write
  ON pvl_training_sessions AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (has_platform_access(auth.uid()))
  WITH CHECK (has_platform_access(auth.uid()));

-- PERMISSIVE SELECT: own / mentor / cohort peer / admin
CREATE POLICY pvl_training_sessions_select
  ON pvl_training_sessions FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR is_mentor_for(student_id)
    OR is_pvl_cohort_peer(student_id)
    OR is_admin()
  );

-- PERMISSIVE INSERT: только сама менти
CREATE POLICY pvl_training_sessions_insert_own
  ON pvl_training_sessions FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());

-- PERMISSIVE UPDATE: сама менти (поправить тему/дату) + admin
CREATE POLICY pvl_training_sessions_update_own_or_admin
  ON pvl_training_sessions FOR UPDATE TO authenticated
  USING (student_id = auth.uid() OR is_admin())
  WITH CHECK (student_id = auth.uid() OR is_admin());

-- PERMISSIVE DELETE: только admin (ТЗ §2 решение #2)
CREATE POLICY pvl_training_sessions_delete_admin
  ON pvl_training_sessions FOR DELETE TO authenticated
  USING (is_admin());

-- ============================================================================
-- Section 5: RLS — pvl_training_feedback
-- ============================================================================
ALTER TABLE pvl_training_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY pvl_training_feedback_active_access_guard_select
  ON pvl_training_feedback AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (has_platform_access(auth.uid()));

CREATE POLICY pvl_training_feedback_active_access_guard_write
  ON pvl_training_feedback AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (has_platform_access(auth.uid()))
  WITH CHECK (has_platform_access(auth.uid()));

-- PERMISSIVE SELECT (ТЗ §2 решение #4 + #10):
--   автор видит свой отзыв (любой) — peer-confidentiality
--   владелец сессии видит ВСЕ отзывы на свою сессию
--   ментор владельца видит отзывы на сессии своих менти
--   admin — всё
CREATE POLICY pvl_training_feedback_select
  ON pvl_training_feedback FOR SELECT TO authenticated
  USING (
    author_id = auth.uid()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM pvl_training_sessions s
      WHERE s.id = pvl_training_feedback.session_id
        AND (s.student_id = auth.uid() OR is_mentor_for(s.student_id))
    )
  );

-- PERMISSIVE INSERT: peer из своей когорты, автор = я
CREATE POLICY pvl_training_feedback_insert_peer
  ON pvl_training_feedback FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM pvl_training_sessions s
      WHERE s.id = pvl_training_feedback.session_id
        AND is_pvl_cohort_peer(s.student_id)
    )
  );

-- PERMISSIVE UPDATE: автор редактирует свой (без 48ч ограничения — ТЗ §2 #5)
-- + admin
CREATE POLICY pvl_training_feedback_update_own_or_admin
  ON pvl_training_feedback FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR is_admin())
  WITH CHECK (author_id = auth.uid() OR is_admin());

-- PERMISSIVE DELETE: только admin
CREATE POLICY pvl_training_feedback_delete_admin
  ON pvl_training_feedback FOR DELETE TO authenticated
  USING (is_admin());

-- ============================================================================
-- Section 6: GRANTs
--   - прямые GRANT'ы — на текущий момент времени
--   - CREATE OR REPLACE ensure_garden_grants() — добавляет 2 таблицы в Part 1,
--     чтобы daily Timeweb wipe + ensure_garden_grants() их восстанавливал
--     (SEC-014 phase 23 + memory project-garden-daily-wipe)
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON pvl_training_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pvl_training_feedback TO authenticated;

CREATE OR REPLACE FUNCTION public.ensure_garden_grants()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- ── PART 1: Tier-1 — full CRUD для authenticated (41 таблица) ──
    -- Источник: phase 16 PART 1 + phase 38 (2 новые pvl_training_* таблицы).
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
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvl_training_feedback TO authenticated;     -- phase 38
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvl_training_sessions TO authenticated;     -- phase 38
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.questions TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.scenarios TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.shop_items TO authenticated;

    -- ── PART 2: Tier-2 — append-only защита для compliance ──
    GRANT SELECT, INSERT ON public.pvl_audit_log TO authenticated;

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
$$;

-- Сразу вызвать внутри той же транзакции (как в phase 23).
SELECT public.ensure_garden_grants();

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- VERIFY (вне транзакции)
-- ─────────────────────────────────────────────────────────────────────

\echo === V1: таблицы созданы ===
SELECT tablename FROM pg_tables
WHERE schemaname='public' AND tablename LIKE 'pvl_training_%'
ORDER BY tablename;
-- ожидание: 2 строки

\echo === V2: RLS включено + политики ===
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies_count
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public' AND c.relname LIKE 'pvl_training_%'
ORDER BY c.relname;
-- ожидание: оба rls_enabled=t, policies_count = 6 у sessions, 6 у feedback

\echo === V3: is_pvl_cohort_peer — функция создана, SECURITY DEFINER ===
SELECT proname, prosecdef AS is_definer,
       pg_get_function_arguments(oid) AS args,
       pg_get_function_result(oid) AS returns
FROM pg_proc
WHERE proname='is_pvl_cohort_peer' AND pronamespace='public'::regnamespace;
-- ожидание: 1 строка, is_definer=t, args='target_student uuid', returns=boolean

\echo === V4: triggers ===
SELECT trigger_name, event_manipulation, event_object_table, action_timing
FROM information_schema.triggers
WHERE event_object_schema='public'
  AND event_object_table LIKE 'pvl_training_%'
ORDER BY event_object_table, trigger_name;
-- ожидание: 3 trigger'а
--   trg_pvl_training_feedback_updated_at (BEFORE UPDATE)
--   trg_pvl_training_sessions_limit      (BEFORE INSERT)
--   trg_pvl_training_sessions_updated_at (BEFORE UPDATE)

\echo === V5: authenticated grant-rows (ожидание: 166) ===
SELECT count(*) AS authenticated_grants
FROM information_schema.role_table_grants
WHERE grantee='authenticated' AND table_schema='public';
-- 41 таблица × 4 priv = 164 + pvl_audit_log × 2 = 166

\echo === V6: web_anon grant-rows (ожидание: 4) ===
SELECT count(*) AS web_anon_grants
FROM information_schema.role_table_grants
WHERE grantee='web_anon' AND table_schema='public';

\echo === V7: EXECUTE grants на is_pvl_cohort_peer ===
SELECT EXISTS (
  SELECT 1 FROM information_schema.role_routine_grants
  WHERE specific_schema='public' AND routine_name='is_pvl_cohort_peer'
    AND grantee='authenticated' AND privilege_type='EXECUTE'
) AS auth_has_exec_cohort_peer;
-- ожидание: t
