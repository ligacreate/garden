-- Extend practices with optional structured fields for cards and reflection.

ALTER TABLE IF EXISTS public.practices
  ADD COLUMN IF NOT EXISTS duration_minutes integer,
  ADD COLUMN IF NOT EXISTS short_goal text,
  ADD COLUMN IF NOT EXISTS instruction_short text,
  ADD COLUMN IF NOT EXISTS instruction_full text,
  ADD COLUMN IF NOT EXISTS reflection_questions text;
