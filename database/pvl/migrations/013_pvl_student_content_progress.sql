-- Прогресс учениц по материалам библиотеки (контент-айтемы ПВЛ).
-- Отслеживает: открыт ли материал, пройден ли (тест/кнопка), процент и дата.
-- Примечание: content_item_id хранится как TEXT (совпадает с реальным типом pvl_content_items.id в БД).

BEGIN;

CREATE TABLE IF NOT EXISTS pvl_student_content_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES pvl_students(id) ON DELETE CASCADE,
  content_item_id TEXT NOT NULL,
  progress_percent INT NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  last_opened_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, content_item_id)
);

CREATE INDEX IF NOT EXISTS idx_pvl_student_content_progress_student_id
  ON pvl_student_content_progress(student_id);

CREATE INDEX IF NOT EXISTS idx_pvl_student_content_progress_content_item_id
  ON pvl_student_content_progress(content_item_id);

DROP TRIGGER IF EXISTS trg_pvl_student_content_progress_updated_at
  ON pvl_student_content_progress;
CREATE TRIGGER trg_pvl_student_content_progress_updated_at
BEFORE UPDATE ON pvl_student_content_progress
FOR EACH ROW EXECUTE FUNCTION pvl_set_updated_at();

ALTER TABLE pvl_student_content_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pvl_student_content_progress_student ON pvl_student_content_progress;
CREATE POLICY pvl_student_content_progress_student
  ON pvl_student_content_progress
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- gen_user — роль PostgREST (как в 012_pvl_student_upsert_permissions.sql)
GRANT SELECT, INSERT, UPDATE, DELETE
  ON pvl_student_content_progress TO gen_user;

COMMIT;
