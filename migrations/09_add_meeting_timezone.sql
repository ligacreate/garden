-- Add timezone column to meetings
ALTER TABLE public.meetings
ADD COLUMN IF NOT EXISTS timezone TEXT;
