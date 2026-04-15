-- Личная переписка ментор ↔ ученица в AL Camp (PVL).
-- Выполнить на проде под ролью с правом CREATE на public.

CREATE TABLE IF NOT EXISTS pvl_direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id UUID NOT NULL,
  student_id UUID NOT NULL,
  author_user_id UUID NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE pvl_direct_messages IS 'Переписка между ментором и ученицей в AL Camp. mentor_id и student_id — UUID из profiles (Сад).';

CREATE INDEX IF NOT EXISTS idx_pvl_direct_messages_dialog
  ON pvl_direct_messages(mentor_id, student_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_pvl_direct_messages_student_id
  ON pvl_direct_messages(student_id);
