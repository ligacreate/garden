-- migrations/2026-06-15_phase44_event_cohosts_sync.sql
--
-- ANOM-003 fix — sync meetings.co_hosts (uuid[]) → events.co_hosts (text).
--
-- Контекст:
--   Триггер sync_meeting_to_event() (phase22) зеркалит meeting в events,
--   но co_hosts не переносит → публичный Meetings-фронт никогда не
--   показывает со-ведущих (events.co_hosts = NULL у всех 179 строк).
--   См. plans/BACKLOG.md ANOM-003, docs/RECON_2026-05-26_anom003_cohosts_fix.md.
--
-- Контракт (1 транзакция):
--   PART 1. CREATE OR REPLACE sync_meeting_to_event() — добавить
--           cohosts_label (uuid[]→имена через profiles) в UPDATE+INSERT.
--           Вся остальная логика phase22 без изменений.
--   PART 2. Backfill events.co_hosts из meetings.co_hosts.
--   PART 3. SELECT public.ensure_garden_grants();  (RUNBOOK §1.3)
--   PART 4. NOTIFY pgrst, 'reload schema'.
--
-- Не трогает: схему (events.co_hosts text уже существует), RLS, GRANT'ы
--   (кроме safety-net), resync-триггеры profiles.
--
-- Apply: scp + psql, \set ON_ERROR_STOP on, \i этот файл.

\set ON_ERROR_STOP on

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- PART 1: sync_meeting_to_event() + cohosts_label
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_meeting_to_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_city TEXT;
    user_name TEXT;
    user_role TEXT;
    user_status TEXT;
    user_telegram TEXT;
    user_vk TEXT;
    final_city TEXT;
    final_city_key TEXT;
    final_format TEXT;
    final_online_visibility TEXT;
    speaker_label TEXT;
    cohosts_label TEXT;          -- ★ phase44
    event_day DATE;
    event_starts_at TIMESTAMPTZ;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        DELETE FROM public.events WHERE garden_id = OLD.id;
        RETURN OLD;
    END IF;

    SELECT city, name, role, COALESCE(status, 'active'),
           COALESCE(telegram, ''), COALESCE(vk, '')
      INTO user_city, user_name, user_role, user_status,
           user_telegram, user_vk
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

    -- ★ phase44: co_hosts (uuid[]) → "Имя1, Имя2" в порядке массива.
    SELECT string_agg(trim(p.name), ', ' ORDER BY ch.ord)
      INTO cohosts_label
    FROM unnest(COALESCE(NEW.co_hosts, '{}'::uuid[])) WITH ORDINALITY AS ch(uid, ord)
    JOIN public.profiles p ON p.id = ch.uid
    WHERE COALESCE(trim(p.name), '') <> '';
    cohosts_label := COALESCE(cohosts_label, '');

    event_day := NEW.date::date;
    event_starts_at := (
        (NEW.date::date::text || ' ' || COALESCE(NULLIF(NEW.time, ''), '00:00'))::timestamp
        AT TIME ZONE COALESCE(NULLIF(NEW.timezone, ''), 'Europe/Moscow')
    );

    IF (NEW.is_public = true AND user_status = 'active') THEN
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
                category = 'Встреча',
                host_telegram = user_telegram,
                host_vk       = user_vk,
                co_hosts      = cohosts_label    -- ★ phase44
            WHERE garden_id = NEW.id;
        ELSE
            INSERT INTO public.events (
                garden_id, date, day_date, starts_at, title, time, description,
                price, location, registration_link, image_url, image_focus_x, image_focus_y,
                city, city_key, meeting_format, online_visibility, speaker, category, image_gradient,
                host_telegram, host_vk,
                co_hosts     -- ★ phase44
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
                'linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 100%)',
                user_telegram,
                user_vk,
                cohosts_label            -- ★ phase44
            );
        END IF;
    ELSE
        DELETE FROM public.events WHERE garden_id = NEW.id;
    END IF;

    RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- PART 2: backfill events.co_hosts
-- ─────────────────────────────────────────────────────────────────────
UPDATE public.events e
SET co_hosts = COALESCE((
        SELECT string_agg(trim(p.name), ', ' ORDER BY ch.ord)
        FROM unnest(COALESCE(m.co_hosts, '{}'::uuid[])) WITH ORDINALITY AS ch(uid, ord)
        JOIN public.profiles p ON p.id = ch.uid
        WHERE COALESCE(trim(p.name), '') <> ''
    ), '')
FROM public.meetings m
WHERE e.garden_id = m.id;

-- ─────────────────────────────────────────────────────────────────────
-- PART 3: Timeweb GRANT safety-net (RUNBOOK §1.3)
-- ─────────────────────────────────────────────────────────────────────
SELECT public.ensure_garden_grants();

-- ─────────────────────────────────────────────────────────────────────
-- PART 4: PostgREST schema cache reload
-- ─────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- VERIFY (вне транзакции)
-- ─────────────────────────────────────────────────────────────────────

\echo === V1: триггер теперь пишет co_hosts ===
SELECT pg_get_functiondef('public.sync_meeting_to_event()'::regprocedure) ~ 'cohosts_label' AS has_cohosts_logic,
       prosecdef AS is_definer
FROM pg_proc WHERE proname='sync_meeting_to_event';
-- ожидание: t, t

\echo === V2: backfill — events.co_hosts непустых ===
SELECT count(*) FILTER (WHERE COALESCE(co_hosts,'') <> '') AS events_with_cohosts,
       count(*) AS events_total
FROM public.events;
-- факт после применения: events_with_cohosts = 11.
-- (recon оценивал 20 — это число meetings с co_hosts; но event есть только у
--  11 из них, остальные 9 приватны/без публичного event-строки.)

\echo === V3: probe — встреча 341 / event 435 ===
SELECT e.garden_id, e.speaker, e.co_hosts
FROM public.events e WHERE e.garden_id = 341;
-- ожидание: co_hosts = 'Елена Федотова, Мария Романова'
