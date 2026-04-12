-- Add meeting duration in minutes
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS duration integer;
