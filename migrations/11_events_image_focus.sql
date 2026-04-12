-- Add image focus fields for meeting covers and sync them to events

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS image_focus_x integer DEFAULT 50,
  ADD COLUMN IF NOT EXISTS image_focus_y integer DEFAULT 50;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS image_focus_x integer DEFAULT 50,
  ADD COLUMN IF NOT EXISTS image_focus_y integer DEFAULT 50;

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
                image_focus_x = COALESCE(NEW.image_focus_x, 50),
                image_focus_y = COALESCE(NEW.image_focus_y, 50),
                city = final_city,
                speaker = COALESCE(user_name, 'Ведущая'),
                category = 'Встреча'
            WHERE garden_id = NEW.id;
        ELSE
            INSERT INTO public.events (
                garden_id, date, title, time, description,
                price, location, registration_link, image_url,
                image_focus_x, image_focus_y,
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
                COALESCE(NEW.image_focus_x, 50),
                COALESCE(NEW.image_focus_y, 50),
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
$$ LANGUAGE plpgsql;
