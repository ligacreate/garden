-- Unify profile data: ensure columns exist and migrate auth metadata into profiles
-- Run in Supabase SQL editor with service role access.

alter table public.profiles add column if not exists name text;
alter table public.profiles add column if not exists city text;
alter table public.profiles add column if not exists role text;
alter table public.profiles add column if not exists status text;
alter table public.profiles add column if not exists tree text;
alter table public.profiles add column if not exists tree_desc text;
alter table public.profiles add column if not exists seeds integer;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists dob date;
alter table public.profiles add column if not exists x numeric;
alter table public.profiles add column if not exists y numeric;
alter table public.profiles add column if not exists skills text[];
alter table public.profiles add column if not exists offer text;
alter table public.profiles add column if not exists unique_abilities text;
alter table public.profiles add column if not exists join_date date;

-- Insert missing profiles from auth.users
insert into public.profiles (
  id, email, name, city, role, status, tree, tree_desc, seeds, avatar_url, dob, x, y, skills, offer, unique_abilities, join_date
)
select
  u.id,
  u.email,
  u.raw_user_meta_data->>'name',
  u.raw_user_meta_data->>'city',
  coalesce(u.raw_user_meta_data->>'role', 'applicant'),
  coalesce(u.raw_user_meta_data->>'status', 'active'),
  u.raw_user_meta_data->>'tree',
  coalesce(u.raw_user_meta_data->>'tree_desc', u.raw_user_meta_data->>'treeDesc'),
  nullif(u.raw_user_meta_data->>'seeds', '')::int,
  coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'avatar'),
  nullif(u.raw_user_meta_data->>'dob', '')::date,
  nullif(u.raw_user_meta_data->>'x', '')::numeric,
  nullif(u.raw_user_meta_data->>'y', '')::numeric,
  case
    when jsonb_typeof(u.raw_user_meta_data->'skills') = 'array'
      then (select array_agg(value) from jsonb_array_elements_text(u.raw_user_meta_data->'skills'))
    when jsonb_typeof(u.raw_user_meta_data->'skills') = 'string'
      then string_to_array(u.raw_user_meta_data->>'skills', ',')
    else null
  end,
  u.raw_user_meta_data->>'offer',
  u.raw_user_meta_data->>'unique_abilities',
  nullif(u.raw_user_meta_data->>'join_date', '')::date
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- Backfill missing fields in existing profiles from auth metadata
update public.profiles p
set
  name = coalesce(p.name, u.raw_user_meta_data->>'name'),
  city = coalesce(p.city, u.raw_user_meta_data->>'city'),
  role = coalesce(p.role, u.raw_user_meta_data->>'role'),
  status = coalesce(p.status, u.raw_user_meta_data->>'status'),
  tree = coalesce(p.tree, u.raw_user_meta_data->>'tree'),
  tree_desc = coalesce(p.tree_desc, u.raw_user_meta_data->>'tree_desc', u.raw_user_meta_data->>'treeDesc'),
  seeds = coalesce(p.seeds, nullif(u.raw_user_meta_data->>'seeds', '')::int),
  avatar_url = coalesce(p.avatar_url, u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'avatar'),
  dob = coalesce(p.dob, nullif(u.raw_user_meta_data->>'dob', '')::date),
  x = coalesce(p.x, nullif(u.raw_user_meta_data->>'x', '')::numeric),
  y = coalesce(p.y, nullif(u.raw_user_meta_data->>'y', '')::numeric),
  offer = coalesce(p.offer, u.raw_user_meta_data->>'offer'),
  unique_abilities = coalesce(p.unique_abilities, u.raw_user_meta_data->>'unique_abilities'),
  join_date = coalesce(p.join_date, nullif(u.raw_user_meta_data->>'join_date', '')::date),
  skills = case
    when p.skills is null or array_length(p.skills, 1) = 0 then
      case
        when jsonb_typeof(u.raw_user_meta_data->'skills') = 'array'
          then (select array_agg(value) from jsonb_array_elements_text(u.raw_user_meta_data->'skills'))
        when jsonb_typeof(u.raw_user_meta_data->'skills') = 'string'
          then string_to_array(u.raw_user_meta_data->>'skills', ',')
        else p.skills
      end
    else p.skills
  end
from auth.users u
where p.id = u.id;
