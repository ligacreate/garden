-- Таблица: все проведённые практикумы (календарь ПВЛ)

SELECT
  id,
  legacy_key,
  title,
  event_type,
  start_at,
  end_at,
  date_hint,
  recording_url,
  recap_text,
  is_published
FROM public.pvl_calendar_events
WHERE event_type = 'practicum_done'
ORDER BY start_at DESC;
