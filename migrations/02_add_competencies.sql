-- Migration to add competency and detail columns to the profiles table
-- Run this in your Supabase SQL Editor

-- 1. Add 'skills' column (Array of text) for competencies
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS skills TEXT[] DEFAULT '{}';

-- 2. Add 'offer' column (Text) for "What I can help with"
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS offer TEXT DEFAULT '';

-- 3. Add 'unique_abilities' column (Text) for "Superpower"
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS unique_abilities TEXT DEFAULT '';

-- 4. Add 'join_date' if missing (Text or Date)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS join_date TEXT;

-- Optional: Update existing rows to have empty arrays instead of NULL if needed
UPDATE public.profiles SET skills = '{}' WHERE skills IS NULL;
