-- Инна Кулиш: две отдельные встречи — 19.04 и 26.04.2026, 11:00 МСК.
-- Обновляет объединённую строку 19-го (если осталась после 016) и добавляет 26-ю.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

BEGIN;

UPDATE public.pvl_calendar_events
SET
  title = 'Инна Кулиш — первая встреча: «Мой год — мои правила» (19.04, 11:00)',
  description = $d$https://vk.com/psiholog_kulish
Первая встреча для курса. Очень жду обратную связь.$d$,
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
  'Инна Кулиш — вторая встреча: «Мне поздно быть идеальной» (26.04, 11:00)',
  $d$https://vk.com/psiholog_kulish
Вторая встреча для курса. Очень жду обратную связь.$d$,
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

COMMIT;
