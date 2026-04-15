-- ПВЛ 2026: runtime/content слой для запуска через backend + PostgreSQL.
-- НЕ изменяет существующую 001_pvl_scoring_system.sql, дополняет ее.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS pvl_content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_key TEXT UNIQUE,
  title TEXT NOT NULL,
  short_description TEXT,
  body_html TEXT,
  content_type TEXT NOT NULL DEFAULT 'text',
  target_section TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  visibility TEXT NOT NULL DEFAULT 'all',
  target_role TEXT NOT NULL DEFAULT 'both',
  target_cohort_id UUID REFERENCES pvl_cohorts(id) ON DELETE SET NULL,
  module_number INT,
  week_number INT,
  lesson_kind TEXT,
  category_id TEXT,
  category_title TEXT,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  cover_image TEXT,
  external_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  estimated_duration TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pvl_content_items_status_check
    CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT pvl_content_items_target_role_check
    CHECK (target_role IN ('student', 'mentor', 'both', 'admin')),
  CONSTRAINT pvl_content_items_target_section_check
    CHECK (target_section IN (
      'about', 'glossary', 'library', 'tracker', 'lessons', 'practicums',
      'results', 'certification', 'qa', 'questions', 'settings', 'cultural_code', 'admin'
    )),
  CONSTRAINT pvl_content_items_content_type_check
    CHECK (content_type IN ('video', 'text', 'pdf', 'checklist', 'template', 'link', 'audio', 'fileBundle')),
  CONSTRAINT pvl_content_items_lesson_kind_check
    CHECK (lesson_kind IS NULL OR lesson_kind IN ('text_video', 'quiz', 'homework')),
  CONSTRAINT pvl_content_items_module_check
    CHECK (module_number IS NULL OR (module_number >= 0 AND module_number <= 4))
);

CREATE INDEX IF NOT EXISTS idx_pvl_content_items_status ON pvl_content_items(status);
CREATE INDEX IF NOT EXISTS idx_pvl_content_items_section ON pvl_content_items(target_section);
CREATE INDEX IF NOT EXISTS idx_pvl_content_items_role ON pvl_content_items(target_role);
CREATE INDEX IF NOT EXISTS idx_pvl_content_items_cohort ON pvl_content_items(target_cohort_id);
CREATE INDEX IF NOT EXISTS idx_pvl_content_items_module ON pvl_content_items(module_number);
CREATE INDEX IF NOT EXISTS idx_pvl_content_items_updated_at ON pvl_content_items(updated_at DESC);

CREATE TABLE IF NOT EXISTS pvl_content_placements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID NOT NULL REFERENCES pvl_content_items(id) ON DELETE CASCADE,
  target_section TEXT NOT NULL,
  target_role TEXT NOT NULL DEFAULT 'both',
  cohort_id UUID REFERENCES pvl_cohorts(id) ON DELETE SET NULL,
  module_number INT,
  week_number INT,
  order_index INT NOT NULL DEFAULT 999,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pvl_content_placements_target_role_check
    CHECK (target_role IN ('student', 'mentor', 'both', 'admin')),
  CONSTRAINT pvl_content_placements_target_section_check
    CHECK (target_section IN (
      'about', 'glossary', 'library', 'tracker', 'lessons', 'practicums',
      'results', 'certification', 'qa', 'questions', 'settings', 'cultural_code', 'admin'
    )),
  CONSTRAINT pvl_content_placements_module_check
    CHECK (module_number IS NULL OR (module_number >= 0 AND module_number <= 4))
);

CREATE INDEX IF NOT EXISTS idx_pvl_content_placements_content_id
  ON pvl_content_placements(content_item_id);
CREATE INDEX IF NOT EXISTS idx_pvl_content_placements_visibility
  ON pvl_content_placements(target_section, target_role, cohort_id, module_number, is_published);
CREATE INDEX IF NOT EXISTS idx_pvl_content_placements_order
  ON pvl_content_placements(target_section, cohort_id, module_number, order_index);

CREATE TABLE IF NOT EXISTS pvl_calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_key TEXT UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL DEFAULT 'other',
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  date_hint DATE,
  linked_lesson_id UUID REFERENCES pvl_course_lessons(id) ON DELETE SET NULL,
  linked_practicum_id UUID,
  visibility_role TEXT NOT NULL DEFAULT 'all',
  cohort_id UUID REFERENCES pvl_cohorts(id) ON DELETE SET NULL,
  color_token TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pvl_calendar_events_visibility_role_check
    CHECK (visibility_role IN ('all', 'student', 'mentor', 'admin')),
  CONSTRAINT pvl_calendar_events_event_type_check
    CHECK (event_type IN ('lesson', 'practicum', 'breakfast', 'mentor_meeting', 'live_stream', 'lesson_release', 'deadline', 'other'))
);

CREATE INDEX IF NOT EXISTS idx_pvl_calendar_events_cohort_start
  ON pvl_calendar_events(cohort_id, start_at);
CREATE INDEX IF NOT EXISTS idx_pvl_calendar_events_type_start
  ON pvl_calendar_events(event_type, start_at);

CREATE TABLE IF NOT EXISTS pvl_faq_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_key TEXT UNIQUE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  target_role TEXT NOT NULL DEFAULT 'both',
  target_section TEXT,
  module_number INT,
  order_index INT NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pvl_faq_items_target_role_check
    CHECK (target_role IN ('student', 'mentor', 'both', 'admin')),
  CONSTRAINT pvl_faq_items_module_check
    CHECK (module_number IS NULL OR (module_number >= 0 AND module_number <= 4))
);

CREATE INDEX IF NOT EXISTS idx_pvl_faq_items_role_section
  ON pvl_faq_items(target_role, target_section, is_published, order_index);

CREATE TABLE IF NOT EXISTS pvl_student_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_key TEXT UNIQUE,
  student_id UUID NOT NULL REFERENCES pvl_students(id) ON DELETE CASCADE,
  cohort_id UUID REFERENCES pvl_cohorts(id) ON DELETE SET NULL,
  module_number INT,
  subject TEXT,
  question_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  visibility TEXT NOT NULL DEFAULT 'private',
  assigned_mentor_id UUID REFERENCES pvl_mentors(id) ON DELETE SET NULL,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pvl_student_questions_status_check
    CHECK (status IN ('open', 'in_review', 'answered', 'resolved', 'archived')),
  CONSTRAINT pvl_student_questions_visibility_check
    CHECK (visibility IN ('private', 'cohort', 'public_faq')),
  CONSTRAINT pvl_student_questions_module_check
    CHECK (module_number IS NULL OR (module_number >= 0 AND module_number <= 4))
);

CREATE INDEX IF NOT EXISTS idx_pvl_student_questions_student
  ON pvl_student_questions(student_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pvl_student_questions_mentor
  ON pvl_student_questions(assigned_mentor_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pvl_student_questions_cohort_module
  ON pvl_student_questions(cohort_id, module_number, status);

CREATE TABLE IF NOT EXISTS pvl_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_key TEXT UNIQUE,
  recipient_role TEXT NOT NULL,
  recipient_student_id UUID REFERENCES pvl_students(id) ON DELETE CASCADE,
  recipient_mentor_id UUID REFERENCES pvl_mentors(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT,
  text TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_system BOOLEAN NOT NULL DEFAULT TRUE,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pvl_notifications_recipient_role_check
    CHECK (recipient_role IN ('student', 'mentor', 'admin', 'all')),
  CONSTRAINT pvl_notifications_recipient_target_check
    CHECK (
      (recipient_role = 'student' AND recipient_student_id IS NOT NULL)
      OR (recipient_role = 'mentor' AND recipient_mentor_id IS NOT NULL)
      OR (recipient_role IN ('admin', 'all'))
    )
);

CREATE INDEX IF NOT EXISTS idx_pvl_notifications_student
  ON pvl_notifications(recipient_student_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pvl_notifications_mentor
  ON pvl_notifications(recipient_mentor_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pvl_notifications_role
  ON pvl_notifications(recipient_role, is_read, created_at DESC);

CREATE OR REPLACE FUNCTION pvl_runtime_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pvl_content_items_updated_at ON pvl_content_items;
CREATE TRIGGER trg_pvl_content_items_updated_at
BEFORE UPDATE ON pvl_content_items
FOR EACH ROW EXECUTE FUNCTION pvl_runtime_set_updated_at();

DROP TRIGGER IF EXISTS trg_pvl_content_placements_updated_at ON pvl_content_placements;
CREATE TRIGGER trg_pvl_content_placements_updated_at
BEFORE UPDATE ON pvl_content_placements
FOR EACH ROW EXECUTE FUNCTION pvl_runtime_set_updated_at();

DROP TRIGGER IF EXISTS trg_pvl_calendar_events_updated_at ON pvl_calendar_events;
CREATE TRIGGER trg_pvl_calendar_events_updated_at
BEFORE UPDATE ON pvl_calendar_events
FOR EACH ROW EXECUTE FUNCTION pvl_runtime_set_updated_at();

DROP TRIGGER IF EXISTS trg_pvl_faq_items_updated_at ON pvl_faq_items;
CREATE TRIGGER trg_pvl_faq_items_updated_at
BEFORE UPDATE ON pvl_faq_items
FOR EACH ROW EXECUTE FUNCTION pvl_runtime_set_updated_at();

DROP TRIGGER IF EXISTS trg_pvl_student_questions_updated_at ON pvl_student_questions;
CREATE TRIGGER trg_pvl_student_questions_updated_at
BEFORE UPDATE ON pvl_student_questions
FOR EACH ROW EXECUTE FUNCTION pvl_runtime_set_updated_at();
