-- Диагностика и фикс трекера Ирины Петруни — исправленные запросы
-- Запускать в Adminer/psql под сервисной ролью.
-- Запускать по одному блоку, начиная с SELECT-блоков (они ничего не меняют).

-- ============================================================
-- 0. Посмотреть реальные колонки pvl_students
-- ============================================================
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'pvl_students'
ORDER BY ordinal_position;

-- ============================================================
-- 1. Найти Ирину в pvl_students (по имени, без несуществующих колонок)
-- ============================================================
SELECT *
FROM public.pvl_students
WHERE id::text = '35019374-d7de-4900-aa9d-1797bcca9769'
   OR full_name ILIKE '%петрун%';

-- ============================================================
-- 2. Её записи в трекере (по student_id и full_name на случай другого id)
--    Если пусто — прогресс трекера хранится только в localStorage браузера.
-- ============================================================
SELECT scp.*, cw.module_number, cw.week_number
FROM public.pvl_student_course_progress scp
LEFT JOIN public.pvl_course_weeks cw ON cw.id = scp.week_id
WHERE scp.student_id::text = '35019374-d7de-4900-aa9d-1797bcca9769'
   OR scp.student_id IN (
       SELECT id FROM public.pvl_students WHERE full_name ILIKE '%петрун%'
   )
ORDER BY cw.module_number, cw.week_number;

-- ============================================================
-- 3. Её домашние работы (исправлен тип)
-- ============================================================
SELECT hs.id, hs.student_id, hs.homework_item_id, hs.status,
       hs.submitted_at, hs.accepted_at,
       ci.title AS content_item_title
FROM public.pvl_student_homework_submissions hs
LEFT JOIN public.pvl_content_items ci ON ci.id::text = hs.homework_item_id::text
WHERE hs.student_id::text = '35019374-d7de-4900-aa9d-1797bcca9769'
ORDER BY hs.created_at;

-- ============================================================
-- 4. Посмотреть все course_weeks (нужен week_id для вставки трекера)
-- ============================================================
SELECT id, week_number, module_number, title
FROM public.pvl_course_weeks
ORDER BY module_number, week_number;

-- ============================================================
-- 5. Если в запросе 3 статус submission НЕ 'accepted' — принять домашку
--    (раскомментировать и выполнить отдельно)
-- ============================================================
-- UPDATE public.pvl_student_homework_submissions
-- SET status = 'accepted',
--     accepted_at = NOW(),
--     checked_at  = NOW(),
--     updated_at  = NOW()
-- WHERE student_id::text = '35019374-d7de-4900-aa9d-1797bcca9769'
--   AND status IN ('in_review', 'submitted', 'pending_review');

-- ============================================================
-- 6. Вставить/обновить прогресс трекера Ирины в БД вручную
--    ВАЖНО: сначала выполни запрос 4 и возьми нужный week_id из него.
--    Замени 'WEEK_UUID_ЗДЕСЬ' на реальный id недели из запроса 4.
--    lesson_completed = кол-во отмеченных шагов в этом модуле,
--    lesson_total = то же число (считаем всё отмеченное как пройденное).
-- ============================================================
-- INSERT INTO public.pvl_student_course_progress
--     (id, student_id, week_id, lessons_completed, lessons_total,
--      homework_completed, homework_total, is_week_closed,
--      auto_points_awarded, payload, created_at, updated_at)
-- VALUES
--     (gen_random_uuid(),
--      '35019374-d7de-4900-aa9d-1797bcca9769',
--      'WEEK_UUID_ЗДЕСЬ',
--      5, 5,
--      0, 0, true, false,
--      '{"checkedKeys": [], "note": "manual fix 2026-04-20"}'::jsonb,
--      NOW(), NOW())
-- ON CONFLICT (student_id, week_id)
-- DO UPDATE SET
--     lessons_completed = EXCLUDED.lessons_completed,
--     lessons_total = EXCLUDED.lessons_total,
--     is_week_closed = EXCLUDED.is_week_closed,
--     payload = EXCLUDED.payload,
--     updated_at = NOW();
