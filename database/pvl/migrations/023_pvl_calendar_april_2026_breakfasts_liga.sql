-- Завтраки Лиги (апрель 2026, мск) — дублирует сид; идемпотентно по legacy_key.
-- Не трогает 005 и прочие записи.

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
  'flow1-2026-04-25-writing-detox',
  'Рухшана — «Письменный детокс»',
  'Онлайн. Запись: https://t.me/g_rush',
  'breakfast',
  TIMESTAMPTZ '2026-04-25 11:00:00+03',
  TIMESTAMPTZ '2026-04-25 11:00:00+03',
  DATE '2026-04-25',
  'all',
  (SELECT c.id FROM public.pvl_cohorts c WHERE c.year = 2026 ORDER BY c.created_at ASC NULLS LAST LIMIT 1),
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM public.pvl_calendar_events e WHERE e.legacy_key = 'flow1-2026-04-25-writing-detox'
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
  'flow1-2026-04-26-theme-tbc',
  'Рухшана — «Тема уточняется»',
  'Офлайн (Москва) или онлайн, если будут желающие. Запись: https://t.me/g_rush',
  'breakfast',
  TIMESTAMPTZ '2026-04-26 13:30:00+03',
  TIMESTAMPTZ '2026-04-26 13:30:00+03',
  DATE '2026-04-26',
  'all',
  (SELECT c.id FROM public.pvl_cohorts c WHERE c.year = 2026 ORDER BY c.created_at ASC NULLS LAST LIMIT 1),
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM public.pvl_calendar_events e WHERE e.legacy_key = 'flow1-2026-04-26-theme-tbc'
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
  'flow1-2026-04-27-april-mine',
  'Яна Соболева — «Мой апрель: пиши, чувствуй, сохраняй»',
  'Онлайн (Zoom). Запись: https://t.me/soboleva_yana',
  'breakfast',
  TIMESTAMPTZ '2026-04-27 19:00:00+03',
  TIMESTAMPTZ '2026-04-27 19:00:00+03',
  DATE '2026-04-27',
  'all',
  (SELECT c.id FROM public.pvl_cohorts c WHERE c.year = 2026 ORDER BY c.created_at ASC NULLS LAST LIMIT 1),
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM public.pvl_calendar_events e WHERE e.legacy_key = 'flow1-2026-04-27-april-mine'
);

COMMIT;
