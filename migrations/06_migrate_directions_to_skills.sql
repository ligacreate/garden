-- Migrate directions -> skills (one-time)
-- Safe re-run: only fills skills when empty and directions has data

update public.profiles
set skills = directions
where (skills is null or array_length(skills, 1) is null or array_length(skills, 1) = 0)
  and directions is not null
  and array_length(directions, 1) > 0;
