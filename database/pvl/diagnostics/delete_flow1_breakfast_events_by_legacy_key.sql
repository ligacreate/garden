-- Удаление завтраков потока 1, заведённых миграцией 014 (список legacy_key совпадает с коммитом «Финал»).
-- В согласованной выкладке завтрак 15.04 (Романова) не входит — ключ flow1-2026-04-15-bf-romanova оставлен в DELETE,
-- чтобы убрать старую строку с прода, если она уже есть.
-- Не трогает: 005 (старт курса, вопрошание), practicum_done, прочие типы, завтраки без этих legacy_key.
--
-- Перед запуском: бэкап / SELECT ниже. На проде — по согласованию.

-- 1) Просмотр — что сотрётся
SELECT id, legacy_key, title, event_type, start_at
FROM public.pvl_calendar_events
WHERE legacy_key IN (
  'flow1-2026-04-15-bf-romanova',
  'flow1-2026-04-17-bf-bondarenko',
  'flow1-2026-04-19-bf-kulish',
  'flow1-2026-04-21-bf-sobol',
  'flow1-2026-04-22-bf-romanova',
  'flow1-2026-04-23-bf-gromova',
  'flow1-2026-04-23-bf-sobol-repeat',
  'flow1-2026-04-25-bf-bardina',
  'flow1-2026-04-25-bf-skrebeyko',
  'flow1-2026-04-26-bf-kulish',
  'flow1-2026-04-29-bf-romanova',
  'flow1-2026-05-02-bf-kokorina',
  'flow1-2026-05-06-bf-romanova',
  'flow1-2026-05-13-bf-romanova',
  'flow1-2026-05-20-bf-romanova',
  'flow1-2026-05-27-bf-romanova'
)
ORDER BY start_at;

-- 2) Удаление (раскомментировать после проверки SELECT)
-- BEGIN;
-- DELETE FROM public.pvl_calendar_events
-- WHERE legacy_key IN (
--   'flow1-2026-04-15-bf-romanova',
--   'flow1-2026-04-17-bf-bondarenko',
--   'flow1-2026-04-19-bf-kulish',
--   'flow1-2026-04-21-bf-sobol',
--   'flow1-2026-04-22-bf-romanova',
--   'flow1-2026-04-23-bf-gromova',
--   'flow1-2026-04-23-bf-sobol-repeat',
--   'flow1-2026-04-25-bf-bardina',
--   'flow1-2026-04-25-bf-skrebeyko',
--   'flow1-2026-04-26-bf-kulish',
--   'flow1-2026-04-29-bf-romanova',
--   'flow1-2026-05-02-bf-kokorina',
--   'flow1-2026-05-06-bf-romanova',
--   'flow1-2026-05-13-bf-romanova',
--   'flow1-2026-05-20-bf-romanova',
--   'flow1-2026-05-27-bf-romanova'
-- );
-- COMMIT;

-- 3) Если часть завтраков создана в UI без legacy_key — ищите вручную, например:
-- SELECT id, legacy_key, title, start_at FROM public.pvl_calendar_events
-- WHERE event_type = 'breakfast' AND cohort_id IN (SELECT id FROM public.pvl_cohorts WHERE year = 2026)
-- ORDER BY start_at;
