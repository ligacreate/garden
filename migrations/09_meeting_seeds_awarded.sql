-- Prevent duplicate seed awards for completed meetings
alter table public.meetings
add column if not exists seeds_awarded boolean default false;
