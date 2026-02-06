-- SQL Migration to add 'seeds' column to profiles table

-- 1. Add the seeds column if it doesn't exist
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS seeds INTEGER DEFAULT 0;

-- 2. (Optional) If you want to sync existing metadata seeds to this column, 
-- you would typically need a script or manual update, as SQL doesn't access auth.users metadata directly easily.
-- For now, this column will simplify future queries.

-- 3. Grant permissions if necessary (usually authenticated users have access, but good to double check policies)
-- This assumes standard RLS policies are in place.
