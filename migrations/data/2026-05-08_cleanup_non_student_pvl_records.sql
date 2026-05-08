-- migrations/data/2026-05-08_cleanup_non_student_pvl_records.sql
--
-- Cleanup pvl_students от не-студенческих записей.
--
-- Контекст: ensurePvlStudentInDb (services/pvlMockApi.js:603-650) при
-- любом write-callsite (persistContentProgressToDb / markChecklistItem /
-- etc.) создаёт запись в pvl_students без проверки role. В результате
-- 5 не-студенческих записей попали в pvl_students:
--
--   - 1 admin (Анастасия Зобнина — ассистент)
--   - 1 intern (Анастасия Ван — стажёр)
--   - 2 mentor (Василина Лузина, Наталья Гулякова)
--   - 1 тест-фикстура (Участница, без profile)
--
-- Архитектурный fix — отдельный тикет BUG-PVL-ENSURE-RESPECTS-ROLE.
-- Без него лишние записи будут появляться снова при заходах
-- админов/менторов/стажёров в PVL-учительскую.
--
-- ВАЖНО:
-- - DELETE только из pvl_students. CASCADE снесёт pvl_student_*
--   (homework_submissions, content_progress, course_progress,
--    checklist_items).
-- - profiles, users_auth НЕ трогаем — менторы/админы продолжают
--   пользоваться Garden как раньше.
-- - pvl_garden_mentor_links где student_id = ... — удалить явно
--   (FK не объявлен, нет CASCADE; скорее всего пусто, safety-DELETE).
-- - Mentor-link'и где Василина mentor_id (4 строки) — оставить.
--   Они указывают на её profile.id, не на pvl_students.id. Её
--   функция как ментор для подопечных не нарушится.
-- - pvl_audit_log.actor_user_id orphans — оставить (audit-trail).
--
-- Apply:
--   ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
--     PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
--     -v ON_ERROR_STOP=1 -f /tmp/2026-05-08_cleanup_non_student_pvl_records.sql'

\set ON_ERROR_STOP on

BEGIN;

\echo === Pre-cleanup snapshot ===
SELECT count(*) AS total FROM pvl_students;
SELECT
  count(*) FILTER (WHERE p.role = 'applicant') AS applicants,
  count(*) FILTER (WHERE p.role IN ('admin','mentor','intern')) AS non_students,
  count(*) FILTER (WHERE p.role IS NULL) AS no_profile
FROM pvl_students s LEFT JOIN profiles p ON p.id = s.id;

-- 1. Защитный DELETE из pvl_garden_mentor_links по student_id
--    (FK не объявлен, CASCADE не сработает).
DELETE FROM pvl_garden_mentor_links
WHERE student_id IN (
  'e6de2a97-60f8-4864-a6d9-eb7da2831bf4',
  '4250ffac-acd7-4209-bd28-b31bd9c02665',
  '6cf385c3-5d4b-44dc-bcf1-6aa17d50bac7',
  '628585ef-a6c2-4e1b-b4c6-bf49b5ecc839',
  '33333333-3333-3333-3333-333333333301'
);

-- 2. DELETE из pvl_students. CASCADE снесёт pvl_student_*.
DELETE FROM pvl_students WHERE id IN (
  'e6de2a97-60f8-4864-a6d9-eb7da2831bf4',  -- Анастасия Зобнина (admin)
  '4250ffac-acd7-4209-bd28-b31bd9c02665',  -- Анастасия Ван (intern)
  '6cf385c3-5d4b-44dc-bcf1-6aa17d50bac7',  -- Василина Лузина (mentor)
  '628585ef-a6c2-4e1b-b4c6-bf49b5ecc839',  -- Наталья Гулякова (mentor)
  '33333333-3333-3333-3333-333333333301'   -- Участница (тест-фикстура)
);

\echo === Post-cleanup snapshot ===
SELECT count(*) AS total FROM pvl_students;
SELECT
  count(*) FILTER (WHERE p.role = 'applicant') AS applicants,
  count(*) FILTER (WHERE p.role IN ('admin','mentor','intern')) AS non_students,
  count(*) FILTER (WHERE p.role IS NULL) AS no_profile
FROM pvl_students s LEFT JOIN profiles p ON p.id = s.id;

-- ожидание: total=17, applicants=17, non_students=0, no_profile=0

COMMIT;
