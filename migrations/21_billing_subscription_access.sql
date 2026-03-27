-- Billing/subscription access model for Prodamus integration.
-- Safe to re-run.

alter table public.profiles
  add column if not exists access_status text default 'active',
  add column if not exists subscription_status text default 'active',
  add column if not exists paid_until timestamptz,
  add column if not exists prodamus_subscription_id text,
  add column if not exists prodamus_customer_id text,
  add column if not exists last_payment_at timestamptz,
  add column if not exists last_prodamus_event text,
  add column if not exists last_prodamus_payload jsonb,
  add column if not exists bot_renew_url text,
  add column if not exists session_version integer not null default 1;

create index if not exists profiles_access_status_idx on public.profiles (access_status);
create index if not exists profiles_subscription_status_idx on public.profiles (subscription_status);
create index if not exists profiles_paid_until_idx on public.profiles (paid_until);
create index if not exists profiles_prodamus_subscription_id_idx on public.profiles (prodamus_subscription_id);
create index if not exists profiles_prodamus_customer_id_idx on public.profiles (prodamus_customer_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_access_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_access_status_check
      check (access_status in ('active', 'paused_expired', 'paused_manual'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_subscription_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_subscription_status_check
      check (subscription_status in ('active', 'overdue', 'deactivated', 'finished'));
  end if;
end $$;

create table if not exists public.subscriptions (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'prodamus',
  provider_subscription_id text,
  status text not null default 'active',
  paid_until timestamptz,
  last_payment_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists subscriptions_provider_subscription_uidx
  on public.subscriptions (provider, provider_subscription_id)
  where provider_subscription_id is not null;

create index if not exists subscriptions_user_id_idx on public.subscriptions(user_id);
create index if not exists subscriptions_status_idx on public.subscriptions(status);

create table if not exists public.billing_webhook_logs (
  id bigserial primary key,
  provider text not null,
  event_name text,
  external_id text,
  payload_json jsonb not null,
  signature_valid boolean not null default false,
  is_processed boolean not null default false,
  error_text text,
  created_at timestamptz not null default now()
);

create unique index if not exists billing_webhook_logs_provider_external_uidx
  on public.billing_webhook_logs(provider, external_id)
  where external_id is not null;

create index if not exists billing_webhook_logs_provider_created_idx
  on public.billing_webhook_logs(provider, created_at desc);

-- Shared helper for strict access guard in RLS.
create or replace function public.has_platform_access(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = target_user
      and (
        p.role = 'admin'
        or coalesce(p.access_status, 'active') = 'active'
      )
  );
$$;

create or replace function public.touch_subscriptions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_subscriptions_updated_at on public.subscriptions;
create trigger trg_touch_subscriptions_updated_at
before update on public.subscriptions
for each row
execute function public.touch_subscriptions_updated_at();

-- Add restrictive policies so existing permissive policies remain intact
-- while access_status becomes mandatory.
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles',
    'meetings',
    'events',
    'goals',
    'knowledge_base',
    'practices',
    'clients',
    'scenarios',
    'course_progress',
    'messages',
    'news',
    'birthday_templates',
    'push_subscriptions'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);

      if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = t
          and policyname = t || '_active_access_guard_select'
      ) then
        execute format(
          'create policy %I on public.%I as restrictive for select to authenticated using (public.has_platform_access(auth.uid()))',
          t || '_active_access_guard_select',
          t
        );
      end if;

      if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = t
          and policyname = t || '_active_access_guard_write'
      ) then
        execute format(
          'create policy %I on public.%I as restrictive for all to authenticated using (public.has_platform_access(auth.uid())) with check (public.has_platform_access(auth.uid()))',
          t || '_active_access_guard_write',
          t
        );
      end if;
    end if;
  end loop;
end $$;
