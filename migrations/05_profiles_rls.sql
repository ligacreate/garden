-- RLS policies for profiles
-- Run in Supabase SQL editor. Safe re-run via IF NOT EXISTS checks.

alter table public.profiles enable row level security;

-- Helper: check if current user is admin
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_select_authenticated'
  ) then
    create policy profiles_select_authenticated
      on public.profiles
      for select
      to authenticated
      using (auth.uid() is not null);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_insert_own'
  ) then
    create policy profiles_insert_own
      on public.profiles
      for insert
      to authenticated
      with check (auth.uid() = id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_update_own'
  ) then
    create policy profiles_update_own
      on public.profiles
      for update
      to authenticated
      using (auth.uid() = id)
      with check (auth.uid() = id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_update_admin'
  ) then
    create policy profiles_update_admin
      on public.profiles
      for update
      to authenticated
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end $$;
