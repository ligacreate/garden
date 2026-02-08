-- Add telegram contact to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS telegram TEXT DEFAULT '';
