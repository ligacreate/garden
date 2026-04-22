-- Миграция 017: полная синхронизация pvl_course_weeks с расписанием курса ПВЛ 2026.
--
-- Проблемы:
-- 1. В таблице только 2 недели (0 и 1), нужно 13 (0–12)
-- 2. external_key может быть NULL или иметь неправильный формат
-- 3. Без правильных external_key код ensureDbTrackerHomeworkStructure
--    не может заполнить sqlWeekIdByMockWeekId → прогресс трекера не пишется в БД
--
-- Расписание по аналогии с data/pvl/constants.js (CANONICAL_SCHEDULE_2026):
-- Неделя 0: модуль 0 (прелёрнинг)
-- Недели 1–3: модуль 1 (ПИШИ)
-- Недели 4–6: модуль 2 (ВЕДИ)
-- Недели 7–12: модуль 3 (ЛЮБИ)
--
-- Безопасно запускать повторно: ON CONFLICT (week_number) DO UPDATE.

BEGIN;

INSERT INTO public.pvl_course_weeks
  (week_number, title, module_number, is_active, starts_at, ends_at, external_key)
VALUES
  ( 0, 'ПИШИ',  0, true, '2026-04-15', '2026-04-21', 'cohort-2026-1-w0'),
  ( 1, 'ПИШИ',  1, true, '2026-04-22', '2026-04-28', 'cohort-2026-1-w1'),
  ( 2, 'ПИШИ',  1, true, '2026-04-29', '2026-05-05', 'cohort-2026-1-w2'),
  ( 3, 'ПИШИ',  1, true, '2026-05-06', '2026-05-12', 'cohort-2026-1-w3'),
  ( 4, 'ВЕДИ',  2, true, '2026-05-13', '2026-05-19', 'cohort-2026-1-w4'),
  ( 5, 'ВЕДИ',  2, true, '2026-05-20', '2026-05-26', 'cohort-2026-1-w5'),
  ( 6, 'ВЕДИ',  2, true, '2026-05-27', '2026-06-02', 'cohort-2026-1-w6'),
  ( 7, 'ЛЮБИ',  3, true, '2026-06-03', '2026-06-09', 'cohort-2026-1-w7'),
  ( 8, 'ЛЮБИ',  3, true, '2026-06-10', '2026-06-16', 'cohort-2026-1-w8'),
  ( 9, 'ЛЮБИ',  3, true, '2026-06-17', '2026-06-23', 'cohort-2026-1-w9'),
  (10, 'ЛЮБИ',  3, true, '2026-06-24', '2026-06-30', 'cohort-2026-1-w10'),
  (11, 'ЛЮБИ',  3, true, '2026-07-01', '2026-07-07', 'cohort-2026-1-w11'),
  (12, 'ЛЮБИ',  3, true, '2026-07-08', '2026-07-14', 'cohort-2026-1-w12')
ON CONFLICT (week_number) DO UPDATE SET
  module_number = EXCLUDED.module_number,
  title         = EXCLUDED.title,
  is_active     = EXCLUDED.is_active,
  starts_at     = EXCLUDED.starts_at,
  ends_at       = EXCLUDED.ends_at,
  external_key  = EXCLUDED.external_key;

COMMIT;

-- Проверка (запустить после миграции — должно быть 13 строк, у всех external_key заполнен):
-- SELECT week_number, module_number, title, external_key, starts_at
-- FROM public.pvl_course_weeks
-- ORDER BY week_number;
