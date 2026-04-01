-- Threaded dialogue for homework submissions (student <-> mentor).

create table if not exists submission_threads (
  id bigserial primary key,
  submission_id bigint not null references homework_submissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (submission_id)
);

create table if not exists submission_messages (
  id bigserial primary key,
  thread_id bigint not null references submission_threads(id) on delete cascade,
  author_user_id uuid not null references profiles(id) on delete cascade,
  author_role text not null,
  text_body text not null,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table submission_threads enable row level security;
alter table submission_messages enable row level security;

drop policy if exists submission_threads_read on submission_threads;
create policy submission_threads_read on submission_threads
for select using (
  exists (
    select 1
    from homework_submissions hs
    where hs.id = submission_threads.submission_id
      and hs.student_user_id = auth.uid()
  )
);

drop policy if exists submission_messages_read on submission_messages;
create policy submission_messages_read on submission_messages
for select using (
  exists (
    select 1
    from submission_threads st
    join homework_submissions hs on hs.id = st.submission_id
    where st.id = submission_messages.thread_id
      and hs.student_user_id = auth.uid()
  )
);
