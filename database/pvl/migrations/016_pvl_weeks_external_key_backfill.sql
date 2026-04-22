-- Миграция 016: проставить external_key для строк pvl_course_weeks, вставленных без него.
--
-- Причина: сид 001_demo_minimal.sql вставил недели БЕЗ external_key (поле появилось позже,
-- в миграции 003). Код ensureDbTrackerHomeworkStructure в pvlMockApi.js использует
-- sqlWeekIdByMockWeekId для сохранения прогресса трекера. Если external_key = NULL, карта
-- пустая → persistTrackerProgressToDb молча уходит без записи → прогресс теряется при F5.
--
-- Формат external_key: 'cohort-2026-1-wN' где N — week_number.
-- Совпадает с mkWeekId('cohort-2026-1', weekNumber) из data/pvl/seed.js.
--
-- Безопасно запускать повторно: WHERE external_key IS NULL не трогает уже заполненные строки.

BEGIN;

UPDATE public.pvl_course_weeks
SET external_key = 'cohort-2026-1-w' || week_number
WHERE external_key IS NULL;

COMMIT;

-- Проверка (выполни после миграции):
-- SELECT id, week_number, module_number, external_key
-- FROM public.pvl_course_weeks
-- ORDER BY week_number;
-- Ожидается: у всех строк external_key вида 'cohort-2026-1-w0', 'cohort-2026-1-w1' и т.д.
