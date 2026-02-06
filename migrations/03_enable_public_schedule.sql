-- Migration to enable Public Schedule Sync
-- Run this in your Supabase SQL Editor

-- 1. Create 'events' table if it doesn't exist (Target Table for Schedule)
CREATE TABLE IF NOT EXISTS public.events (
  id SERIAL PRIMARY KEY,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  time TEXT NOT NULL,
  speaker TEXT NOT NULL,
  location TEXT NOT NULL,
  city TEXT NOT NULL,
  description TEXT NOT NULL,
  image_gradient TEXT NOT NULL,
  image_url TEXT,
  registration_link TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  price TEXT,  -- Added from subsequent migration
  garden_id BIGINT -- Link to meetings table
);

-- Enable RLS for events
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Add policies for events (if they don't exist)
DO $$
BEGIN
    -- Check and create policy for SELECT
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'events' AND policyname = 'Allow public read access to events'
    ) THEN
        CREATE POLICY "Allow public read access to events" ON public.events FOR SELECT USING (true);
    END IF;

    -- Check and create policy for INSERT
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'events' AND policyname = 'Allow insert events'
    ) THEN
        CREATE POLICY "Allow insert events" ON public.events FOR INSERT WITH CHECK (true);
    END IF;

    -- Check and create policy for UPDATE
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'events' AND policyname = 'Allow update events'
    ) THEN
        CREATE POLICY "Allow update events" ON public.events FOR UPDATE USING (true);
    END IF;

    -- Check and create policy for DELETE
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'events' AND policyname = 'Allow delete events'
    ) THEN
        CREATE POLICY "Allow delete events" ON public.events FOR DELETE USING (true);
    END IF;
END
$$;

-- 2. Add columns to 'meetings' table (Source of Truth)
ALTER TABLE public.meetings 
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS cost TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS address TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS city TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS payment_link TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS cover_image TEXT DEFAULT '';

-- 3. ensure garden_id exists (redundant check but good for safety if table existed before)
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS garden_id BIGINT;

-- 3. Create Sync Function
CREATE OR REPLACE FUNCTION public.sync_meeting_to_event()
RETURNS trigger AS $$
DECLARE
    user_city TEXT;
    user_name TEXT;
    final_city TEXT;
BEGIN
    -- Fetch user profile data for speaker and fallback city
    SELECT city, name INTO user_city, user_name
    FROM public.profiles
    WHERE id = NEW.user_id;

    -- Determine City: Meeting city > Profile city > 'Online'
    final_city := COALESCE(NULLIF(NEW.city, ''), NULLIF(user_city, ''), 'Online');
    
    -- If user explicitly typed "Online" in address or city, ensure consistency if desired, 
    -- but above logic handles the priority.

    -- If DELETE operation
    IF (TG_OP = 'DELETE') THEN
        DELETE FROM public.events WHERE garden_id = OLD.id;
        RETURN OLD;
    END IF;

    -- If INSERT or UPDATE
    IF (NEW.is_public = true) THEN
        -- Upsert into events
        IF EXISTS (SELECT 1 FROM public.events WHERE garden_id = NEW.id) THEN
            UPDATE public.events
            SET
                date = to_char(NEW.date::date, 'DD.MM.YYYY'),
                title = COALESCE(NEW.title, 'Без названия'),
                time = NEW.time,
                description = COALESCE(NEW.description, ''),
                price = NEW.cost,
                location = NEW.address,
                registration_link = NEW.payment_link,
                image_url = NEW.cover_image,
                city = final_city,
                speaker = COALESCE(user_name, 'Ведущая'),
                category = 'Встреча'
            WHERE garden_id = NEW.id;
        ELSE
            INSERT INTO public.events (
                garden_id, date, title, time, description,
                price, location, registration_link, image_url,
                city, speaker, category, image_gradient
            ) VALUES (
                NEW.id,
                to_char(NEW.date::date, 'DD.MM.YYYY'),
                COALESCE(NEW.title, 'Без названия'),
                NEW.time,
                COALESCE(NEW.description, ''),
                NEW.cost,
                NEW.address,
                NEW.payment_link,
                NEW.cover_image,
                final_city,
                COALESCE(user_name, 'Ведущая'),
                'Встреча',
                'linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 100%)'
            );
        END IF;
    ELSE
        -- If is_public is false, ensure it's removed from events
        DELETE FROM public.events WHERE garden_id = NEW.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create Trigger
DROP TRIGGER IF EXISTS on_meeting_change_sync_event ON public.meetings;

CREATE TRIGGER on_meeting_change_sync_event
AFTER INSERT OR UPDATE OR DELETE ON public.meetings
FOR EACH ROW EXECUTE FUNCTION public.sync_meeting_to_event();
