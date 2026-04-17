-- Диагностика: есть ли завтраки и прочие события в public.pvl_calendar_events
-- Запустите в psql / pgAdmin / DBeaver против вашей БД (не коммитим секреты).

-- 1) Сводка по типам
SELECT event_type, COUNT(*) AS cnt
FROM public.pvl_calendar_events
GROUP BY event_type
ORDER BY cnt DESC;

-- 2) Только завтраки (и legacy live_stream, если остался)
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

-- 3) Конкретные legacy_key из миграций 014/015 (если строка есть — миграция дошла)
SELECT legacy_key, title, event_type, start_at
FROM public.pvl_calendar_events
WHERE legacy_key IN (
  'flow1-2026-04-25-bf-skrebeyko',
  'flow1-2026-04-21-bf-sobol',
  'flow1-2026-04-23-bf-sobol-repeat',
  'flow1-2026-04-17-bf-bondarenko'
)
ORDER BY legacy_key;

-- 4) Если завтраков 0 — есть ли вообще строки в таблице
SELECT COUNT(*) AS total_rows FROM public.pvl_calendar_events;

-- 5) Полный список завтраков потока 1 из миграции 014 — что есть в БД, чего не хватает
WITH expected(legacy_key) AS (
  VALUES
    ('flow1-2026-04-17-bf-bondarenko'),
    ('flow1-2026-04-21-bf-sobol'),
    ('flow1-2026-04-23-bf-gromova'),
    ('flow1-2026-04-23-bf-sobol-repeat'),
    ('flow1-2026-04-25-bf-bardina'),
    ('flow1-2026-04-25-bf-skrebeyko'),
    ('flow1-2026-04-19-bf-kulish'),
    ('flow1-2026-04-26-bf-kulish'),
    ('flow1-2026-05-02-bf-kokorina'),
    ('flow1-2026-04-15-bf-romanova'),
    ('flow1-2026-04-22-bf-romanova'),
    ('flow1-2026-04-29-bf-romanova'),
    ('flow1-2026-05-06-bf-romanova'),
    ('flow1-2026-05-13-bf-romanova'),
    ('flow1-2026-05-20-bf-romanova'),
    ('flow1-2026-05-27-bf-romanova')
)
SELECT
  e.legacy_key,
  CASE WHEN c.legacy_key IS NULL THEN 'НЕТ — выполните миграцию 014 или вставьте вручную' ELSE 'есть' END AS v_baze
FROM expected e
LEFT JOIN public.pvl_calendar_events c ON c.legacy_key = e.legacy_key
ORDER BY e.legacy_key;
