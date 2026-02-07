-- RLS policies for meetings (admin can read all, users can read/write own)

alter table public.meetings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'meetings' and policyname = 'meetings_select_own'
  ) then
    create policy meetings_select_own
      on public.meetings
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'meetings' and policyname = 'meetings_select_admin'
  ) then
    create policy meetings_select_admin
      on public.meetings
      for select
      to authenticated
      using (public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'meetings' and policyname = 'meetings_insert_own'
  ) then
    create policy meetings_insert_own
      on public.meetings
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'meetings' and policyname = 'meetings_update_own'
  ) then
    create policy meetings_update_own
      on public.meetings
      for update
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'meetings' and policyname = 'meetings_update_admin'
  ) then
    create policy meetings_update_admin
      on public.meetings
      for update
      to authenticated
      using (public.is_admin())
      with check (public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'meetings' and policyname = 'meetings_delete_own'
  ) then
    create policy meetings_delete_own
      on public.meetings
      for delete
      to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'meetings' and policyname = 'meetings_delete_admin'
  ) then
    create policy meetings_delete_admin
      on public.meetings
      for delete
      to authenticated
      using (public.is_admin());
  end if;
end $$;
