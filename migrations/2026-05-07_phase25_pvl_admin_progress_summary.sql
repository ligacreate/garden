-- migrations/2026-05-07_phase25_pvl_admin_progress_summary.sql
--
-- FEAT-017 phase 25 — структурный module_number / is_module_feedback в
-- pvl_homework_items + RPC pvl_admin_progress_summary(p_cohort_id) для
-- админского дашборда прогресса студентов.
--
-- Schema changes:
--   pvl_homework_items.module_number      integer NULL
--   pvl_homework_items.is_module_feedback boolean NOT NULL DEFAULT false
--   pvl_homework_items.updated_at         timestamptz NOT NULL DEFAULT now()
--     (латентный баг: trg_pvl_homework_items_updated_at BEFORE UPDATE
--     обращается к NEW.updated_at, но колонки исторически не было —
--     срабатывает на первом UPDATE, ошибка «record "new" has no field
--     "updated_at"». Добавляем колонку для совместимости с триггером,
--     consistent с другими pvl_*-таблицами.)
--
-- Backfill (single-pass UPDATE по title regex):
--   module_number       — substring(title FROM 'модул[ьюяе]\s*(\d+)')::int
--   is_module_feedback  — title ILIKE 'Рефлексия по модулю%'
--                         OR title ILIKE 'Анкета обратной связи%'
--
-- RPC public.pvl_admin_progress_summary(p_cohort_id uuid):
--   SECURITY DEFINER, проверка is_admin(), возвращает jsonb-массив объектов
--   по каждому студенту когорты. См. структуру в strategist prompt
--   2026-05-07_04 секция 3.
--
-- mentor_name резолюция: COALESCE(pvl_mentors.full_name, profiles.name).
-- pvl_garden_mentor_links.mentor_id может указывать либо на pvl_mentors.id,
-- либо на profiles.id (Ольга/Настя/Ирина как admin-mentors). См. ревью
-- стратега 2026-05-07_06 question 3.4.
--
-- RUNBOOK 1.3:
--   SELECT public.ensure_garden_grants() ДО COMMIT — защита от Timeweb
--   DDL GRANT-wipeout.
--
-- Apply:
--   ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
--     PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
--     -v ON_ERROR_STOP=1 -f /tmp/2026-05-07_phase25_pvl_admin_progress_summary.sql'

\set ON_ERROR_STOP on

BEGIN;

-- ── 1. SCHEMA ────────────────────────────────────────────────────────
ALTER TABLE public.pvl_homework_items
    ADD COLUMN IF NOT EXISTS module_number      integer NULL,
    ADD COLUMN IF NOT EXISTS is_module_feedback boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS updated_at         timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.pvl_homework_items.module_number IS
    'Номер модуля курса (0..3) или NULL если ДЗ не привязан к конкретному модулю.';
COMMENT ON COLUMN public.pvl_homework_items.is_module_feedback IS
    'true для рефлексий и анкет обратной связи по модулю — для FEAT-016 выгрузки feedback.';
COMMENT ON COLUMN public.pvl_homework_items.updated_at IS
    'Совместимость с триггером trg_pvl_homework_items_updated_at (BEFORE UPDATE).';

-- ── 2. BACKFILL ──────────────────────────────────────────────────────
-- Single regex покрывает все 3 паттерна из spec'а:
--   "модуль 1" / "модуля 2" / "модулю 1" / "(модуль N)" / "по модулю N"
-- Парные скобки в title — литералы; regex не требует их учитывать.
UPDATE public.pvl_homework_items
SET module_number = NULLIF(substring(title FROM 'модул[ьюяе]\s*(\d+)'), '')::int
WHERE module_number IS NULL;

UPDATE public.pvl_homework_items
SET is_module_feedback = (
       title ILIKE 'Рефлексия по модулю%'
    OR title ILIKE 'Анкета обратной связи%'
)
WHERE is_module_feedback = false;

-- ── 3. RPC: pvl_admin_progress_summary ───────────────────────────────
CREATE OR REPLACE FUNCTION public.pvl_admin_progress_summary(p_cohort_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Permission check FIRST (даже на NULL p_cohort_id админ-чек обязателен)
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'forbidden: admin role required' USING ERRCODE = '42501';
    END IF;

    RETURN COALESCE((
        SELECT jsonb_agg(row_data ORDER BY sort_name)
        FROM (
            SELECT
                jsonb_build_object(
                    'student_id',     s.id,
                    'full_name',      s.full_name,
                    'status',         s.status,
                    'cohort_id',      s.cohort_id,
                    'mentor_id',      ml.resolved_mentor_id,
                    'mentor_name',    COALESCE(m.full_name, p_mentor.name),
                    'hw_total',       stats.hw_total,
                    'hw_accepted',    stats.hw_accepted,
                    'hw_in_review',   stats.hw_in_review,
                    'hw_revision',    stats.hw_revision,
                    'hw_not_started', GREATEST(stats.hw_total - stats.submissions_total, 0),
                    'hw_overdue',     stats.hw_overdue,
                    'last_activity',  stats.last_activity,
                    'module_progress', mp.module_progress,
                    'state_line', CASE
                        WHEN stats.hw_accepted + stats.hw_in_review + stats.hw_revision = 0
                            THEN 'ДЗ не начаты'
                        WHEN stats.hw_overdue > 0 OR stats.hw_revision > 0
                            THEN 'есть долги'
                        WHEN stats.hw_in_review > 0
                            THEN 'нужна проверка'
                        ELSE 'в ритме'
                    END
                ) AS row_data,
                s.full_name AS sort_name
            FROM public.pvl_students s
            -- Резолюция ментора: links → fallback на pvl_students.mentor_id
            LEFT JOIN LATERAL (
                SELECT COALESCE(
                    (SELECT mentor_id
                     FROM public.pvl_garden_mentor_links
                     WHERE student_id = s.id),
                    s.mentor_id
                ) AS resolved_mentor_id
            ) ml ON TRUE
            -- mentor_name: pvl_mentors → fallback на profiles.name
            LEFT JOIN public.pvl_mentors m       ON m.id        = ml.resolved_mentor_id
            LEFT JOIN public.profiles    p_mentor ON p_mentor.id = ml.resolved_mentor_id
            -- Агрегаты по статусам submissions (только homework, без control_points)
            LEFT JOIN LATERAL (
                SELECT
                    (SELECT count(*)
                     FROM public.pvl_homework_items
                     WHERE item_type = 'homework' AND NOT is_control_point
                    )                                                   AS hw_total,
                    count(*) FILTER (WHERE shs.status = 'accepted')     AS hw_accepted,
                    count(*) FILTER (WHERE shs.status = 'in_review')    AS hw_in_review,
                    count(*) FILTER (WHERE shs.status = 'revision')     AS hw_revision,
                    count(*) FILTER (WHERE shs.status = 'overdue')      AS hw_overdue,
                    count(*)                                            AS submissions_total,
                    max(shs.updated_at)                                 AS last_activity
                FROM public.pvl_student_homework_submissions shs
                JOIN public.pvl_homework_items hi ON hi.id = shs.homework_item_id
                WHERE shs.student_id = s.id
                  AND hi.item_type = 'homework' AND NOT hi.is_control_point
            ) stats ON TRUE
            -- Прогресс по модулям: {module: {done, total}}
            LEFT JOIN LATERAL (
                SELECT COALESCE(
                    jsonb_object_agg(
                        per_module.module_number::text,
                        jsonb_build_object('done', per_module.done_count,
                                           'total', per_module.total_count)
                    ),
                    '{}'::jsonb
                ) AS module_progress
                FROM (
                    SELECT
                        hi.module_number,
                        count(*) AS total_count,
                        count(*) FILTER (
                            WHERE EXISTS (
                                SELECT 1
                                FROM public.pvl_student_homework_submissions shs2
                                WHERE shs2.student_id      = s.id
                                  AND shs2.homework_item_id = hi.id
                                  AND shs2.status           = 'accepted'
                            )
                        ) AS done_count
                    FROM public.pvl_homework_items hi
                    WHERE hi.module_number IS NOT NULL
                      AND hi.item_type = 'homework'
                      AND NOT hi.is_control_point
                    GROUP BY hi.module_number
                ) per_module
            ) mp ON TRUE
            WHERE s.cohort_id = p_cohort_id
        ) by_student
    ), '[]'::jsonb);
END;
$$;

-- ── 4. GRANT ─────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.pvl_admin_progress_summary(uuid)
    TO authenticated;

-- ── 5. RUNBOOK 1.3 — safety-net ДО COMMIT ────────────────────────────
SELECT public.ensure_garden_grants();

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- VERIFY (вне транзакции)
-- ─────────────────────────────────────────────────────────────────────

\echo === V1: функция pvl_admin_progress_summary создана, SECURITY DEFINER ===
SELECT proname, prosecdef AS is_definer,
       pg_get_function_arguments(oid) AS args,
       pg_get_function_result(oid) AS returns
FROM pg_proc
WHERE proname = 'pvl_admin_progress_summary'
  AND pronamespace = 'public'::regnamespace;

\echo === V2: GRANT EXECUTE для authenticated ===
SELECT grantee, privilege_type
FROM information_schema.role_routine_grants
WHERE specific_schema = 'public'
  AND routine_name = 'pvl_admin_progress_summary'
  AND grantee = 'authenticated';

\echo === V3: RUNBOOK 1.3 sanity — auth/anon grant counts ===
SELECT
  (SELECT count(*) FROM information_schema.role_table_grants
     WHERE grantee = 'authenticated' AND table_schema = 'public') AS auth_grants,
  (SELECT count(*) FROM information_schema.role_table_grants
     WHERE grantee = 'web_anon'      AND table_schema = 'public') AS anon_grants;

\echo === V5: backfill distribution ===
SELECT module_number, is_module_feedback, count(*)
FROM public.pvl_homework_items
GROUP BY 1, 2
ORDER BY module_number NULLS LAST, is_module_feedback;
