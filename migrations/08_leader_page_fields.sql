-- Add leader page fields to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS leader_about TEXT DEFAULT '';

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS leader_signature TEXT DEFAULT '';

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS leader_reviews JSONB DEFAULT '[]'::jsonb;
