-- Диагностика: сводка по событиям public.pvl_calendar_events (в т.ч. завтраки).
-- Массовые завтраки больше не задаются миграциями 014/015/022 в репозитории — данные в БД могут быть только с ручных вставок.
-- Запустите в psql / pgAdmin / DBeaver против вашей БД.

-- 1) Сводка по типам
SELECT event_type, COUNT(*) AS cnt
FROM public.pvl_calendar_events
GROUP BY event_type
ORDER BY cnt DESC;

-- 2) Завтраки и эфиры (если остались)
SELECT
  id,
  legacy_key,
  title,
  LEFT(description, 80) AS description_preview,
  event_type,
  start_at,
  end_at,
  date_hint,
  is_published
FROM public.pvl_calendar_events
WHERE event_type IN ('breakfast', 'live_stream')
ORDER BY start_at;

-- 3) Записи проведённых практикумов в календаре
SELECT id, legacy_key, title, event_type, start_at, is_published
FROM public.pvl_calendar_events
WHERE event_type = 'practicum_done'
ORDER BY start_at;

-- 4) Всего строк в таблице
SELECT COUNT(*) AS total_rows FROM public.pvl_calendar_events;
