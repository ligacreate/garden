-- Add join_date column to profiles table if it doesn't exist
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'join_date') then
    alter table profiles add column join_date date;
  end if;
end $$;
