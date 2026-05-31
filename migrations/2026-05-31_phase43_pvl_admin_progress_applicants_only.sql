-- migrations/2026-05-31_phase43_pvl_admin_progress_applicants_only.sql
--
-- FIX (Поток 1 «29 студенток»): дашборд /admin/pvl показывал ВСЕХ студентов
-- когорты, включая 13 выпустившихся (profiles.role='intern'), а не только
-- 16 текущих абитуриенток. Подтверждено Ольгой. Источник списка/счётчика —
-- RPC pvl_admin_progress_summary (счётчик = rows.length во фронте).
--
-- Различитель «текущая абитуриентка vs выпустившаяся»:
--   profiles.role = 'applicant'   (join profiles.id = pvl_students.id;
--   pvl_students.id = profiles.id — см. phase32 коммент). status у всех
--   'active' → НЕ различитель. leader'ов в pvl_students нет; «лишние» = intern.
--
-- Изменение vs phase25 (2026-05-07_phase25_pvl_admin_progress_summary.sql):
--   + JOIN public.profiles sp ON sp.id = s.id      (профиль студента)
--   + AND sp.role = 'applicant'  в финальном WHERE
-- Всё остальное (агрегаты, mentor-резолюция, module_progress, сортировка) —
-- БЕЗ изменений. ДАННЫЕ НЕ меняем: cohort_id выпускниц не трогаем, только
-- фильтр выборки.
--
-- Blast-radius: RPC общий для всех когорт. Сейчас непустая только Поток 1
-- (Поток 2 пуст), глобально applicant+intern живут лишь в Потоке 1, поэтому
-- фильтр затрагивает только её (29→16). ВНИМАНИЕ на будущее: если абитуриентка
-- по ходу программы перейдёт в 'intern' (Стажер), она пропадёт из дашборда —
-- подтвердить, что это желаемое поведение (см. отчёт _175, открытый вопрос).
--
-- Apply (НЕ выполнять без 🟢):
--   scp migrations/2026-05-31_phase43_pvl_admin_progress_applicants_only.sql \
--       root@5.129.251.56:/tmp/ && \
--   ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
--     PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
--     -v ON_ERROR_STOP=1 -f /tmp/2026-05-31_phase43_pvl_admin_progress_applicants_only.sql'

\set ON_ERROR_STOP on

BEGIN;

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
            -- phase43: профиль студента — различитель «текущая абитуриентка».
            -- pvl_students.id = profiles.id (см. phase32). INNER: у студента
            -- всегда есть профиль; фильтр role='applicant' ниже.
            JOIN public.profiles sp ON sp.id = s.id
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
              AND sp.role = 'applicant'   -- phase43: только текущие абитуриентки
        ) by_student
    ), '[]'::jsonb);
END;
$$;

-- GRANT (CREATE OR REPLACE сохраняет привилегии, но дублируем для идемпотентности)
GRANT EXECUTE ON FUNCTION public.pvl_admin_progress_summary(uuid)
    TO authenticated;

-- RUNBOOK 1.3 — safety-net ДО COMMIT (защита от Timeweb DDL GRANT-wipeout)
SELECT public.ensure_garden_grants();

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- VERIFY (вне транзакции)
-- ─────────────────────────────────────────────────────────────────────

\echo === V1: функция пересоздана, SECURITY DEFINER ===
SELECT proname, prosecdef AS is_definer,
       pg_get_function_arguments(oid) AS args
FROM pg_proc
WHERE proname = 'pvl_admin_progress_summary'
  AND pronamespace = 'public'::regnamespace;

-- V2 не вызывает RPC напрямую: под psql/gen_user нет JWT → is_admin()=false →
-- RPC бросит 'forbidden'. Проверяем эквивалентной выборкой (та же логика фильтра).
\echo === V2: Поток 1 — applicant (ожидаем 16) vs всего в когорте (было 29) ===
SELECT
  count(*) FILTER (WHERE sp.role = 'applicant') AS applicants,
  count(*)                                      AS total_in_cohort
FROM public.pvl_students s
JOIN public.profiles sp ON sp.id = s.id
WHERE s.cohort_id = '11111111-1111-1111-1111-111111111101'::uuid;
