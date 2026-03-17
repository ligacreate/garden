-- Ensure course progress is stored in DB for all authenticated users.
-- Safe to re-run.

create table if not exists public.course_progress (
  user_id uuid not null,
  material_id text not null,
  course_title text not null,
  created_at timestamptz not null default now()
);

-- Remove duplicates before unique index creation (keep earliest row).
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'course_progress'
      and column_name in ('user_id', 'material_id', 'course_title')
    group by table_schema, table_name
    having count(*) = 3
  ) then
    with ranked as (
      select
        ctid,
        row_number() over (
          partition by user_id, material_id, course_title
          order by created_at asc nulls last
        ) as rn
      from public.course_progress
    )
    delete from public.course_progress cp
    using ranked r
    where cp.ctid = r.ctid
      and r.rn > 1;
  end if;
end $$;

create unique index if not exists course_progress_user_material_course_uidx
  on public.course_progress (user_id, material_id, course_title);

create index if not exists course_progress_user_course_idx
  on public.course_progress (user_id, course_title);

alter table public.course_progress enable row level security;

grant select, insert on table public.course_progress to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'course_progress' and policyname = 'course_progress_select_own'
  ) then
    create policy course_progress_select_own
      on public.course_progress
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'course_progress' and policyname = 'course_progress_select_admin'
  ) then
    create policy course_progress_select_admin
      on public.course_progress
      for select
      to authenticated
      using (public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'course_progress' and policyname = 'course_progress_insert_own'
  ) then
    create policy course_progress_insert_own
      on public.course_progress
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'course_progress' and policyname = 'course_progress_insert_admin'
  ) then
    create policy course_progress_insert_admin
      on public.course_progress
      for insert
      to authenticated
      with check (public.is_admin());
  end if;
end $$;
