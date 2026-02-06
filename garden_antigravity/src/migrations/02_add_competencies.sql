-- Migration to add competency and detail columns to the profiles table
-- Run this in your Supabase SQL Editor

-- 1. Add 'directions' column (Array of text) for Competencies
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS directions TEXT[] DEFAULT '{}';

-- 2. Add 'skills' column (Array of text) - keeping for compatibility/future use
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS skills TEXT[] DEFAULT '{}';

-- 3. Add 'offer' column (Text) for "What I can help with"
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS offer TEXT DEFAULT '';

-- 4. Add 'unique_abilities' column (Text) for "Superpower"
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS unique_abilities TEXT DEFAULT '';

-- 5. Add 'join_date' if missing (Text or Date)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS join_date TEXT;

-- Optional: Update existing rows to have empty arrays instead of NULL if needed
UPDATE public.profiles SET directions = '{}' WHERE directions IS NULL;
UPDATE public.profiles SET skills = '{}' WHERE skills IS NULL;
