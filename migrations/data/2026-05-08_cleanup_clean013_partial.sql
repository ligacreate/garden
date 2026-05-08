-- migrations/data/2026-05-08_cleanup_clean013_partial.sql
--
-- Cleanup CLEAN-013 partial: 3 пользователя.
--
-- Логика повторяет public.admin_delete_user_full(uuid) — DELETE из
-- всех связанных таблиц: pvl_garden_mentor_links, pvl_students
-- (CASCADE → pvl_student_*), users_auth, profiles. Audit-запись
-- остаётся в pvl_audit_log по дизайну (audit-trail integrity).
--
-- Не удаляем (Ольга 2026-05-08): Настина фея, Настин фиксик —
-- оставлены как тест-окружение Насти, будут скрыты через
-- localStorage hiddenGardenUserIds («глазик» в Garden AdminPanel).
--
-- Apply:
--   ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
--     PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
--     -v ON_ERROR_STOP=1 -f /tmp/2026-05-08_cleanup_clean013_partial.sql'

\set ON_ERROR_STOP on

BEGIN;

\echo === Pre-cleanup ===
SELECT count(*) AS pvl_students FROM pvl_students;
SELECT count(*) AS profiles FROM profiles WHERE id IN (
  '1431f70e-63bd-4709-803a-5643540fc759',
  '3746da91-5c66-4e91-9966-15643136dae6',
  '49c267b1-7ef6-48f6-bb2f-0e6741491b90'
);

-- Audit BEFORE delete (3 записи)
INSERT INTO public.pvl_audit_log (
  id, actor_user_id, action, entity_type, entity_id, payload, created_at
)
SELECT
  gen_random_uuid()::text,
  NULL::text,  -- системная миграция, не от лица админа
  'cleanup_clean013_partial',
  'profile',
  uuid_id::text,
  jsonb_build_object(
    'summary', 'Cleanup CLEAN-013 partial (стратег decision 2026-05-08)',
    'deleted_user_id', uuid_id
  ),
  now()
FROM (VALUES
  ('1431f70e-63bd-4709-803a-5643540fc759'::uuid),
  ('3746da91-5c66-4e91-9966-15643136dae6'::uuid),
  ('49c267b1-7ef6-48f6-bb2f-0e6741491b90'::uuid)
) AS t(uuid_id);

-- Защитный DELETE из pvl_garden_mentor_links (FK не объявлен).
DELETE FROM pvl_garden_mentor_links
WHERE student_id IN (
  '1431f70e-63bd-4709-803a-5643540fc759',
  '3746da91-5c66-4e91-9966-15643136dae6',
  '49c267b1-7ef6-48f6-bb2f-0e6741491b90'
)
   OR mentor_id IN (
  '1431f70e-63bd-4709-803a-5643540fc759',
  '3746da91-5c66-4e91-9966-15643136dae6',
  '49c267b1-7ef6-48f6-bb2f-0e6741491b90'
);

-- DELETE pvl_students (CASCADE снесёт pvl_student_*)
DELETE FROM pvl_students WHERE id IN (
  '1431f70e-63bd-4709-803a-5643540fc759',
  '3746da91-5c66-4e91-9966-15643136dae6',
  '49c267b1-7ef6-48f6-bb2f-0e6741491b90'
);

-- DELETE users_auth
DELETE FROM users_auth WHERE id IN (
  '1431f70e-63bd-4709-803a-5643540fc759',
  '3746da91-5c66-4e91-9966-15643136dae6',
  '49c267b1-7ef6-48f6-bb2f-0e6741491b90'
);

-- DELETE profiles (последним, потому что users_auth/pvl_students могут
-- иметь FK не объявлены, но логически profiles — корневая)
DELETE FROM profiles WHERE id IN (
  '1431f70e-63bd-4709-803a-5643540fc759',
  '3746da91-5c66-4e91-9966-15643136dae6',
  '49c267b1-7ef6-48f6-bb2f-0e6741491b90'
);

\echo === Post-cleanup ===
SELECT count(*) AS pvl_students FROM pvl_students;
SELECT count(*) AS profiles_left FROM profiles WHERE id IN (
  '1431f70e-63bd-4709-803a-5643540fc759',
  '3746da91-5c66-4e91-9966-15643136dae6',
  '49c267b1-7ef6-48f6-bb2f-0e6741491b90'
);
-- ожидание: pvl_students=14 (17-3), profiles_left=0

COMMIT;
