-- database/pvl/migrations/2026-05-28_phase40_pvl_certification_split.sql
--
-- phase40 — split старой pvl_student_certification_scores/_criteria_scores
-- на две таблицы pvl_student_certification_self + pvl_student_certification_mentor
-- для двойного parallel-blind assessment Сертификационного завтрака (Этап 2).
--
-- Базируется на ТЗ _144 §3.1 (обновлён 2026-05-28: SELECT-политики
-- упрощены до Варианта А — без cross-EXISTS, см. _145 §5 и _147),
-- recon _142 (DDL/код), _143 (live SQL).
--
-- Apply:
--   ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
--     PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
--     -v ON_ERROR_STOP=1 -f /tmp/2026-05-28_phase40_pvl_certification_split.sql'
--
-- recover_grants.sh — НЕ ПРАВИТСЯ (см. _145 §8): на VPS это bash-wrapper
-- над public.ensure_garden_grants(), все GRANT'ы живут в DB-proc'е. После
-- apply вручную: `/opt/garden-monitor/recover_grants.sh` → должен дать
-- AUTH_CNT=166 / ANON_CNT=4 без exit 1.
--
-- ensure_garden_grants() — ОБНОВЛЯЕТСЯ внутри этой миграции:
-- в Part 1 swap старых 2 таблиц на новые 2 (net 41 → 41 таблица).
-- Без swap'а финальный `SELECT public.ensure_garden_grants();` упал бы
-- на GRANT'е дропнутой таблицы. Прецедент — phase38.

\set ON_ERROR_STOP on

BEGIN;

-- ---------------------------------------------------------------------------
-- Section 1: ПРЕДУСЛОВИЯ — проверить пустоту старых таблиц + обработать
--                          FK от disputes
-- ---------------------------------------------------------------------------

DO $$
DECLARE n_scores int; n_criteria int; n_disputes int;
BEGIN
  SELECT count(*) INTO n_scores FROM pvl_student_certification_scores;
  SELECT count(*) INTO n_criteria FROM pvl_student_certification_criteria_scores;
  SELECT count(*) INTO n_disputes
    FROM pvl_student_disputes WHERE certification_score_id IS NOT NULL;
  IF n_scores > 0 OR n_criteria > 0 THEN
    RAISE EXCEPTION 'phase40 ABORT: certification tables not empty (scores=%, criteria=%). Manual data migration needed.',
      n_scores, n_criteria;
  END IF;
  IF n_disputes > 0 THEN
    RAISE EXCEPTION 'phase40 ABORT: pvl_student_disputes has % rows with certification_score_id. Resolve disputes data first.',
      n_disputes;
  END IF;
END $$;

-- Disputes FK на старую _scores — DROP CONSTRAINT и потом ALTER колонку
-- (в Этапе 2 disputes не используем; колонку оставляем, FK пересоздаём после)
ALTER TABLE pvl_student_disputes
  DROP CONSTRAINT IF EXISTS pvl_student_disputes_certification_score_id_fkey;

-- ---------------------------------------------------------------------------
-- Section 2: DROP старых таблиц (CASCADE — на случай других зависимостей)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS pvl_student_certification_criteria_scores CASCADE;
DROP TABLE IF EXISTS pvl_student_certification_scores CASCADE;

-- ---------------------------------------------------------------------------
-- Section 3: pvl_student_certification_self
-- ---------------------------------------------------------------------------
CREATE TABLE pvl_student_certification_self (
  student_id uuid PRIMARY KEY REFERENCES pvl_students(id) ON DELETE CASCADE,
  cohort_id uuid REFERENCES pvl_cohorts(id),
  certification_version text NOT NULL DEFAULT '2026-spring',

  -- 18 критериев: { "A1": 2, "A2": 3, ..., "F3": 1 }
  -- Ключи — letter+index из SZ_ASSESSMENT_SECTIONS, значения 0..3
  criteria_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  score_total int NOT NULL DEFAULT 0
    CHECK (score_total >= 0 AND score_total <= 54),

  -- 6 рефлексий: { "prompt_1": "...", "prompt_2": "...", ..., "prompt_6": "..." }
  reflections jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Критические условия: ["critical_1", "critical_5", ...] — id из SZ_ASSESSMENT_CRITICAL
  critical_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  critical_comment text,

  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'revision')),
  submitted_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pvl_student_certification_self_cohort
  ON pvl_student_certification_self(cohort_id);
CREATE INDEX idx_pvl_student_certification_self_status
  ON pvl_student_certification_self(status);

CREATE TRIGGER trg_pvl_student_certification_self_updated_at
  BEFORE UPDATE ON pvl_student_certification_self
  FOR EACH ROW EXECUTE FUNCTION pvl_set_updated_at();

-- ---------------------------------------------------------------------------
-- Section 4: pvl_student_certification_mentor
-- ---------------------------------------------------------------------------
CREATE TABLE pvl_student_certification_mentor (
  student_id uuid PRIMARY KEY REFERENCES pvl_students(id) ON DELETE CASCADE,
  mentor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  cohort_id uuid REFERENCES pvl_cohorts(id),
  certification_version text NOT NULL DEFAULT '2026-spring',

  -- Симметрично self
  criteria_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  score_total int NOT NULL DEFAULT 0
    CHECK (score_total >= 0 AND score_total <= 54),
  reflections jsonb NOT NULL DEFAULT '{}'::jsonb,
  critical_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  critical_comment text,

  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'revision')),
  submitted_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pvl_student_certification_mentor_mentor
  ON pvl_student_certification_mentor(mentor_id);
CREATE INDEX idx_pvl_student_certification_mentor_cohort
  ON pvl_student_certification_mentor(cohort_id);
CREATE INDEX idx_pvl_student_certification_mentor_status
  ON pvl_student_certification_mentor(status);

CREATE TRIGGER trg_pvl_student_certification_mentor_updated_at
  BEFORE UPDATE ON pvl_student_certification_mentor
  FOR EACH ROW EXECUTE FUNCTION pvl_set_updated_at();

-- Auto-fill mentor_id из auth.uid() (так клиент его не передаёт и не может подменить)
CREATE OR REPLACE FUNCTION pvl_set_certification_mentor_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.mentor_id := auth.uid();
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.mentor_id := OLD.mentor_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pvl_student_certification_mentor_set_mentor_id
  BEFORE INSERT OR UPDATE ON pvl_student_certification_mentor
  FOR EACH ROW EXECUTE FUNCTION pvl_set_certification_mentor_id();

-- ---------------------------------------------------------------------------
-- Section 5: RLS — pvl_student_certification_self
-- ---------------------------------------------------------------------------
ALTER TABLE pvl_student_certification_self ENABLE ROW LEVEL SECURITY;

-- RESTRICTIVE access guards (шаблон C)
CREATE POLICY pvl_student_certification_self_active_access_guard_select
  ON pvl_student_certification_self AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (has_platform_access(auth.uid()));

CREATE POLICY pvl_student_certification_self_active_access_guard_write
  ON pvl_student_certification_self AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (has_platform_access(auth.uid()))
  WITH CHECK (has_platform_access(auth.uid()));

-- PERMISSIVE SELECT: parallel-blind (Вариант А, см. _145 §5 + _147)
--   menti видит свою self всегда
--   ментор видит self своей menti — ТОЛЬКО когда self.status='submitted'
--   admin видит всё
--
-- LESSON: cross-EXISTS clauses между _self ↔ _mentor вызывают
-- "infinite recursion detected in policy" (см. _145 §5). НЕ возвращать.
CREATE POLICY pvl_student_certification_self_select_blind
  ON pvl_student_certification_self FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR is_admin()
    OR (
      is_mentor_for(student_id)
      AND status = 'submitted'
    )
  );

-- PERMISSIVE INSERT: только сама menti, status='draft'
CREATE POLICY pvl_student_certification_self_insert_own
  ON pvl_student_certification_self FOR INSERT TO authenticated
  WITH CHECK (
    student_id = auth.uid()
    AND status = 'draft'
  );

-- PERMISSIVE UPDATE для menti: только если status != 'submitted'
CREATE POLICY pvl_student_certification_self_update_own
  ON pvl_student_certification_self FOR UPDATE TO authenticated
  USING (
    student_id = auth.uid()
    AND status IN ('draft', 'revision')
  )
  WITH CHECK (
    student_id = auth.uid()
    AND status IN ('draft', 'submitted')
  );

-- PERMISSIVE UPDATE для admin (revision-разлок и любые правки)
CREATE POLICY pvl_student_certification_self_update_admin
  ON pvl_student_certification_self FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- PERMISSIVE DELETE: только admin
CREATE POLICY pvl_student_certification_self_delete_admin
  ON pvl_student_certification_self FOR DELETE TO authenticated
  USING (is_admin());

-- ---------------------------------------------------------------------------
-- Section 6: RLS — pvl_student_certification_mentor — симметрично self
-- ---------------------------------------------------------------------------
ALTER TABLE pvl_student_certification_mentor ENABLE ROW LEVEL SECURITY;

CREATE POLICY pvl_student_certification_mentor_active_access_guard_select
  ON pvl_student_certification_mentor AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (has_platform_access(auth.uid()));

CREATE POLICY pvl_student_certification_mentor_active_access_guard_write
  ON pvl_student_certification_mentor AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (has_platform_access(auth.uid()))
  WITH CHECK (has_platform_access(auth.uid()));

-- PERMISSIVE SELECT: parallel-blind симметрично (Вариант А)
--   ментор видит свою mentor-запись всегда
--   menti видит mentor-запись о себе — ТОЛЬКО когда mentor.status='submitted'
--   admin видит всё
--
-- LESSON: cross-EXISTS clauses между _mentor ↔ _self вызывают
-- "infinite recursion detected in policy" (см. _145 §5). НЕ возвращать.
CREATE POLICY pvl_student_certification_mentor_select_blind
  ON pvl_student_certification_mentor FOR SELECT TO authenticated
  USING (
    mentor_id = auth.uid()
    OR is_admin()
    OR (
      student_id = auth.uid()
      AND status = 'submitted'
    )
  );

-- PERMISSIVE INSERT: только активный ментор этой menti, status='draft'
-- mentor_id автоматически = auth.uid() через trigger pvl_set_certification_mentor_id
CREATE POLICY pvl_student_certification_mentor_insert_mentor
  ON pvl_student_certification_mentor FOR INSERT TO authenticated
  WITH CHECK (
    is_mentor_for(student_id)
    AND status = 'draft'
  );

-- PERMISSIVE UPDATE для ментора: только если status != 'submitted'
CREATE POLICY pvl_student_certification_mentor_update_mentor
  ON pvl_student_certification_mentor FOR UPDATE TO authenticated
  USING (
    mentor_id = auth.uid()
    AND is_mentor_for(student_id)
    AND status IN ('draft', 'revision')
  )
  WITH CHECK (
    mentor_id = auth.uid()
    AND status IN ('draft', 'submitted')
  );

CREATE POLICY pvl_student_certification_mentor_update_admin
  ON pvl_student_certification_mentor FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY pvl_student_certification_mentor_delete_admin
  ON pvl_student_certification_mentor FOR DELETE TO authenticated
  USING (is_admin());

-- ---------------------------------------------------------------------------
-- Section 7: GRANTs (защита от Timeweb daily wipe — phase23 SEC-014)
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON pvl_student_certification_self TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pvl_student_certification_mentor TO authenticated;

-- ОБНОВЛЕНИЕ ensure_garden_grants() — swap 2 dropped tables → 2 new.
-- Net в Part 1 остаётся 41 таблица (phase38 baseline).
-- Без этого swap'а финальный `SELECT public.ensure_garden_grants();` упадёт
-- на GRANT'е дропнутой таблицы.
CREATE OR REPLACE FUNCTION public.ensure_garden_grants()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

-- Сразу вызвать внутри той же транзакции (как в phase 23 / 38).
SELECT public.ensure_garden_grants();

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- VERIFY (вне транзакции)
-- ─────────────────────────────────────────────────────────────────────

\echo === V1: таблицы созданы ===
SELECT tablename FROM pg_tables
WHERE schemaname='public' AND tablename LIKE 'pvl_student_certification_%'
ORDER BY tablename;
-- ожидание: 2 строки (_mentor, _self)

\echo === V2: RLS включено + политики ===
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies_count
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public' AND c.relname LIKE 'pvl_student_certification_%'
ORDER BY c.relname;
-- ожидание: оба rls_enabled=t, policies_count=7 на каждой

\echo === V3: триггер pvl_set_certification_mentor_id создан ===
SELECT trigger_name, event_manipulation, event_object_table, action_timing
FROM information_schema.triggers
WHERE event_object_schema='public'
  AND event_object_table = 'pvl_student_certification_mentor'
ORDER BY trigger_name;
-- ожидание: 2 trigger'а:
--   trg_pvl_student_certification_mentor_set_mentor_id (BEFORE INSERT, BEFORE UPDATE)
--   trg_pvl_student_certification_mentor_updated_at    (BEFORE UPDATE)

\echo === V4: authenticated grant-rows (ожидание: 166 — без изменений) ===
SELECT count(*) AS authenticated_grants
FROM information_schema.role_table_grants
WHERE grantee='authenticated' AND table_schema='public';
-- 41 таблица × 4 priv = 164 + pvl_audit_log × 2 = 166

\echo === V5: ensure_garden_grants() обновлён (упоминает новые таблицы) ===
SELECT pg_get_functiondef('public.ensure_garden_grants()'::regprocedure) ~
       'pvl_student_certification_self' AS mentions_self,
       pg_get_functiondef('public.ensure_garden_grants()'::regprocedure) ~
       'pvl_student_certification_mentor' AS mentions_mentor,
       pg_get_functiondef('public.ensure_garden_grants()'::regprocedure) ~
       'pvl_student_certification_scores' AS still_mentions_old_scores;
-- ожидание: t / t / f
