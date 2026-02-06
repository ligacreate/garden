-- Trigger to automatically create a public profile when a new user signs up via Supabase Auth.
-- This ensures the user appears in the public.profiles table even if they haven't confirmed email yet.

-- 1. Create the Function
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role, city, avatar_url, tree, tree_desc, seeds)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'name',
    COALESCE(new.raw_user_meta_data->>'role', 'applicant'),
    new.raw_user_meta_data->>'city',
    new.raw_user_meta_data->>'avatar_url',
    new.raw_user_meta_data->>'tree',
    new.raw_user_meta_data->>'tree_desc',
    COALESCE((new.raw_user_meta_data->>'seeds')::int, 0)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create the Trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 3. Run this ONCE to fix missing profiles (Backfill)
INSERT INTO public.profiles (id, email, name, role, city, avatar_url, tree, tree_desc, seeds)
SELECT 
  id, 
  email, 
  raw_user_meta_data->>'name', 
  COALESCE(raw_user_meta_data->>'role', 'applicant'),
  raw_user_meta_data->>'city', 
  raw_user_meta_data->>'avatar_url', 
  raw_user_meta_data->>'tree', 
  raw_user_meta_data->>'tree_desc', 
  COALESCE((raw_user_meta_data->>'seeds')::int, 0)
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles);
