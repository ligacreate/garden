-- Кто из абитуриентов Сада (public.profiles) ещё не заведён в public.pvl_students.
-- Без строки в pvl_students внешний ключ student_id в pvl_student_homework_submissions не выполняется;
-- в приложении строка создаётся при открытии AL Camp (синхронизация, только applicant) или при сдаче ДЗ.
--
-- Запуск: psql / SQL-консоль (Timeweb, pgAdmin) под пользователем с SELECT на обе таблицы.
-- PostgREST с клиента обычно не отдаёт profiles — это серверный запрос.

-- Список: абитуриент по role (в т.ч. прод: «заявитель»), персонал исключён — как в utils/pvlGardenAdmission.js
SELECT
  p.id,
  COALESCE(NULLIF(trim(p.name), ''), '(без имени)') AS name,
  p.role,
  p.status
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.pvl_students s WHERE s.id = p.id
)
AND (
  p.role IS NULL OR trim(p.role) = ''
  OR lower(trim(p.role)) IN ('applicant', 'абитуриент', 'абитуриентка', 'заявитель')
)
AND lower(trim(coalesce(p.role, ''))) NOT IN (
  'mentor', 'leader', 'admin', 'curator',
  'ментор', 'ведущая', 'администратор', 'куратор'
)
ORDER BY COALESCE(NULLIF(trim(p.name), ''), p.id::text);

-- Сводка
SELECT COUNT(*) AS applicants_without_pvl_student_row
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.pvl_students s WHERE s.id = p.id
)
AND (
  p.role IS NULL OR trim(p.role) = ''
  OR lower(trim(p.role)) IN ('applicant', 'абитуриент', 'абитуриентка', 'заявитель')
)
AND lower(trim(coalesce(p.role, ''))) NOT IN (
  'mentor', 'leader', 'admin', 'curator',
  'ментор', 'ведущая', 'администратор', 'куратор'
);

-- Неизвестные не-staff роли в JS считаются applicant (ambiguous). Если нужно поймать и их:
-- SELECT p.id, p.name, p.role FROM profiles p
-- WHERE NOT EXISTS (SELECT 1 FROM pvl_students s WHERE s.id = p.id)
--   AND lower(trim(coalesce(p.role,''))) NOT IN (
--     'mentor','leader','admin','curator','ментор','ведущая','администратор','куратор',
--     'intern','student','стажер','стажёр','ученица','participant','trainee'
--   );

-- --- Починка одним проходом (проверьте SELECT выше, затем при необходимости выполните) ---
-- INSERT INTO public.pvl_students (id, full_name, cohort_id, mentor_id, status, created_at, updated_at)
-- SELECT
--   p.id,
--   COALESCE(NULLIF(trim(p.name), ''), 'Участница'),
--   NULL,
--   NULL,
--   'applicant',
--   NOW(),
--   NOW()
-- FROM public.profiles p
-- WHERE NOT EXISTS (SELECT 1 FROM public.pvl_students s WHERE s.id = p.id)
--   AND (
--     p.role IS NULL OR trim(p.role) = ''
--     OR lower(trim(p.role)) IN ('applicant', 'абитуриент', 'абитуриентка', 'заявитель')
--   )
--   AND lower(trim(coalesce(p.role, ''))) NOT IN (
--     'mentor', 'leader', 'admin', 'curator',
--     'ментор', 'ведущая', 'администратор', 'куратор'
--   )
-- ON CONFLICT (id) DO UPDATE SET
--   full_name = EXCLUDED.full_name,
--   updated_at = NOW();
