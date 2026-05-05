-- migrations/2026-05-05_phase22_vk_field_and_event_contacts.sql
--
-- FEAT-002 этап 2 — денормализация контактов ведущей в events.
--
-- Контекст:
--   FEAT-002 добавляет в публичный Meetings (meetings.skrebeyko.ru)
--   две кнопки контакта на карточке встречи: 💬 Telegram (всегда) и
--   🔵 ВКонтакте (если у ведущей заполнен vk).
--
--   Архитектурное решение (см. сессию стратега 2026-05-05):
--   Вариант A — денормализация контактов в events (host_telegram,
--   host_vk). Альтернатива (B — view + GRANT TO web_anon на whitelist
--   полей profiles) отвергнута, т.к. противоречит модели «profiles
--   закрыт от анонимов» (SEC-001 принципы).
--
-- Контракт миграции (6 частей в одной транзакции):
--   PART 1. ALTER TABLE profiles ADD COLUMN vk text DEFAULT ''
--           (опциональное поле, симметрично telegram).
--
--   PART 2. ALTER TABLE events ADD COLUMN host_telegram text DEFAULT ''
--           ADD COLUMN host_vk text DEFAULT ''
--           (денормализация для anon-чтения из meetings-фронта).
--
--   PART 3. CREATE OR REPLACE FUNCTION sync_meeting_to_event() —
--           расширить SELECT (читать profiles.telegram, profiles.vk)
--           и INSERT/UPDATE events (писать host_telegram, host_vk).
--           Структура phase 21 сохраняется: SECURITY DEFINER +
--           search_path=public + проверка status='active'.
--
--   PART 4. CREATE FUNCTION trg_profiles_contacts_resync_events() +
--           CREATE TRIGGER on_profile_contacts_change_resync_events
--           AFTER UPDATE OF telegram, vk ON profiles → вызов
--           resync_events_for_user(NEW.id) при изменении.
--           Существующий trigger on_profile_status_change_resync_events
--           НЕ трогаем (phase 21 — отдельный механизм для status).
--
--   PART 5. Backfill — UPDATE events SET host_telegram, host_vk через
--           JOIN на meetings.user_id → profiles. Покрывает все
--           события с привязкой к meeting (на момент apply
--           2026-05-05 — 149 из 158; 9 events без meeting остаются
--           с дефолтным '').
--
--   PART 6. NOTIFY pgrst, 'reload schema'.
--
-- Не трогает:
--   - profiles.telegram (уже text DEFAULT '', NOT NULL CHECK
--     откладываем в отдельную миграцию после CLEAN-013).
--   - events RLS-policies (USING(true) для всех CRUD — это SEC-013,
--     отдельная задача).
--   - resync_events_for_user(uuid) — текущая реализация phase 21
--     (DELETE + no-op UPDATE re-fire) работает корректно для нового
--     случая «изменился telegram/vk»: trigger sync_meeting_to_event
--     при re-fire прочитает свежие значения.
--   - Frontend (поле vk в форме profile + автонормализация — этап 3).
--   - Meetings-фронт (две кнопки — этап 4, отдельный репо).
--
-- Связанные документы:
--   plans/BACKLOG.md — FEAT-002
--   docs/RECON_2026-05-04_feat002_data_hygiene.md
--   docs/RECON_2026-05-04_feat002_telegram_match.md
--   migrations/14_schedule_city_contract.sql (исходный sync_meeting_to_event)
--   migrations/2026-05-04_phase19_revert_events_revoke_plus_trigger_definer.sql (DEFINER)
--   migrations/2026-05-04_phase21_pause_hides_events.sql (status check + resync_events_for_user)
--
-- Apply: scp + psql под gen_user, \set ON_ERROR_STOP on, \i этот файл.

\set ON_ERROR_STOP on

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- PART 1: profiles.vk
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS vk text DEFAULT '';

-- ─────────────────────────────────────────────────────────────────────
-- PART 2: events.host_telegram + events.host_vk
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS host_telegram text DEFAULT '',
    ADD COLUMN IF NOT EXISTS host_vk       text DEFAULT '';

-- ─────────────────────────────────────────────────────────────────────
-- PART 3: расширение sync_meeting_to_event
-- ─────────────────────────────────────────────────────────────────────
-- Дельта от phase 21:
--   - SELECT добавляет telegram, vk → user_telegram, user_vk
--   - INSERT/UPDATE events добавляют host_telegram, host_vk
--   - Остальная логика (status='active' check, geometry, speaker_label,
--     time/timezone, DELETE-ветка, SECURITY DEFINER) — без изменений.

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

    event_day := NEW.date::date;
    event_starts_at := (
        (NEW.date::date::text || ' ' || COALESCE(NULLIF(NEW.time, ''), '00:00'))::timestamp
        AT TIME ZONE COALESCE(NULLIF(NEW.timezone, ''), 'Europe/Moscow')
    );

    -- Зеркалим в events ТОЛЬКО если ведущая активна (phase 21).
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
                host_telegram = user_telegram,    -- ★ phase 22
                host_vk       = user_vk           -- ★ phase 22
            WHERE garden_id = NEW.id;
        ELSE
            INSERT INTO public.events (
                garden_id, date, day_date, starts_at, title, time, description,
                price, location, registration_link, image_url, image_focus_x, image_focus_y,
                city, city_key, meeting_format, online_visibility, speaker, category, image_gradient,
                host_telegram, host_vk     -- ★ phase 22
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
                user_telegram,             -- ★ phase 22
                user_vk                    -- ★ phase 22
            );
        END IF;
    ELSE
        DELETE FROM public.events WHERE garden_id = NEW.id;
    END IF;

    RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- PART 4: триггер на profiles AFTER UPDATE OF telegram, vk
-- ─────────────────────────────────────────────────────────────────────
-- Использует уже существующую resync_events_for_user(uuid) — она
-- DELETE'ает зеркала и re-fire'ит trigger sync_meeting_to_event
-- через no-op UPDATE meetings; новый sync_meeting_to_event прочтёт
-- свежие telegram/vk из profiles.
--
-- Существующий trigger on_profile_status_change_resync_events
-- (phase 21, AFTER UPDATE OF status) — не трогаем.

CREATE OR REPLACE FUNCTION public.trg_profiles_contacts_resync_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.resync_events_for_user(NEW.id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_contacts_change_resync_events ON public.profiles;
CREATE TRIGGER on_profile_contacts_change_resync_events
    AFTER UPDATE OF telegram, vk ON public.profiles
    FOR EACH ROW
    WHEN (
        OLD.telegram IS DISTINCT FROM NEW.telegram
        OR OLD.vk IS DISTINCT FROM NEW.vk
    )
    EXECUTE FUNCTION public.trg_profiles_contacts_resync_events();

-- ─────────────────────────────────────────────────────────────────────
-- PART 5: backfill events.host_telegram + host_vk
-- ─────────────────────────────────────────────────────────────────────
-- Заполняем все events с привязкой к meeting (на момент apply
-- 2026-05-05 — 149 из 158). Для events без meeting (legacy/
-- гостевые, на момент apply — 9 шт) host_telegram/host_vk
-- остаются дефолтными ''.

UPDATE public.events e
SET
    host_telegram = COALESCE(p.telegram, ''),
    host_vk       = COALESCE(p.vk, '')
FROM public.meetings m
JOIN public.profiles p ON p.id = m.user_id
WHERE e.garden_id = m.id;

-- ─────────────────────────────────────────────────────────────────────
-- PART 6: PostgREST schema cache reload
-- ─────────────────────────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- VERIFY (вне транзакции)
-- ─────────────────────────────────────────────────────────────────────

\echo === V1: profiles.vk создан, text DEFAULT '' ===
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='profiles' AND column_name='vk';
-- ожидание: 1 строка, data_type=text, column_default=''::text

\echo === V2: events.host_telegram + host_vk созданы ===
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='events'
  AND column_name IN ('host_telegram','host_vk')
ORDER BY column_name;
-- ожидание: 2 строки, обе text DEFAULT ''

\echo === V3: backfill — events с непустым host_telegram (ожидание = events с meeting; на момент apply 2026-05-05 ~149) ===
SELECT
  count(*)                                          AS events_total,
  count(*) FILTER (WHERE host_telegram <> '')       AS events_with_host_tg,
  count(*) FILTER (WHERE host_vk <> '')             AS events_with_host_vk,
  count(*) FILTER (WHERE garden_id IS NOT NULL)     AS events_with_meeting
FROM public.events;
-- ожидание: events_with_host_tg == events_with_meeting (инвариант)
-- events_with_host_vk = 0 (vk у всех профилей сейчас '', UI-backfill после)

\echo === V4: sync_meeting_to_event теперь читает telegram, vk и пишет host_* ===
SELECT
  pg_get_functiondef('public.sync_meeting_to_event()'::regprocedure)
    ~ 'user_telegram'  AS reads_telegram,
  pg_get_functiondef('public.sync_meeting_to_event()'::regprocedure)
    ~ 'user_vk'        AS reads_vk,
  pg_get_functiondef('public.sync_meeting_to_event()'::regprocedure)
    ~ 'host_telegram'  AS writes_host_tg,
  pg_get_functiondef('public.sync_meeting_to_event()'::regprocedure)
    ~ 'host_vk'        AS writes_host_vk,
  prosecdef AS is_definer
FROM pg_proc
WHERE proname='sync_meeting_to_event';
-- ожидание: все t

\echo === V5: новый trigger on_profile_contacts_change_resync_events живёт ===
SELECT t.tgname,
       p.proname AS function_name,
       p.prosecdef AS is_definer,
       pg_get_triggerdef(t.oid) AS trigger_def
FROM pg_trigger t
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE t.tgrelid='public.profiles'::regclass
  AND NOT t.tgisinternal
ORDER BY t.tgname;
-- ожидание: 2 trigger'а на profiles (status — phase 21, contacts — phase 22)

\echo === V6: smoke — изменение telegram у одного active профиля синкает host_telegram ===
\echo (read-only check, без UPDATE, через сравнение текущих значений)
SELECT
  p.name,
  p.telegram                              AS profile_telegram,
  e.host_telegram                         AS event_host_telegram,
  p.telegram = e.host_telegram            AS in_sync
FROM public.profiles p
JOIN public.meetings m ON m.user_id = p.id
JOIN public.events  e ON e.garden_id = m.id
WHERE p.status='active'
ORDER BY p.name
LIMIT 5;
-- ожидание: in_sync=t для всех 5 строк
