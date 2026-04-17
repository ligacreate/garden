-- Дубликат Ольги: одна строка из миграции (есть legacy_key, время 19:00 МСК),
-- вторая — из интерфейса/мока (id вида pvl-cal-..., legacy_key NULL, часто другое время).
-- Перед удалением посмотрите обе строки:

-- SELECT id, legacy_key, title, start_at FROM public.pvl_calendar_events
-- WHERE title ILIKE '%Скребейко%' AND title ILIKE '%Неслучайная%';

-- Удалить только «лишнюю» строку без legacy_key с префиксом id pvl-cal- (не трогает UUID из миграции).
DELETE FROM public.pvl_calendar_events
WHERE legacy_key IS NULL
  AND event_type = 'breakfast'
  AND id::text LIKE 'pvl-cal-%'
  AND title ILIKE '%Скребейко%'
  AND title ILIKE '%Неслучайная%';

-- Если дубликат с другим id — подставьте конкретный id вручную:
-- DELETE FROM public.pvl_calendar_events WHERE id = 'pvl-cal-1776422967579-9460';
