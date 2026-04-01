-- Минимальный воспроизводимый демо-слой для PostgreSQL после миграции
-- database/pvl/migrations/001_pvl_scoring_system.sql
--
-- Полный сценарий четырёх учениц (недели 0–12, КТ, бонусы, прогресс, СЗ, споры)
-- дублируется в data/pvl/seed.js и поднимается в памяти через pvlMockApi.
--
-- Запуск (пример): psql $DATABASE_URL -f database/pvl/seed/001_demo_minimal.sql

BEGIN;

INSERT INTO pvl_cohorts (id, title, year) VALUES
  ('11111111-1111-1111-1111-111111111101', 'ПВЛ 2026 · Поток 1 (SQL demo)', 2026)
ON CONFLICT (id) DO NOTHING;

INSERT INTO pvl_mentors (id, full_name) VALUES
  ('22222222-2222-2222-2222-222222222201', 'Елена Ментор (SQL)'),
  ('22222222-2222-2222-2222-222222222202', 'Ольга Куратор (SQL)')
ON CONFLICT (id) DO NOTHING;

INSERT INTO pvl_course_weeks (week_number, title, module_number, is_active)
SELECT
  g,
  'Неделя ' || g,
  CASE
    WHEN g = 0 THEN 0
    WHEN g BETWEEN 1 AND 3 THEN 1
    WHEN g BETWEEN 4 AND 6 THEN 2
    WHEN g BETWEEN 7 AND 9 THEN 3
    ELSE 4
  END,
  true
FROM generate_series(0, 12) AS g
ON CONFLICT (week_number) DO NOTHING;

INSERT INTO pvl_students (id, full_name, cohort_id, mentor_id, status) VALUES
  ('33333333-3333-3333-3333-333333333301', 'Демо-ученица SQL 1', '11111111-1111-1111-1111-111111111101', '22222222-2222-2222-2222-222222222201', 'active'),
  ('33333333-3333-3333-3333-333333333302', 'Демо-ученица SQL 2', '11111111-1111-1111-1111-111111111101', '22222222-2222-2222-2222-222222222201', 'active'),
  ('33333333-3333-3333-3333-333333333303', 'Демо-ученица SQL 3', '11111111-1111-1111-1111-111111111101', '22222222-2222-2222-2222-222222222202', 'active'),
  ('33333333-3333-3333-3333-333333333304', 'Демо-ученица SQL 4', '11111111-1111-1111-1111-111111111101', '22222222-2222-2222-2222-222222222201', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO pvl_student_certification_scores (id, student_id, self_score_total, mentor_score_total, critical_flags_count, certification_status)
VALUES
  ('44444444-4444-4444-4444-444444444301', '33333333-3333-3333-3333-333333333301', 0, 0, 0, 'not_started'),
  ('44444444-4444-4444-4444-444444444302', '33333333-3333-3333-3333-333333333302', 12, 0, 0, 'in_progress'),
  ('44444444-4444-4444-4444-444444444303', '33333333-3333-3333-3333-333333333303', 41, 28, 1, 'in_progress'),
  ('44444444-4444-4444-4444-444444444304', '33333333-3333-3333-3333-333333333304', 0, 0, 0, 'not_started')
ON CONFLICT (id) DO NOTHING;

COMMIT;
