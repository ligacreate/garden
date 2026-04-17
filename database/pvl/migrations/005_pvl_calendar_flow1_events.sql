-- Поток 1 · ключевые даты календаря (апрель 2026, время Europe/Moscow +03).
-- Идемпотентно без ON CONFLICT: на части деплоев нет UNIQUE(legacy_key), тогда Postgres падает с P0001.
-- cohort_id — первый поток с year = 2026; при отсутствии строки cohort_id будет NULL.
-- Явный id: на части деплоев INSERT...SELECT не подставляет DEFAULT gen_random_uuid() для id.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

BEGIN;

INSERT INTO public.pvl_calendar_events (
  id,
  legacy_key,
  title,
  description,
  event_type,
  start_at,
  end_at,
  date_hint,
  visibility_role,
  cohort_id,
  is_published
)
SELECT
  gen_random_uuid(),
  'flow1-2026-04-15-start',
  'Старт курса',
  'Начало потока ПВЛ 2026.',
  'practicum',
  TIMESTAMPTZ '2026-04-15 19:00:00+03',
  TIMESTAMPTZ '2026-04-15 20:30:00+03',
  DATE '2026-04-15',
  'all',
  (SELECT c.id FROM public.pvl_cohorts c WHERE c.year = 2026 ORDER BY c.created_at ASC NULLS LAST LIMIT 1),
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM public.pvl_calendar_events e WHERE e.legacy_key = 'flow1-2026-04-15-start'
);

INSERT INTO public.pvl_calendar_events (
  id,
  legacy_key,
  title,
  description,
  event_type,
  start_at,
  end_at,
  date_hint,
  visibility_role,
  cohort_id,
  is_published
)
SELECT
  gen_random_uuid(),
  'flow1-2026-04-22-inquiry',
  'Сессия интерактивного вопрошания',
  '',
  'practicum',
  TIMESTAMPTZ '2026-04-22 19:00:00+03',
  TIMESTAMPTZ '2026-04-22 20:30:00+03',
  DATE '2026-04-22',
  'all',
  (SELECT c.id FROM public.pvl_cohorts c WHERE c.year = 2026 ORDER BY c.created_at ASC NULLS LAST LIMIT 1),
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM public.pvl_calendar_events e WHERE e.legacy_key = 'flow1-2026-04-22-inquiry'
);

COMMIT;
