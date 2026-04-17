-- Дубликат завтрака Елены Кокориной 02.05.2026:
-- оставляем каноническую строку с legacy_key = flow1-2026-05-02-bf-kokorina («встреча Лиги»),
-- убираем вторую (часто «Временно без темы», другое время, например 15:00).

-- 1) Сначала посмотреть кандидатов:
-- SELECT id, legacy_key, title, start_at, date_hint
-- FROM public.pvl_calendar_events
-- WHERE date_hint = DATE '2026-05-02'
--   AND event_type = 'breakfast'
--   AND title ILIKE '%Кокорина%'
-- ORDER BY start_at;

-- 2) Удалить дубликат по признакам «Временно» в заголовке (как в calendar_flow1_breakfasts_sync / миграция 022):
DELETE FROM public.pvl_calendar_events
WHERE date_hint = DATE '2026-05-02'
  AND event_type = 'breakfast'
  AND title ILIKE '%Кокорина%'
  AND title ILIKE '%Временно%';

-- 3) Если дубликат без слова «Временно», но с другим временем — удалить по конкретному id:
-- DELETE FROM public.pvl_calendar_events WHERE id = '...';
