BEGIN;

-- Bridge columns for syncing current PVL mock ids and rich submission state.
-- Additive only; does not break existing runtime tables.

ALTER TABLE public.pvl_course_weeks
ADD COLUMN IF NOT EXISTS external_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pvl_course_weeks_external_key
ON public.pvl_course_weeks (external_key)
WHERE external_key IS NOT NULL;

ALTER TABLE public.pvl_course_lessons
ADD COLUMN IF NOT EXISTS external_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pvl_course_lessons_external_key
ON public.pvl_course_lessons (external_key)
WHERE external_key IS NOT NULL;

ALTER TABLE public.pvl_homework_items
ADD COLUMN IF NOT EXISTS external_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pvl_homework_items_external_key
ON public.pvl_homework_items (external_key)
WHERE external_key IS NOT NULL;

ALTER TABLE public.pvl_student_homework_submissions
ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.pvl_homework_status_history
ADD COLUMN IF NOT EXISTS payload jsonb;

ALTER TABLE public.pvl_student_course_progress
ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMIT;

