-- goals_fk_diagnostics_and_repair.sql
-- Purpose:
-- 1) Diagnose why inserts into public.goals fail with goals_user_id_fkey
-- 2) Repair missing rows in public.users for ids that exist in public.profiles
--
-- Run in Supabase SQL Editor (or psql) as admin.
-- Recommended: run section A first (read-only), then section B (transactional repair).

-- =========================================================
-- A) DIAGNOSTICS (READ-ONLY)
-- =========================================================

-- A1. Confirm FK target for goals.user_id
select
  tc.constraint_name,
  tc.table_schema,
  tc.table_name,
  kcu.column_name as fk_column,
  ccu.table_schema as referenced_schema,
  ccu.table_name as referenced_table,
  ccu.column_name as referenced_column
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
 and tc.table_schema = kcu.table_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name
 and ccu.table_schema = tc.table_schema
where tc.constraint_type = 'FOREIGN KEY'
  and tc.table_schema = 'public'
  and tc.table_name = 'goals'
  and kcu.column_name = 'user_id';

-- A2. Data types for ids involved
select table_name, column_name, data_type, udt_name
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'goals' and column_name = 'user_id')
    or (table_name = 'users' and column_name = 'id')
    or (table_name = 'profiles' and column_name = 'id')
  )
order by table_name, column_name;

-- A3. Count users/profiles and overlap
select
  (select count(*) from public.users) as users_total,
  (select count(*) from public.profiles) as profiles_total,
  (select count(*)
     from public.profiles p
     join public.users u on u.id = p.id) as profiles_with_users;

-- A4. Profiles that do not exist in users (most likely root cause)
select
  p.id as profile_id,
  p.email,
  p.name,
  p.city
from public.profiles p
left join public.users u on u.id = p.id
where u.id is null
order by p.created_at desc nulls last
limit 200;

-- A5. Existing orphan goals (if FK was absent earlier)
select
  g.id as goal_id,
  g.user_id,
  g.title,
  g.created_at
from public.goals g
left join public.users u on u.id = g.user_id
where u.id is null
order by g.created_at desc nulls last
limit 200;

-- =========================================================
-- B) REPAIR (TRANSACTIONAL)
-- =========================================================
-- What it does:
-- - Inserts into public.users rows for profile ids missing in users.
-- - Uses only columns that actually exist in public.users.
-- - Keeps operation idempotent (safe to re-run).
--
-- IMPORTANT:
-- 1) Review "SELECT * FROM to_insert" output before commit.
-- 2) If output looks wrong, run ROLLBACK instead of COMMIT.

begin;

-- B1. Build candidate rows (profiles missing in users)
with missing as (
  select p.id, p.email, p.name, p.city
  from public.profiles p
  left join public.users u on u.id = p.id
  where u.id is null
),
to_insert as (
  select
    m.id,
    nullif(trim(m.email), '') as email,
    nullif(trim(m.name), '') as name,
    nullif(trim(m.city), '') as city
  from missing m
)
select * from to_insert order by id limit 200;

-- B2. Insert dynamically depending on existing columns in public.users
do $$
declare
  has_email boolean;
  has_name boolean;
  has_city boolean;
  has_role boolean;
  has_status boolean;
  has_created_at boolean;
  has_updated_at boolean;
  sql_text text;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='users' and column_name='email'
  ) into has_email;

  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='users' and column_name='name'
  ) into has_name;

  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='users' and column_name='city'
  ) into has_city;

  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='users' and column_name='role'
  ) into has_role;

  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='users' and column_name='status'
  ) into has_status;

  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='users' and column_name='created_at'
  ) into has_created_at;

  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='users' and column_name='updated_at'
  ) into has_updated_at;

  sql_text := 'insert into public.users (id';
  if has_email then sql_text := sql_text || ', email'; end if;
  if has_name then sql_text := sql_text || ', name'; end if;
  if has_city then sql_text := sql_text || ', city'; end if;
  if has_role then sql_text := sql_text || ', role'; end if;
  if has_status then sql_text := sql_text || ', status'; end if;
  if has_created_at then sql_text := sql_text || ', created_at'; end if;
  if has_updated_at then sql_text := sql_text || ', updated_at'; end if;

  sql_text := sql_text || ') select p.id';
  if has_email then sql_text := sql_text || ', nullif(trim(p.email), '''')'; end if;
  if has_name then sql_text := sql_text || ', nullif(trim(p.name), '''')'; end if;
  if has_city then sql_text := sql_text || ', nullif(trim(p.city), '''')'; end if;
  if has_role then sql_text := sql_text || ', ''applicant'''; end if;
  if has_status then sql_text := sql_text || ', ''active'''; end if;
  if has_created_at then sql_text := sql_text || ', now()'; end if;
  if has_updated_at then sql_text := sql_text || ', now()'; end if;

  sql_text := sql_text || '
    from public.profiles p
    left join public.users u on u.id = p.id
    where u.id is null
    on conflict (id) do nothing';

  execute sql_text;
end $$;

-- B3. Validate after insert
select
  (select count(*) from public.profiles p left join public.users u on u.id = p.id where u.id is null) as profiles_still_missing_in_users,
  (select count(*) from public.goals g left join public.users u on u.id = g.user_id where u.id is null) as orphan_goals_after_repair;

-- If everything looks good:
commit;

-- If not:
-- rollback;

