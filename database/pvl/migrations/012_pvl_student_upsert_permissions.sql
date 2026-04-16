-- Миграция 012: разрешения на upsert студента перед сохранением домашних заданий.
-- Проблема: pvl_student_homework_submissions.student_id → FK → pvl_students.id.
-- Реальные Garden-пользователи не были в pvl_students → INSERT падал с FK-ошибкой.
-- Решение на уровне кода: ensurePvlStudentInDb() вставляет студента перед submission.
-- Эта миграция гарантирует, что PostgREST-роль (web_anon / authenticator) имеет право
-- на INSERT и UPDATE в pvl_students.

-- Замени 'web_anon' на реальную роль PostgREST из конфигурации, если она другая.
GRANT SELECT, INSERT, UPDATE ON TABLE public.pvl_students TO gen_user;

-- Проверка: убедись, что unique constraint на id существует (он есть — PRIMARY KEY):
-- SELECT constraint_name FROM information_schema.table_constraints
-- WHERE table_name = 'pvl_students' AND constraint_type = 'PRIMARY KEY';
