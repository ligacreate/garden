-- Повторно добавить завтрак Ольги (если удалили вручную) и выровнять длительность слотов Яны:
-- для интервалов «14–16» и «11–14» в календаре оставляем начало в первое время (14:00 / 11:00),
-- end_at — через час от старта (как компактный слот).
--
-- Явный id: на части деплоев INSERT...SELECT не подставляет DEFAULT gen_random_uuid() для id.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

BEGIN;

-- Ольга Скребейко — завтрак (идемпотентно, как в 014)
INSERT INTO public.pvl_calendar_events (
  id,
  legacy_key, title, description, event_type, start_at, end_at, date_hint, visibility_role, cohort_id, is_published
)
SELECT
  gen_random_uuid(),
  'flow1-2026-04-25-bf-skrebeyko',
  'Ольга Скребейко — «Неслучайная случайность»',
  'https://t.me/skrebeykoolga',
  'breakfast',
  TIMESTAMPTZ '2026-04-25 19:00:00+03',
  TIMESTAMPTZ '2026-04-25 21:00:00+03',
  DATE '2026-04-25',
  'all',
  (SELECT c.id FROM public.pvl_cohorts c WHERE c.year = 2026 ORDER BY c.created_at ASC NULLS LAST LIMIT 1),
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM public.pvl_calendar_events e WHERE e.legacy_key = 'flow1-2026-04-25-bf-skrebeyko'
);

-- Яна 21.04: старт 14:00 (первое время диапазона 14–16), окончание 15:00
-- Совпадение и по legacy_key (миграция 014), и по дате/названию — если строки созданы в UI без legacy_key.
UPDATE public.pvl_calendar_events
SET
  end_at = TIMESTAMPTZ '2026-04-21 15:00:00+03',
  updated_at = NOW()
WHERE
  legacy_key = 'flow1-2026-04-21-bf-sobol'
  OR (
    event_type = 'breakfast'
    AND title ILIKE '%Яна Соболева%'
    AND title ILIKE '%Ближе к себе%'
    AND title NOT ILIKE '%повтор%'
    AND (
      date_hint = DATE '2026-04-21'
      OR (start_at >= TIMESTAMPTZ '2026-04-21 00:00:00+03' AND start_at < TIMESTAMPTZ '2026-04-22 00:00:00+03')
    )
  );

-- Яна 23.04 повтор: старт 11:00 (первое время 11–14), окончание 12:00
UPDATE public.pvl_calendar_events
SET
  end_at = TIMESTAMPTZ '2026-04-23 12:00:00+03',
  updated_at = NOW()
WHERE
  legacy_key = 'flow1-2026-04-23-bf-sobol-repeat'
  OR (
    event_type = 'breakfast'
    AND title ILIKE '%Яна Соболева%'
    AND title ILIKE '%повтор%'
    AND (
      date_hint = DATE '2026-04-23'
      OR (start_at >= TIMESTAMPTZ '2026-04-23 00:00:00+03' AND start_at < TIMESTAMPTZ '2026-04-24 00:00:00+03')
    )
  );

COMMIT;
