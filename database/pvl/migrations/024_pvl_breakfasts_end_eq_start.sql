-- Завтраки: в интерфейсе показываем только время начала; end_at совпадает с start_at.
-- Для БД, где 023 уже вставил строки с «длинным» end_at.

BEGIN;

UPDATE public.pvl_calendar_events
SET end_at = start_at
WHERE legacy_key IN (
  'flow1-2026-04-25-writing-detox',
  'flow1-2026-04-26-theme-tbc',
  'flow1-2026-04-27-april-mine'
);

COMMIT;
