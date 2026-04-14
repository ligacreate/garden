-- Связь «ученица ↔ ментор» по UUID профилей Сада (PostgREST), без FK на pvl_students/pvl_mentors SQL-демо.
-- Выполнить на проде под ролью с правом CREATE на public.

CREATE TABLE IF NOT EXISTS pvl_garden_mentor_links (
  student_id UUID PRIMARY KEY,
  mentor_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pvl_garden_mentor_links_mentor_id ON pvl_garden_mentor_links(mentor_id);

COMMENT ON TABLE pvl_garden_mentor_links IS 'Назначение ментора в AL Camp: student_id и mentor_id — id из profiles (Сад).';
