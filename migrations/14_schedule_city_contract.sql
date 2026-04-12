-- Stabilize public schedule contract for new cities and online/offline filtering.
-- This migration adds explicit format and normalized city keys to meetings/events.

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS meeting_format text,
  ADD COLUMN IF NOT EXISTS city_key text,
  ADD COLUMN IF NOT EXISTS online_visibility text,
  ADD COLUMN IF NOT EXISTS day_date date,
  ADD COLUMN IF NOT EXISTS starts_at timestamptz;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS meeting_format text,
  ADD COLUMN IF NOT EXISTS city_key text,
  ADD COLUMN IF NOT EXISTS online_visibility text,
  ADD COLUMN IF NOT EXISTS day_date date,
  ADD COLUMN IF NOT EXISTS starts_at timestamptz;

ALTER TABLE public.meetings
  DROP CONSTRAINT IF EXISTS meetings_format_check;
ALTER TABLE public.meetings
  ADD CONSTRAINT meetings_format_check
  CHECK (meeting_format IS NULL OR meeting_format IN ('offline', 'online', 'hybrid'));

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_format_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_format_check
  CHECK (meeting_format IS NULL OR meeting_format IN ('offline', 'online', 'hybrid'));

ALTER TABLE public.meetings
  DROP CONSTRAINT IF EXISTS meetings_online_visibility_check;
ALTER TABLE public.meetings
  ADD CONSTRAINT meetings_online_visibility_check
  CHECK (online_visibility IS NULL OR online_visibility IN ('online_only', 'all_cities'));

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_online_visibility_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_online_visibility_check
  CHECK (online_visibility IS NULL OR online_visibility IN ('online_only', 'all_cities'));

CREATE OR REPLACE FUNCTION public.sync_meeting_to_event()
RETURNS trigger AS $$
DECLARE
    user_city TEXT;
    user_name TEXT;
    user_role TEXT;
    final_city TEXT;
    final_city_key TEXT;
    final_format TEXT;
    final_online_visibility TEXT;
    speaker_label TEXT;
    event_day DATE;
    event_starts_at TIMESTAMPTZ;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        DELETE FROM public.events WHERE garden_id = OLD.id;
        RETURN OLD;
    END IF;

    SELECT city, name, role INTO user_city, user_name, user_role
    FROM public.profiles
    WHERE id = NEW.user_id;

    final_format := CASE
        WHEN lower(COALESCE(NEW.meeting_format, '')) IN ('offline', 'online', 'hybrid')
            THEN lower(NEW.meeting_format)
        WHEN lower(COALESCE(NEW.city, '')) IN ('online', 'онлайн')
            THEN 'online'
        ELSE 'offline'
    END;

    final_city := CASE
        WHEN final_format = 'online' THEN 'Онлайн'
        ELSE COALESCE(NULLIF(NEW.city, ''), NULLIF(user_city, ''), '')
    END;

    final_city_key := CASE
        WHEN final_format = 'online' THEN 'online'
        ELSE regexp_replace(
            regexp_replace(lower(trim(COALESCE(final_city, ''))), '[^a-zа-я0-9]+', '-', 'g'),
            '(^-+|-+$)', '', 'g'
        )
    END;

    final_online_visibility := CASE
        WHEN final_format = 'online' AND lower(COALESCE(NEW.online_visibility, '')) = 'all_cities'
            THEN 'all_cities'
        WHEN final_format = 'online'
            THEN 'online_only'
        ELSE NULL
    END;

    speaker_label := COALESCE(NULLIF(user_name, ''), 'Ведущая');
    IF lower(COALESCE(user_role, '')) = 'intern' THEN
        speaker_label := speaker_label || ' (Стажер)';
    END IF;

    event_day := NEW.date::date;
    event_starts_at := (
        (NEW.date::date::text || ' ' || COALESCE(NULLIF(NEW.time, ''), '00:00'))::timestamp
        AT TIME ZONE COALESCE(NULLIF(NEW.timezone, ''), 'Europe/Moscow')
    );

    IF (NEW.is_public = true) THEN
        IF EXISTS (SELECT 1 FROM public.events WHERE garden_id = NEW.id) THEN
            UPDATE public.events
            SET
                date = to_char(event_day, 'DD.MM.YYYY'),
                day_date = event_day,
                starts_at = event_starts_at,
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
                city_key = final_city_key,
                meeting_format = final_format,
                online_visibility = final_online_visibility,
                speaker = speaker_label,
                category = 'Встреча'
            WHERE garden_id = NEW.id;
        ELSE
            INSERT INTO public.events (
                garden_id, date, day_date, starts_at, title, time, description,
                price, location, registration_link, image_url, image_focus_x, image_focus_y,
                city, city_key, meeting_format, online_visibility, speaker, category, image_gradient
            ) VALUES (
                NEW.id,
                to_char(event_day, 'DD.MM.YYYY'),
                event_day,
                event_starts_at,
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
                final_city_key,
                final_format,
                final_online_visibility,
                speaker_label,
                'Встреча',
                'linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 100%)'
            );
        END IF;
    ELSE
        DELETE FROM public.events WHERE garden_id = NEW.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

UPDATE public.meetings
SET
    meeting_format = CASE
        WHEN lower(COALESCE(city, '')) IN ('online', 'онлайн') THEN 'online'
        ELSE COALESCE(meeting_format, 'offline')
    END,
    city_key = CASE
        WHEN lower(COALESCE(city, '')) IN ('online', 'онлайн') THEN 'online'
        ELSE regexp_replace(
            regexp_replace(lower(trim(COALESCE(city, ''))), '[^a-zа-я0-9]+', '-', 'g'),
            '(^-+|-+$)', '', 'g'
        )
    END,
    online_visibility = CASE
        WHEN lower(COALESCE(city, '')) IN ('online', 'онлайн') THEN COALESCE(online_visibility, 'online_only')
        ELSE NULL
    END,
    day_date = date::date,
    starts_at = ((date::date::text || ' ' || COALESCE(NULLIF(time, ''), '00:00'))::timestamp
        AT TIME ZONE COALESCE(NULLIF(timezone, ''), 'Europe/Moscow'));

CREATE INDEX IF NOT EXISTS idx_events_city_key_day_date
  ON public.events (city_key, day_date);

CREATE INDEX IF NOT EXISTS idx_events_starts_at
  ON public.events (starts_at);
