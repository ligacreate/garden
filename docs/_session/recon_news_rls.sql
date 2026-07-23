\pset pager off
\set ON_ERROR_STOP off
\echo '==================== 1. RLS FLAGS on public.news ===================='
SELECT relname, relrowsecurity AS rls_on, relforcerowsecurity AS rls_forced
FROM pg_class WHERE relname='news';

\echo '==================== 2. POLICIES on public.news ===================='
SELECT policyname, cmd, permissive, roles::text AS roles, qual, with_check
FROM pg_policies WHERE schemaname='public' AND tablename='news'
ORDER BY cmd, policyname;

\echo '==================== 3. TABLE GRANTS (authenticated/anon) on news ===================='
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name='news' AND grantee IN ('authenticated','anon')
ORDER BY grantee, privilege_type;

\echo '==================== 4. NEWS ROWS ===================='
SELECT id, left(title,45) AS title, author_id,
       (author_id IS NULL) AS author_null, created_at
FROM news ORDER BY id;

\echo '==================== 5. ADMIN USERS (role=admin) ===================='
SELECT id, name, role, access_status
FROM profiles WHERE lower(role)='admin' ORDER BY name;

\echo '==================== 6. DRY-RUN: admin DELETE #15/#16 as authenticated (ROLLBACK) ===================='
BEGIN;
SELECT set_config('request.jwt.claim.sub',
    (SELECT id::text FROM profiles WHERE lower(role)='admin' ORDER BY id LIMIT 1), true) AS acting_admin_id;
SET LOCAL ROLE authenticated;
WITH d AS (DELETE FROM news WHERE id IN (15,16) RETURNING id)
SELECT coalesce(json_agg(d.id ORDER BY d.id), '[]'::json) AS deleted_ids, count(*) AS deleted_count FROM d;
ROLLBACK;

\echo '==================== 7. DRY-RUN: admin DELETE all author_id IS NULL as authenticated (ROLLBACK) ===================='
BEGIN;
SELECT set_config('request.jwt.claim.sub',
    (SELECT id::text FROM profiles WHERE lower(role)='admin' ORDER BY id LIMIT 1), true) AS acting_admin_id;
SET LOCAL ROLE authenticated;
WITH d AS (DELETE FROM news WHERE author_id IS NULL RETURNING id)
SELECT count(*) AS deleted_null_author_rows FROM d;
ROLLBACK;

\echo '==================== 8. DRY-RUN: admin DELETE an own-authored row, if any (ROLLBACK) ===================='
BEGIN;
SELECT set_config('request.jwt.claim.sub',
    (SELECT id::text FROM profiles WHERE lower(role)='admin' ORDER BY id LIMIT 1), true) AS acting_admin_id;
SET LOCAL ROLE authenticated;
WITH d AS (DELETE FROM news WHERE author_id = current_setting('request.jwt.claim.sub',true)::uuid RETURNING id)
SELECT count(*) AS deleted_own_rows FROM d;
ROLLBACK;
