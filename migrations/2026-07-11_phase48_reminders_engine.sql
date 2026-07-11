-- phase48 — Движок напоминаний (общий: T-5 абитуриенты + будущий 1f биллинг T-7/3/1/0)
-- (phase46/47 заняты payment_orders / admin_payment_stats — этот номер свободен.)
-- Дизайн: docs/_session/2026-07-11_262 + финал 263.
-- Три вещи:
--   1. reminders_sent — единая таблица идемпотентности (kind, profile, threshold, cycle).
--   2. email_notifications_queue — очередь писем (продюсер push-server, консюмер garden-auth).
--   3. extend event_type CHECK на tg_notifications_queue (+access_reminder, +billing_reminder).
-- Идемпотентно: IF NOT EXISTS / DROP CONSTRAINT IF EXISTS. Безопасно гонять повторно.
-- Порядок выката: ЭТА миграция → garden-auth (email-воркер) → push-server (продюсер).

begin;

-- ── 1. Идемпотентность движка ──────────────────────────────────────────────
create table if not exists public.reminders_sent (
    kind         text        not null,             -- 'applicant_access' | 'billing'
    profile_id   uuid        not null references public.profiles(id) on delete cascade,
    threshold    text        not null,             -- '5' | '7' | '3' | '1' | '0'
    cycle_date   date        not null,             -- access_until ИЛИ paid_until::date — «цикл»
    channels     text[]      not null default '{}',-- какие каналы поставлены в очередь
    sent_at      timestamptz not null default now(),
    constraint uq_reminders_sent unique (kind, profile_id, threshold, cycle_date)
);
comment on table public.reminders_sent is
  'Идемпотентность движка напоминаний. Одна строка = один (kind,threshold,cycle) навсегда. '
  'INSERT ON CONFLICT DO NOTHING ПЕРЕД постановкой в очередь.';

-- ── 2. Очередь писем (зеркало tg_notifications_queue) ──────────────────────
create table if not exists public.email_notifications_queue (
    id                   uuid primary key default gen_random_uuid(),
    recipient_profile_id uuid references public.profiles(id) on delete cascade,
    recipient_email      text        not null,
    subject              text        not null,
    body_text            text        not null,
    body_html            text,                     -- HTML-версия (CTA-ссылка); NULL → только text
    dedup_key            text,
    scheduled_for        timestamptz not null default now(),
    sent_at              timestamptz,
    attempt_count        int         not null default 0,
    last_attempt_at      timestamptz,
    last_error           text,
    dead_letter_at       timestamptz,
    created_at           timestamptz not null default now()
);
create index if not exists idx_email_queue_pending
    on public.email_notifications_queue(scheduled_for)
    where sent_at is null and dead_letter_at is null;
create unique index if not exists uq_email_queue_dedup
    on public.email_notifications_queue(dedup_key)
    where dedup_key is not null and sent_at is null;
comment on table public.email_notifications_queue is
  'Очередь писем-напоминаний. Продюсер: push-server. Консюмер: garden-auth processEmailQueueBatch. '
  'PII в теле, поэтому authenticated не выдаём grant. Доступ только у владельца gen_user.';

-- ── 3. Расширить event_type CHECK на tg-очереди ────────────────────────────
-- Реальное текущее значение (сверено на проде 2026-07-11): 5 hw_/dm_ типов.
-- Сохраняем их 1:1 и добавляем access_reminder (T-5) + billing_reminder (под 1f).
alter table public.tg_notifications_queue
  drop constraint if exists tg_notifications_queue_event_type_check;
alter table public.tg_notifications_queue
  add  constraint tg_notifications_queue_event_type_check
  check (event_type in (
     'hw_submitted_new',
     'hw_submitted_revision',
     'hw_accepted',
     'hw_revision_requested',
     'dm_from_mentor',
     'access_reminder',      -- ← T-5 абитуриенты
     'billing_reminder'      -- ← задел под 1f
  ));

commit;
