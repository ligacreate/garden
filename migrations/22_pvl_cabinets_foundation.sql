-- Foundation schema for student/mentor/teachers cabinets and role-aware course data.

create table if not exists roles (
  id bigserial primary key,
  code text unique not null,
  title text not null
);

create table if not exists profiles_ext (
  user_id uuid primary key references profiles(id) on delete cascade,
  role_code text not null default 'applicant',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists applicant_profiles (
  user_id uuid primary key references profiles(id) on delete cascade,
  public_bio text,
  target_stream text,
  created_at timestamptz not null default now()
);

create table if not exists student_profiles (
  user_id uuid primary key references profiles(id) on delete cascade,
  course_stream_id bigint,
  mentor_user_id uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists mentor_profiles (
  user_id uuid primary key references profiles(id) on delete cascade,
  about text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists course_programs (
  id bigserial primary key,
  code text unique not null,
  title text not null,
  created_at timestamptz not null default now()
);

create table if not exists course_streams (
  id bigserial primary key,
  program_id bigint not null references course_programs(id) on delete cascade,
  title text not null,
  starts_at date,
  ends_at date,
  created_at timestamptz not null default now()
);

alter table student_profiles
  add constraint student_profiles_stream_fk
  foreign key (course_stream_id) references course_streams(id) on delete set null;

create table if not exists course_sections (
  id bigserial primary key,
  stream_id bigint not null references course_streams(id) on delete cascade,
  title text not null,
  order_index int not null default 0
);

create table if not exists course_lessons (
  id bigserial primary key,
  section_id bigint not null references course_sections(id) on delete cascade,
  title text not null,
  release_at timestamptz,
  deadline_at timestamptz,
  order_index int not null default 0,
  status text not null default 'draft'
);

create table if not exists material_types (
  id bigserial primary key,
  code text unique not null,
  title text not null
);

create table if not exists material_tags (
  id bigserial primary key,
  code text unique not null,
  title text not null
);

create table if not exists course_materials (
  id bigserial primary key,
  stream_id bigint not null references course_streams(id) on delete cascade,
  lesson_id bigint references course_lessons(id) on delete set null,
  title text not null,
  description text,
  material_type_id bigint references material_types(id) on delete set null,
  video_url text,
  video_provider text,
  video_title text,
  preview_image text,
  embed_code text,
  file_url text,
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists material_tag_relations (
  material_id bigint not null references course_materials(id) on delete cascade,
  tag_id bigint not null references material_tags(id) on delete cascade,
  primary key (material_id, tag_id)
);

create table if not exists material_progress (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  material_id bigint not null references course_materials(id) on delete cascade,
  completed boolean not null default false,
  completed_at timestamptz,
  unique (user_id, material_id)
);

create table if not exists homework_items (
  id bigserial primary key,
  stream_id bigint not null references course_streams(id) on delete cascade,
  lesson_id bigint references course_lessons(id) on delete set null,
  title text not null,
  deadline_at timestamptz,
  is_control_point boolean not null default false
);

create table if not exists homework_submissions (
  id bigserial primary key,
  homework_item_id bigint not null references homework_items(id) on delete cascade,
  student_user_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'к проверке',
  submitted_at timestamptz,
  final_score int,
  unique (homework_item_id, student_user_id)
);

create table if not exists homework_submission_files (
  id bigserial primary key,
  submission_id bigint not null references homework_submissions(id) on delete cascade,
  file_url text not null,
  file_name text not null,
  uploaded_at timestamptz not null default now()
);

create table if not exists homework_status_history (
  id bigserial primary key,
  submission_id bigint not null references homework_submissions(id) on delete cascade,
  previous_status text,
  next_status text not null,
  changed_by uuid references profiles(id),
  changed_at timestamptz not null default now()
);

create table if not exists mentor_comments (
  id bigserial primary key,
  submission_id bigint not null references homework_submissions(id) on delete cascade,
  mentor_user_id uuid not null references profiles(id) on delete cascade,
  comment_text text not null,
  created_at timestamptz not null default now()
);

create table if not exists event_types (
  id bigserial primary key,
  code text unique not null,
  title text not null,
  color text
);

create table if not exists calendar_events (
  id bigserial primary key,
  stream_id bigint references course_streams(id) on delete cascade,
  event_type_id bigint references event_types(id) on delete set null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  source text not null default 'manual',
  created_at timestamptz not null default now()
);

create table if not exists course_deadlines (
  id bigserial primary key,
  stream_id bigint not null references course_streams(id) on delete cascade,
  title text not null,
  due_at timestamptz not null,
  target_type text,
  target_id text
);

create table if not exists user_course_access (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  stream_id bigint not null references course_streams(id) on delete cascade,
  role_code text not null,
  is_active boolean not null default true,
  unique (user_id, stream_id, role_code)
);

create table if not exists visibility_rules (
  id bigserial primary key,
  entity_type text not null,
  entity_id text not null,
  role_code text not null,
  is_visible boolean not null default true,
  unique (entity_type, entity_id, role_code)
);

insert into roles(code, title) values
  ('admin', 'Админ'),
  ('student', 'Ученица'),
  ('mentor', 'Ментор'),
  ('applicant', 'Абитуриент')
on conflict (code) do nothing;

insert into material_types(code, title) values
  ('video', 'Видео'),
  ('article', 'Статья'),
  ('pdf', 'PDF'),
  ('checklist', 'Чек-лист'),
  ('instruction', 'Инструкция')
on conflict (code) do nothing;

insert into material_tags(code, title) values
  ('video', 'Видео'),
  ('article', 'Статья'),
  ('pdf', 'PDF'),
  ('checklist', 'Чек-лист'),
  ('instruction', 'Инструкция')
on conflict (code) do nothing;

alter table course_materials enable row level security;
alter table homework_submissions enable row level security;
alter table mentor_comments enable row level security;
alter table calendar_events enable row level security;

drop policy if exists course_materials_read on course_materials;
create policy course_materials_read on course_materials
for select using (is_published = true);

drop policy if exists homework_submissions_student_own on homework_submissions;
create policy homework_submissions_student_own on homework_submissions
for select using (student_user_id = auth.uid());

drop policy if exists mentor_comments_read on mentor_comments;
create policy mentor_comments_read on mentor_comments
for select using (
  exists (
    select 1
    from homework_submissions hs
    where hs.id = mentor_comments.submission_id
      and hs.student_user_id = auth.uid()
  )
);

drop policy if exists calendar_events_read on calendar_events;
create policy calendar_events_read on calendar_events
for select using (true);
