-- migrations/2026-05-04_phase21_pause_hides_events.sql
--
-- FEAT-013 — пауза ведущей скрывает её встречи в публичном Meetings.
--
-- Контекст:
--   Когда админ ставит ведущую на паузу (profiles.status = 'suspended'),
--   её meetings продолжают зеркалиться в public.events через trigger
--   sync_meeting_to_event и видны в публичном приложении Meetings
--   (meetings.skrebeyko.ru). Требование: при паузе зеркала исчезают,
--   при возврате на 'active' — восстанавливаются. Сами meetings не
--   модифицируются и при возврате остаются в том же виде.
--
-- Разведка (recon v2 на проде, 2026-05-04):
--   - profiles.access_status НЕ существует (миграция 21 не применена).
--   - Реально работает profiles.status: 'active' (57) / 'suspended' (2),
--     default 'active', nullable=YES, без CHECK-constraint.
--   - has_platform_access() и таблиц subscriptions/billing_webhook_logs нет.
--   - RESTRICTIVE-policies миграции 21 не существуют.
--   - Триггеров на profiles нет — phase 21 встаёт на чистом месте.
--   - Sanity на проде: 0 рассинхронизированных active-meetings.
--   - Зомби-зеркал: 12 шт у одной suspended-ведущей (Елена Мельникова,
--     id=3a61da26-8576-4ffe-b982-5c15442d2cd8) — нужен одноразовый cleanup.
--
-- Решение (Путь A, см. docs/DECISION_2026-05-04_pause_hides_meetings.md):
--   Строимся на текущем поле profiles.status, не на access_status.
--   Семантика: зеркало пишется в events ТОЛЬКО если is_public=true И
--   у владельца status IS NOT 'suspended' (т.е. 'active' или NULL=default).
--
-- Контракт миграции (4 части в одной транзакции):
--   1. CREATE OR REPLACE FUNCTION sync_meeting_to_event() — переписать
--      условие копирования: добавить чтение profiles.status владельца,
--      ELSE-ветка (DELETE) теперь покрывает is_public=false ИЛИ
--      owner.status='suspended'. SECURITY DEFINER + search_path=public
--      сохраняются (унаследовано от phase 19).
--
--   2. CREATE FUNCTION resync_events_for_user(uuid) — пересчёт зеркал
--      для всех meetings одного юзера: DELETE всех зеркал юзера,
--      затем при status='active' — UPDATE meetings (no-op SET id=id) для
--      re-fire trigger sync_meeting_to_event, который пройдёт по
--      INSERT-ветке (после DELETE строк в events нет → INSERT branch).
--      SECURITY DEFINER + search_path=public.
--
--   3. CREATE FUNCTION + TRIGGER на profiles AFTER UPDATE OF status —
--      WHEN (OLD.status IS DISTINCT FROM NEW.status) → вызывает
--      resync_events_for_user(NEW.id). SECURITY DEFINER + search_path.
--
--   4. Одноразовый cleanup 12 зомби-зеркал (suspended-ведущие).
--
--   5. NOTIFY pgrst, 'reload schema'.
--
-- Не трогает:
--   - Таблицу public.meetings (данные ведущей сохраняются).
--   - public.events RLS-policies (отдельная задача — phase 20, см. backlog).
--   - profiles.access_status / billing — отдельная задача (миграция 21).
--   - Frontend (services/dataService.js:toggleUserStatus пишет в
--     несуществующее поле access_status — отдельный таск
--     BUG-TOGGLE-USER-STATUS-GHOST-COLUMN).
--
-- Связанные документы:
--   docs/REPORT_2026-05-04_pause_hides_meetings_recon.md
--   docs/DECISION_2026-05-04_pause_hides_meetings.md
--   plans/BACKLOG.md — FEAT-013
--   migrations/14_schedule_city_contract.sql (исходная функция)
--   migrations/2026-05-04_phase19_revert_events_revoke_plus_trigger_definer.sql (DEFINER + search_path)
--
-- Apply: scp + psql под gen_user, \set ON_ERROR_STOP on, \i этот файл.
-- Verify-блок ниже исполнится после COMMIT.

\set ON_ERROR_STOP on

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- PART 1: sync_meeting_to_event() — добавить проверку profiles.status
-- ─────────────────────────────────────────────────────────────────────
-- ВАЖНО: тело идентично migrations/14_schedule_city_contract.sql:42-162,
-- единственная смысловая правка — условие копирования (строки IF/ELSE
-- в самом конце). DEFINER+search_path вкомпилированы в подпись
-- (унаследованы из phase 19, см. ALTER FUNCTION там).

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

    SELECT city, name, role, COALESCE(status, 'active')
      INTO user_city, user_name, user_role, user_status
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

    -- ★ FEAT-013 — зеркалим в events ТОЛЬКО если ведущая активна.
    --   Любая «не-active» ситуация (suspended, NULL→active по default
    --   тоже active, но coalesce выше уже это нормализовал) удаляет
    --   зеркало. Это покрывает и старое условие is_public=false.
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
$$;

-- ─────────────────────────────────────────────────────────────────────
-- PART 2: resync_events_for_user(uuid) — массовая ресинхронизация
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.resync_events_for_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _status text;
BEGIN
    SELECT COALESCE(status, 'active') INTO _status
    FROM public.profiles WHERE id = _user_id;

    -- Step 1 — снести все зеркала юзера в events.
    DELETE FROM public.events
    WHERE garden_id IN (
        SELECT id FROM public.meetings WHERE user_id = _user_id
    );

    -- Step 2 — если active, re-fire trigger sync_meeting_to_event на
    -- каждой публичной встрече юзера (no-op UPDATE → trigger пройдёт
    -- по INSERT-ветке, потому что зеркал в events уже нет).
    IF _status = 'active' THEN
        UPDATE public.meetings SET id = id
        WHERE user_id = _user_id
          AND is_public = true;
    END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- PART 3: триггер на profiles AFTER UPDATE OF status
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_profiles_status_resync_events()
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

DROP TRIGGER IF EXISTS on_profile_status_change_resync_events ON public.profiles;
CREATE TRIGGER on_profile_status_change_resync_events
    AFTER UPDATE OF status ON public.profiles
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION public.trg_profiles_status_resync_events();

-- ─────────────────────────────────────────────────────────────────────
-- PART 4: одноразовый cleanup зомби-зеркал (12 строк по recon V2-8)
-- ─────────────────────────────────────────────────────────────────────
-- Текущее состояние на 2026-05-04: 1 ведущая (Елена Мельникова) на
-- status='suspended' имеет 12 публичных зеркал в events, которые сейчас
-- видны в публичном Meetings. Phase 21 их одноразово удаляет.

DELETE FROM public.events
WHERE garden_id IN (
    SELECT m.id
    FROM public.meetings m
    JOIN public.profiles p ON p.id = m.user_id
    WHERE COALESCE(p.status, 'active') = 'suspended'
);

-- ─────────────────────────────────────────────────────────────────────
-- PART 5: PostgREST schema cache reload
-- ─────────────────────────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- VERIFY (вне транзакции)
-- ─────────────────────────────────────────────────────────────────────

\echo === V1: тело sync_meeting_to_event теперь читает profiles.status ===
\echo Ожидание: оба поля = t (тело содержит ссылки на profiles и status)
SELECT
  pg_get_functiondef('public.sync_meeting_to_event()'::regprocedure)
    ~ 'FROM public\.profiles' AS reads_profiles,
  pg_get_functiondef('public.sync_meeting_to_event()'::regprocedure)
    ~ 'user_status\s*=\s*''active''' AS checks_active_status,
  prosecdef AS is_definer,
  proconfig
FROM pg_proc
WHERE proname = 'sync_meeting_to_event';

\echo === V2: resync_events_for_user — DEFINER + search_path=public ===
\echo Ожидание: is_definer=t, proconfig содержит search_path=public
SELECT proname, prosecdef AS is_definer, proconfig
FROM pg_proc
WHERE proname = 'resync_events_for_user';

\echo === V3: триггер на profiles появился (1 строка) ===
\echo Ожидание: tgname=on_profile_status_change_resync_events
SELECT t.tgname,
       p.proname    AS function_name,
       p.prosecdef  AS is_definer,
       pg_get_triggerdef(t.oid) AS trigger_def
FROM pg_trigger t
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE t.tgrelid = 'public.profiles'::regclass
  AND NOT t.tgisinternal;

\echo === V4: зомби-зеркала вычищены (ожидание: 0) ===
SELECT count(*) AS suspended_events_remaining
FROM public.events e
JOIN public.meetings m ON m.id = e.garden_id
JOIN public.profiles p ON p.id = m.user_id
WHERE COALESCE(p.status, 'active') = 'suspended';

\echo === V5: active-ведущие с публичными meetings всё ещё имеют зеркала ===
\echo Ожидание (по recon V2-7): 146 — то же, что было до phase 21
SELECT count(*) AS active_meetings_with_mirror
FROM public.profiles p
JOIN public.meetings m ON m.user_id = p.id
JOIN public.events e ON e.garden_id = m.id
WHERE COALESCE(p.status, 'active') = 'active'
  AND m.is_public = true;
