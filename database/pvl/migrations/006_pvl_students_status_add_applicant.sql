-- Расширение статуса строки pvl_students: этап «абитуриент» до полного зачисления на курс.
-- Выполнить на проде под ролью с правом ALTER на public.pvl_students.
-- Клиентский прототип ПВЛ в основном использует in-memory db.studentProfiles; эта миграция — для PostgREST/синков в БД.

ALTER TABLE pvl_students DROP CONSTRAINT IF EXISTS pvl_students_status_check;

ALTER TABLE pvl_students ADD CONSTRAINT pvl_students_status_check
  CHECK (status IN ('applicant', 'active', 'paused', 'finished', 'certified'));

COMMENT ON COLUMN pvl_students.status IS 'applicant — абитуриент/предзачисление; active…certified — трек курса';
