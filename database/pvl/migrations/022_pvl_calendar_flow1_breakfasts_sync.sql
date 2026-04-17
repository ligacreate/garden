-- Дубликат database/pvl/calendar_flow1_breakfasts_sync.sql (для раннеров миграций).
-- Идемпотентно.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

BEGIN;

UPDATE public.pvl_calendar_events
SET
  title = 'Инна Кулиш — «Мой год — мои правила»',
  description = $d$https://vk.com/psiholog_kulish
Встреча для курса. Очень жду обратную связь.$d$,
  start_at = TIMESTAMPTZ '2026-04-19 11:00:00+03',
  end_at = TIMESTAMPTZ '2026-04-19 12:30:00+03',
  date_hint = DATE '2026-04-19',
  updated_at = NOW()
WHERE legacy_key = 'flow1-2026-04-19-bf-kulish';

INSERT INTO public.pvl_calendar_events (
  id,
  legacy_key, title, description, event_type, start_at, end_at, date_hint, visibility_role, cohort_id, is_published
)
SELECT
  gen_random_uuid(),
  'flow1-2026-04-26-bf-kulish',
  'Инна Кулиш — «Мне поздно быть идеальной»',
  $d$https://vk.com/psiholog_kulish
Встреча для курса. Очень жду обратную связь.$d$,
  'breakfast',
  TIMESTAMPTZ '2026-04-26 11:00:00+03',
  TIMESTAMPTZ '2026-04-26 12:30:00+03',
  DATE '2026-04-26',
  'all',
  (SELECT c.id FROM public.pvl_cohorts c WHERE c.year = 2026 ORDER BY c.created_at ASC NULLS LAST LIMIT 1),
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM public.pvl_calendar_events e WHERE e.legacy_key = 'flow1-2026-04-26-bf-kulish'
);

UPDATE public.pvl_calendar_events AS e
SET
  title = v.title,
  description = CASE
    WHEN v.desc_text IS NULL THEN e.description
    ELSE v.desc_text
  END,
  updated_at = NOW()
FROM (
  VALUES
    (
      'flow1-2026-04-19-bf-kulish',
      'Инна Кулиш — «Мой год — мои правила»',
      $d$https://vk.com/psiholog_kulish
Встреча для курса. Очень жду обратную связь.$d$::text
    ),
    (
      'flow1-2026-04-26-bf-kulish',
      'Инна Кулиш — «Мне поздно быть идеальной»',
      $d$https://vk.com/psiholog_kulish
Встреча для курса. Очень жду обратную связь.$d$::text
    ),
    ('flow1-2026-04-21-bf-sobol', 'Яна Соболева — «Ближе к себе»', NULL::text),
    ('flow1-2026-04-23-bf-gromova', 'Юлия Громова — «Яркая, как свет»', NULL::text),
    ('flow1-2026-04-23-bf-sobol-repeat', 'Яна Соболева — «Ближе к себе» (повтор)', NULL::text)
) AS v(legacy_key, title, desc_text)
WHERE e.legacy_key = v.legacy_key;

UPDATE public.pvl_calendar_events AS e
SET
  title = 'Мария Романова — «Грабли», Москва',
  updated_at = NOW()
WHERE e.legacy_key LIKE 'flow1-%-bf-romanova';

DELETE FROM public.pvl_calendar_events
WHERE date_hint = DATE '2026-05-02'
  AND event_type = 'breakfast'
  AND title ILIKE '%Кокорина%'
  AND title ILIKE '%Временно%';

COMMIT;
