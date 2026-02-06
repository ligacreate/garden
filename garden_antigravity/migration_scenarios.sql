-- Create scenarios table
create table if not exists scenarios (
  id bigint primary key generated always as identity,
  user_id uuid references auth.users not null,
  title text not null,
  timeline jsonb not null default '[]'::jsonb,
  is_public boolean default false,
  author_name text,
  created_at timestamptz default now()
);

-- Enable RLS
alter table scenarios enable row level security;

-- Policies

-- Select: Users can see their own scenarios OR any public scenarios
create policy "Users can view own or public scenarios"
  on scenarios for select
  using ( auth.uid() = user_id OR is_public = true );

-- Insert: Users can create scenarios assigned to themselves
create policy "Users can insert own scenarios"
  on scenarios for insert
  with check ( auth.uid() = user_id );

-- Update: Users can update only their own scenarios
create policy "Users can update own scenarios"
  on scenarios for update
  using ( auth.uid() = user_id );

-- Delete: Users can delete only their own scenarios
create policy "Users can delete own scenarios"
  on scenarios for delete
  using ( auth.uid() = user_id );
