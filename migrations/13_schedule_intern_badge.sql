-- Add "Стажер" marker to public schedule speaker labels
-- Run in SQL editor for the current DB.

CREATE OR REPLACE FUNCTION public.sync_meeting_to_event()
RETURNS trigger AS $$
DECLARE
    user_city TEXT;
    user_name TEXT;
    user_role TEXT;
    final_city TEXT;
    speaker_label TEXT;
BEGIN
    -- Handle deletes first (NEW is not available in DELETE trigger context).
    IF (TG_OP = 'DELETE') THEN
        DELETE FROM public.events WHERE garden_id = OLD.id;
        RETURN OLD;
    END IF;

    -- Fetch user profile data for speaker and fallback city
    SELECT city, name, role INTO user_city, user_name, user_role
    FROM public.profiles
    WHERE id = NEW.user_id;

    -- Determine City: Meeting city > Profile city > 'Online'
    final_city := COALESCE(NULLIF(NEW.city, ''), NULLIF(user_city, ''), 'Online');

    -- Build speaker label with intern marker
    speaker_label := COALESCE(NULLIF(user_name, ''), 'Ведущая');
    IF lower(COALESCE(user_role, '')) = 'intern' THEN
        speaker_label := speaker_label || ' (Стажер)';
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
                speaker = speaker_label,
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
                speaker_label,
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

-- Backfill existing public meetings in events with intern marker
UPDATE public.events e
SET speaker = CASE
    WHEN lower(COALESCE(p.role, '')) = 'intern'
        THEN COALESCE(NULLIF(p.name, ''), 'Ведущая') || ' (Стажер)'
    ELSE COALESCE(NULLIF(p.name, ''), 'Ведущая')
END
FROM public.meetings m
LEFT JOIN public.profiles p ON p.id = m.user_id
WHERE e.garden_id = m.id
  AND e.category = 'Встреча';
