-- Chat message update/delete permissions and optional Supabase RLS policies.
-- Safe to re-run.

grant update, delete on table public.messages to public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant update, delete on table public.messages to authenticated;
  end if;
end $$;

-- Optional strict policies for Supabase-like setups where auth.uid() exists.
do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth'
      and p.proname = 'uid'
  )
  and exists (select 1 from pg_roles where rolname = 'authenticated') then
    begin
      alter table public.messages enable row level security;
    exception
      when others then
        null;
    end;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'messages' and policyname = 'messages_update_own'
    ) then
      create policy messages_update_own
        on public.messages
        for update
        to authenticated
        using (author_id = auth.uid())
        with check (author_id = auth.uid());
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'messages' and policyname = 'messages_delete_own'
    ) then
      create policy messages_delete_own
        on public.messages
        for delete
        to authenticated
        using (author_id = auth.uid());
    end if;
  end if;
end $$;
