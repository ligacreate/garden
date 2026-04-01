-- ПВЛ 2026: бальная система (курсовые до 400, СЗ до 54, отдельные сущности).
-- PostgreSQL. Прототип в приложении зеркалит эту модель в data/pvl/seed.js + services/pvlScoringEngine.js.
-- Триггеры: для PG 11–13 используйте EXECUTE PROCEDURE вместо EXECUTE FUNCTION при необходимости.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS pvl_cohorts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  year INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pvl_mentors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pvl_students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  cohort_id UUID REFERENCES pvl_cohorts(id) ON DELETE SET NULL,
  mentor_id UUID REFERENCES pvl_mentors(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pvl_students_status_check CHECK (status IN ('active', 'paused', 'finished', 'certified'))
);

CREATE INDEX IF NOT EXISTS idx_pvl_students_cohort_id ON pvl_students(cohort_id);
CREATE INDEX IF NOT EXISTS idx_pvl_students_mentor_id ON pvl_students(mentor_id);

CREATE TABLE IF NOT EXISTS pvl_course_weeks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_number INT NOT NULL,
  title TEXT NOT NULL,
  module_number INT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at DATE,
  ends_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (week_number)
);

CREATE TABLE IF NOT EXISTS pvl_course_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id UUID NOT NULL REFERENCES pvl_course_weeks(id) ON DELETE CASCADE,
  module_number INT,
  title TEXT NOT NULL,
  lesson_type TEXT NOT NULL DEFAULT 'lesson',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pvl_course_lessons_type_check CHECK (lesson_type IN ('lesson', 'video', 'pdf', 'checklist', 'practice', 'other'))
);

CREATE INDEX IF NOT EXISTS idx_pvl_course_lessons_week_id ON pvl_course_lessons(week_id);

CREATE TABLE IF NOT EXISTS pvl_homework_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID REFERENCES pvl_course_lessons(id) ON DELETE SET NULL,
  week_id UUID REFERENCES pvl_course_weeks(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  item_type TEXT NOT NULL DEFAULT 'homework',
  max_score INT NOT NULL DEFAULT 20,
  is_control_point BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pvl_homework_items_type_check CHECK (item_type IN ('homework', 'control_point', 'certification_task', 'other'))
);

CREATE INDEX IF NOT EXISTS idx_pvl_homework_items_week_id ON pvl_homework_items(week_id);
CREATE INDEX IF NOT EXISTS idx_pvl_homework_items_lesson_id ON pvl_homework_items(lesson_id);

CREATE TABLE IF NOT EXISTS pvl_student_homework_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES pvl_students(id) ON DELETE CASCADE,
  homework_item_id UUID NOT NULL REFERENCES pvl_homework_items(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft',
  score INT,
  mentor_bonus_score INT NOT NULL DEFAULT 0,
  submitted_at TIMESTAMPTZ,
  checked_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  revision_cycles INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pvl_student_homework_submissions_status_check
    CHECK (status IN ('draft', 'submitted', 'in_review', 'revision', 'accepted', 'rejected', 'overdue')),
  CONSTRAINT pvl_student_homework_submissions_score_check
    CHECK (score IS NULL OR score >= 0),
  CONSTRAINT pvl_student_homework_submissions_bonus_check
    CHECK (mentor_bonus_score >= 0)
);

CREATE INDEX IF NOT EXISTS idx_pvl_submissions_student_id ON pvl_student_homework_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_pvl_submissions_homework_item_id ON pvl_student_homework_submissions(homework_item_id);
CREATE INDEX IF NOT EXISTS idx_pvl_submissions_status ON pvl_student_homework_submissions(status);

CREATE TABLE IF NOT EXISTS pvl_homework_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES pvl_student_homework_submissions(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  comment TEXT,
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pvl_homework_status_history_submission_id ON pvl_homework_status_history(submission_id);

CREATE TABLE IF NOT EXISTS pvl_student_course_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES pvl_students(id) ON DELETE CASCADE,
  week_id UUID NOT NULL REFERENCES pvl_course_weeks(id) ON DELETE CASCADE,
  lessons_completed INT NOT NULL DEFAULT 0,
  lessons_total INT NOT NULL DEFAULT 0,
  homework_completed INT NOT NULL DEFAULT 0,
  homework_total INT NOT NULL DEFAULT 0,
  is_week_closed BOOLEAN NOT NULL DEFAULT FALSE,
  auto_points_awarded BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, week_id)
);

CREATE INDEX IF NOT EXISTS idx_pvl_student_course_progress_student_id ON pvl_student_course_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_pvl_student_course_progress_week_id ON pvl_student_course_progress(week_id);

CREATE TABLE IF NOT EXISTS pvl_student_course_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES pvl_students(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id UUID,
  points INT NOT NULL,
  is_auto BOOLEAN NOT NULL DEFAULT TRUE,
  comment TEXT,
  awarded_by UUID,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pvl_student_course_points_source_type_check
    CHECK (source_type IN (
      'onboarding',
      'week_completion',
      'control_point',
      'mentor_bonus',
      'manual_bonus',
      'library_material',
      'other'
    ))
);

CREATE INDEX IF NOT EXISTS idx_pvl_student_course_points_student_id ON pvl_student_course_points(student_id);
CREATE INDEX IF NOT EXISTS idx_pvl_student_course_points_source_type ON pvl_student_course_points(source_type);

CREATE TABLE IF NOT EXISTS pvl_student_certification_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES pvl_students(id) ON DELETE CASCADE,
  self_score_total INT NOT NULL DEFAULT 0,
  mentor_score_total INT NOT NULL DEFAULT 0,
  critical_flags_count INT NOT NULL DEFAULT 0,
  certification_status TEXT NOT NULL DEFAULT 'not_started',
  scored_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pvl_student_certification_scores_status_check
    CHECK (certification_status IN ('not_started', 'in_progress', 'submitted', 'accepted', 'revision', 'failed')),
  CONSTRAINT pvl_student_certification_scores_self_check
    CHECK (self_score_total >= 0 AND self_score_total <= 54),
  CONSTRAINT pvl_student_certification_scores_mentor_check
    CHECK (mentor_score_total >= 0 AND mentor_score_total <= 54)
);

CREATE INDEX IF NOT EXISTS idx_pvl_student_certification_scores_student_id ON pvl_student_certification_scores(student_id);

CREATE TABLE IF NOT EXISTS pvl_student_certification_criteria_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certification_score_id UUID NOT NULL REFERENCES pvl_student_certification_scores(id) ON DELETE CASCADE,
  criterion_code TEXT NOT NULL,
  self_score INT NOT NULL DEFAULT 0,
  mentor_score INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pvl_student_certification_criteria_self_check
    CHECK (self_score >= 0 AND self_score <= 3),
  CONSTRAINT pvl_student_certification_criteria_mentor_check
    CHECK (mentor_score >= 0 AND mentor_score <= 3),
  UNIQUE (certification_score_id, criterion_code)
);

CREATE INDEX IF NOT EXISTS idx_pvl_student_certification_criteria_scores_certification_score_id
  ON pvl_student_certification_criteria_scores(certification_score_id);

CREATE TABLE IF NOT EXISTS pvl_student_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES pvl_students(id) ON DELETE CASCADE,
  submission_id UUID REFERENCES pvl_student_homework_submissions(id) ON DELETE CASCADE,
  certification_score_id UUID REFERENCES pvl_student_certification_scores(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open',
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pvl_student_disputes_status_check
    CHECK (status IN ('open', 'in_review', 'resolved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_pvl_student_disputes_student_id ON pvl_student_disputes(student_id);

CREATE OR REPLACE FUNCTION pvl_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pvl_students_updated_at ON pvl_students;
CREATE TRIGGER trg_pvl_students_updated_at
BEFORE UPDATE ON pvl_students
FOR EACH ROW EXECUTE FUNCTION pvl_set_updated_at();

DROP TRIGGER IF EXISTS trg_pvl_student_homework_submissions_updated_at ON pvl_student_homework_submissions;
CREATE TRIGGER trg_pvl_student_homework_submissions_updated_at
BEFORE UPDATE ON pvl_student_homework_submissions
FOR EACH ROW EXECUTE FUNCTION pvl_set_updated_at();

DROP TRIGGER IF EXISTS trg_pvl_student_course_progress_updated_at ON pvl_student_course_progress;
CREATE TRIGGER trg_pvl_student_course_progress_updated_at
BEFORE UPDATE ON pvl_student_course_progress
FOR EACH ROW EXECUTE FUNCTION pvl_set_updated_at();

DROP TRIGGER IF EXISTS trg_pvl_student_certification_scores_updated_at ON pvl_student_certification_scores;
CREATE TRIGGER trg_pvl_student_certification_scores_updated_at
BEFORE UPDATE ON pvl_student_certification_scores
FOR EACH ROW EXECUTE FUNCTION pvl_set_updated_at();

DROP TRIGGER IF EXISTS trg_pvl_student_certification_criteria_scores_updated_at ON pvl_student_certification_criteria_scores;
CREATE TRIGGER trg_pvl_student_certification_criteria_scores_updated_at
BEFORE UPDATE ON pvl_student_certification_criteria_scores
FOR EACH ROW EXECUTE FUNCTION pvl_set_updated_at();

DROP TRIGGER IF EXISTS trg_pvl_student_disputes_updated_at ON pvl_student_disputes;
CREATE TRIGGER trg_pvl_student_disputes_updated_at
BEFORE UPDATE ON pvl_student_disputes
FOR EACH ROW EXECUTE FUNCTION pvl_set_updated_at();
