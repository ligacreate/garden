-- ============================================================================
-- phase32 — TG-уведомления для менторов и студенток ПВЛ (FEAT-024)
-- ============================================================================
-- ЗАВИСИМОСТИ:
--   * phase31 v3 (pending_approval guards) — applied 2026-05-16, проверено.
--   * Существующие таблицы: profiles, pvl_student_homework_submissions,
--     pvl_homework_status_history, pvl_direct_messages, pvl_garden_mentor_links,
--     pvl_course_lessons, pvl_homework_items.
--   * Расширение pgcrypto (gen_random_uuid) — уже есть.
--
-- БЕЗОПАСНОСТЬ:
--   * tg_link_codes и tg_notifications_queue НЕ доступны authenticated.
--     Все операции только через garden-auth (owner gen_user). Это решение
--     зафиксировано в _session/_41 (utечка PII через PostgREST была бы
--     при GRANT TO authenticated).
--   * ensure_garden_grants не меняется (нет GRANT'ов на новые таблицы).
-- ============================================================================

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- §0 PRE-CHECK
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_existing int;
BEGIN
    SELECT count(*) INTO v_existing
      FROM information_schema.columns
     WHERE table_schema='public' AND table_name='profiles'
       AND column_name='telegram_user_id';
    IF v_existing > 0 THEN
        RAISE NOTICE 'phase32 pre-check: profiles.telegram_user_id уже есть — идемпотентный путь';
    ELSE
        RAISE NOTICE 'phase32 pre-check: чистая инсталляция TG-колонок';
    END IF;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- §1 КОЛОНКИ В profiles
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS telegram_user_id BIGINT,
    ADD COLUMN IF NOT EXISTS telegram_linked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS telegram_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_telegram_user_id
    ON public.profiles(telegram_user_id)
    WHERE telegram_user_id IS NOT NULL;

COMMENT ON COLUMN public.profiles.telegram_user_id IS
    'TG chat_id (числовой). Заполняется при linking flow FEAT-024. NULL = не привязан. Не путать с profiles.telegram (@username, FEAT-002).';

-- ───────────────────────────────────────────────────────────────────────────
-- §2 ТАБЛИЦА tg_link_codes
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tg_link_codes (
    code TEXT PRIMARY KEY,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '15 minutes'),
    consumed_at TIMESTAMPTZ,
    consumed_by_tg_user_id BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tg_link_codes_profile
    ON public.tg_link_codes(profile_id, consumed_at);

CREATE INDEX IF NOT EXISTS idx_tg_link_codes_expires
    ON public.tg_link_codes(expires_at)
    WHERE consumed_at IS NULL;

COMMENT ON TABLE public.tg_link_codes IS
    'FEAT-024. Одноразовые коды LINK-XXXXXX для привязки TG-аккаунта к profile. TTL 15 мин. Не доступна authenticated — только garden-auth (gen_user).';

-- ───────────────────────────────────────────────────────────────────────────
-- §3 ТАБЛИЦА tg_notifications_queue
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tg_notifications_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    recipient_tg_user_id BIGINT,
    event_type TEXT NOT NULL,
    event_source_table TEXT NOT NULL,
    event_source_id UUID NOT NULL,
    event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    message_text TEXT NOT NULL,
    dedup_key TEXT,
    scheduled_for TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at TIMESTAMPTZ,
    attempt_count INT NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMPTZ,
    last_error TEXT,
    dead_letter_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT tg_notifications_queue_event_type_check
        CHECK (event_type IN (
            'hw_submitted_new',
            'hw_submitted_revision',
            'hw_accepted',
            'hw_revision_requested',
            'dm_from_mentor'
        ))
);

CREATE INDEX IF NOT EXISTS idx_tg_notifications_queue_pending
    ON public.tg_notifications_queue(scheduled_for)
    WHERE sent_at IS NULL AND dead_letter_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tg_notifications_queue_recipient
    ON public.tg_notifications_queue(recipient_profile_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tg_notifications_queue_dedup
    ON public.tg_notifications_queue(dedup_key)
    WHERE dedup_key IS NOT NULL AND sent_at IS NULL;

COMMENT ON TABLE public.tg_notifications_queue IS
    'FEAT-024. Очередь TG-уведомлений: триггеры наполняют, worker в garden-auth (setInterval 15с) опустошает. Не доступна authenticated — содержит PII (тексты DM).';

-- ───────────────────────────────────────────────────────────────────────────
-- §4 ФУНКЦИЯ tg_resolve_mentor_profile
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_resolve_mentor_profile(p_student_id uuid)
RETURNS uuid LANGUAGE sql STABLE AS $$
    -- pvl_garden_mentor_links.mentor_id может быть pvl_mentors.id ИЛИ profiles.id (legacy).
    -- LEFT JOIN на profiles фильтрует только реальные profile id.
    SELECT p.id
      FROM public.pvl_garden_mentor_links ml
      LEFT JOIN public.profiles p ON p.id = ml.mentor_id
     WHERE ml.student_id = p_student_id
       AND p.id IS NOT NULL
     LIMIT 1;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- §5 ФУНКЦИЯ tg_compute_scheduled_for — quiet hours 23-08 MSK
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_compute_scheduled_for()
RETURNS timestamptz LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_now_msk timestamp;
    v_hour int;
    v_target_date date;
BEGIN
    v_now_msk := now() AT TIME ZONE 'Europe/Moscow';
    v_hour := EXTRACT(HOUR FROM v_now_msk)::int;
    IF v_hour >= 23 THEN
        v_target_date := (v_now_msk + interval '1 day')::date;
        RETURN (v_target_date::timestamp + time '08:00') AT TIME ZONE 'Europe/Moscow';
    ELSIF v_hour < 8 THEN
        v_target_date := v_now_msk::date;
        RETURN (v_target_date::timestamp + time '08:00') AT TIME ZONE 'Europe/Moscow';
    ELSE
        RETURN now();
    END IF;
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- §6 ТРИГГЕР на pvl_homework_status_history
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_enqueue_homework_event()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_student_id uuid;
    v_recipient_profile_id uuid;
    v_recipient_tg bigint;
    v_recipient_enabled boolean;
    v_event_type text;
    v_lesson_title text;
    v_homework_title text;
    v_student_name text;
    v_msg text;
    v_dedup text;
BEGIN
    -- 1. Определяем тип события и получателя
    IF NEW.to_status = 'submitted' THEN
        SELECT student_id INTO v_student_id
          FROM public.pvl_student_homework_submissions
         WHERE id = NEW.submission_id;
        v_recipient_profile_id := public.tg_resolve_mentor_profile(v_student_id);
        IF NEW.from_status = 'revision' THEN
            v_event_type := 'hw_submitted_revision';
        ELSE
            v_event_type := 'hw_submitted_new';
        END IF;
        -- Если ментор не резолвится — оставляем NOTICE для видимости в логе.
        IF v_recipient_profile_id IS NULL THEN
            RAISE NOTICE 'tg-trigger: mentor unresolved for student_id=%', v_student_id;
            RETURN NEW;
        END IF;
    ELSIF NEW.to_status = 'accepted' THEN
        SELECT student_id INTO v_student_id
          FROM public.pvl_student_homework_submissions
         WHERE id = NEW.submission_id;
        v_recipient_profile_id := v_student_id;  -- pvl_students.id = profiles.id
        v_event_type := 'hw_accepted';
    ELSIF NEW.to_status = 'revision' THEN
        SELECT student_id INTO v_student_id
          FROM public.pvl_student_homework_submissions
         WHERE id = NEW.submission_id;
        v_recipient_profile_id := v_student_id;
        v_event_type := 'hw_revision_requested';
    ELSE
        RETURN NEW;  -- in_review/rejected/overdue в MVP не шлём
    END IF;

    -- 2. Self-event skip
    IF NEW.changed_by = v_recipient_profile_id THEN
        RETURN NEW;
    END IF;

    -- 3. Получатель привязал TG и не выключил?
    SELECT telegram_user_id, telegram_notifications_enabled
      INTO v_recipient_tg, v_recipient_enabled
      FROM public.profiles
     WHERE id = v_recipient_profile_id;
    IF v_recipient_tg IS NULL OR v_recipient_enabled IS DISTINCT FROM TRUE THEN
        RETURN NEW;
    END IF;

    -- 4. Контекст для текста
    SELECT cl.title, hi.title
      INTO v_lesson_title, v_homework_title
      FROM public.pvl_student_homework_submissions s
      LEFT JOIN public.pvl_homework_items hi ON hi.id = s.homework_item_id
      LEFT JOIN public.pvl_course_lessons cl ON cl.id = hi.lesson_id
     WHERE s.id = NEW.submission_id;

    IF v_event_type IN ('hw_submitted_new', 'hw_submitted_revision') THEN
        SELECT COALESCE(p.name, p.email, 'студентка')
          INTO v_student_name
          FROM public.profiles p
         WHERE p.id = v_student_id;
    END IF;

    -- 5. Формируем текст. «Просьба доработать ДЗ» (без «Ментор просит»).
    v_msg := CASE v_event_type
        WHEN 'hw_submitted_new' THEN
            E'📥 <b>' || COALESCE(v_student_name, 'Студентка') || E'</b> сдала ДЗ\n«' ||
            COALESCE(v_homework_title, v_lesson_title, 'без названия') || '»'
        WHEN 'hw_submitted_revision' THEN
            E'📥 <b>' || COALESCE(v_student_name, 'Студентка') || E'</b> дополнила ДЗ\n«' ||
            COALESCE(v_homework_title, v_lesson_title, 'без названия') || '»'
        WHEN 'hw_accepted' THEN
            E'✅ Ваше ДЗ принято\n«' || COALESCE(v_homework_title, v_lesson_title, 'без названия') || '»'
        WHEN 'hw_revision_requested' THEN
            E'🔄 Просьба доработать ДЗ\n«' || COALESCE(v_homework_title, v_lesson_title, 'без названия') || '»' ||
            CASE WHEN NEW.comment IS NOT NULL AND length(trim(NEW.comment)) > 0
                 THEN E'\n\n<i>' || substring(NEW.comment, 1, 200) || '</i>'
                 ELSE '' END
    END;

    v_dedup := 'history:' || NEW.id::text;

    INSERT INTO public.tg_notifications_queue (
        recipient_profile_id, recipient_tg_user_id,
        event_type, event_source_table, event_source_id,
        event_payload, message_text, dedup_key, scheduled_for
    ) VALUES (
        v_recipient_profile_id, v_recipient_tg,
        v_event_type, 'pvl_homework_status_history', NEW.id,
        jsonb_build_object(
            'submission_id', NEW.submission_id,
            'from_status', NEW.from_status,
            'to_status', NEW.to_status,
            'changed_by', NEW.changed_by,
            'lesson_title', v_lesson_title,
            'homework_title', v_homework_title
        ),
        v_msg, v_dedup,
        public.tg_compute_scheduled_for()
    )
    ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL AND sent_at IS NULL DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tg_enqueue_homework_event ON public.pvl_homework_status_history;
CREATE TRIGGER trg_tg_enqueue_homework_event
    AFTER INSERT ON public.pvl_homework_status_history
    FOR EACH ROW EXECUTE FUNCTION public.tg_enqueue_homework_event();

-- ───────────────────────────────────────────────────────────────────────────
-- §7 ТРИГГЕР на pvl_direct_messages
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_enqueue_direct_message_event()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_recipient_tg bigint;
    v_recipient_enabled boolean;
    v_msg text;
BEGIN
    IF NEW.author_user_id IS DISTINCT FROM NEW.mentor_id THEN
        RETURN NEW;
    END IF;

    IF NEW.student_id = NEW.author_user_id THEN
        RETURN NEW;
    END IF;

    SELECT telegram_user_id, telegram_notifications_enabled
      INTO v_recipient_tg, v_recipient_enabled
      FROM public.profiles
     WHERE id = NEW.student_id;
    IF v_recipient_tg IS NULL OR v_recipient_enabled IS DISTINCT FROM TRUE THEN
        RETURN NEW;
    END IF;

    v_msg := E'💬 Новое сообщение от ментора\n\n<i>' ||
             substring(COALESCE(NEW.text, ''), 1, 200) || '</i>';

    INSERT INTO public.tg_notifications_queue (
        recipient_profile_id, recipient_tg_user_id,
        event_type, event_source_table, event_source_id,
        event_payload, message_text, dedup_key, scheduled_for
    ) VALUES (
        NEW.student_id, v_recipient_tg,
        'dm_from_mentor', 'pvl_direct_messages', NEW.id,
        jsonb_build_object('mentor_id', NEW.mentor_id, 'student_id', NEW.student_id),
        v_msg,
        'dm:' || NEW.id::text,
        public.tg_compute_scheduled_for()
    )
    ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL AND sent_at IS NULL DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tg_enqueue_direct_message_event ON public.pvl_direct_messages;
CREATE TRIGGER trg_tg_enqueue_direct_message_event
    AFTER INSERT ON public.pvl_direct_messages
    FOR EACH ROW EXECUTE FUNCTION public.tg_enqueue_direct_message_event();

-- ───────────────────────────────────────────────────────────────────────────
-- §8 GRANTS — НЕТ (см. _session/_41 Δ5/Δ6)
-- ───────────────────────────────────────────────────────────────────────────
-- tg_link_codes и tg_notifications_queue остаются доступными только owner'у
-- (gen_user). garden-auth backend подключается под gen_user — для него этого
-- достаточно. authenticated/web_anon к этим таблицам не имеют доступа = нет
-- утечки PII через PostgREST. ensure_garden_grants не меняется.

COMMIT;

-- ───────────────────────────────────────────────────────────────────────────
-- §9 VERIFY V1..V12 (после COMMIT)
-- ───────────────────────────────────────────────────────────────────────────

-- V1 — колонки profiles
SELECT 'V1' AS check,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='telegram_user_id') AS telegram_user_id,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='telegram_linked_at') AS linked_at,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='telegram_notifications_enabled') AS enabled_flag;

-- V2 — UNIQUE partial index
SELECT 'V2' AS check, indexname
  FROM pg_indexes WHERE schemaname='public' AND indexname='uq_profiles_telegram_user_id';

-- V3 — tg_link_codes
SELECT 'V3' AS check, count(*) AS columns
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='tg_link_codes';

-- V4 — tg_notifications_queue
SELECT 'V4' AS check, count(*) AS columns
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='tg_notifications_queue';

-- V5 — CHECK на event_type
SELECT 'V5' AS check, conname
  FROM pg_constraint WHERE conname='tg_notifications_queue_event_type_check';

-- V6 — функции
SELECT 'V6' AS check, count(*) AS fn_count
  FROM pg_proc
 WHERE pronamespace=(SELECT oid FROM pg_namespace WHERE nspname='public')
   AND proname IN ('tg_resolve_mentor_profile','tg_compute_scheduled_for','tg_enqueue_homework_event','tg_enqueue_direct_message_event');

-- V7 — триггеры
SELECT 'V7' AS check, tgname, tgrelid::regclass AS tbl
  FROM pg_trigger
 WHERE tgname IN ('trg_tg_enqueue_homework_event','trg_tg_enqueue_direct_message_event');

-- V8 — quiet-hours smoke
SELECT 'V8' AS check, public.tg_compute_scheduled_for() AS scheduled_for_now;

-- V9 — резолюция ментора (sample)
SELECT 'V9' AS check, public.tg_resolve_mentor_profile(
    (SELECT student_id FROM public.pvl_garden_mentor_links LIMIT 1)
) AS sample_mentor;

-- V10 — индексы queue
SELECT 'V10' AS check, indexname
  FROM pg_indexes
 WHERE schemaname='public' AND tablename='tg_notifications_queue'
 ORDER BY indexname;

-- V11 — queue пустая
SELECT 'V11' AS check, count(*) AS rows_in_queue FROM public.tg_notifications_queue;

-- V12 — Δ5/Δ6 verify: authenticated НЕ имеет прав на новые таблицы
SELECT 'V12' AS check, table_name, privilege_type
  FROM information_schema.role_table_grants
 WHERE grantee='authenticated' AND table_schema='public'
   AND table_name IN ('tg_link_codes','tg_notifications_queue')
 ORDER BY table_name, privilege_type;
-- ожидаем 0 строк (никаких grants — миграция корректная по Δ5).

-- ============================================================================
-- ROLLBACK (если что — отдельным заходом)
-- ============================================================================
-- DROP TRIGGER IF EXISTS trg_tg_enqueue_homework_event ON public.pvl_homework_status_history;
-- DROP TRIGGER IF EXISTS trg_tg_enqueue_direct_message_event ON public.pvl_direct_messages;
-- DROP FUNCTION IF EXISTS public.tg_enqueue_homework_event();
-- DROP FUNCTION IF EXISTS public.tg_enqueue_direct_message_event();
-- DROP FUNCTION IF EXISTS public.tg_compute_scheduled_for();
-- DROP FUNCTION IF EXISTS public.tg_resolve_mentor_profile(uuid);
-- DROP TABLE IF EXISTS public.tg_notifications_queue;
-- DROP TABLE IF EXISTS public.tg_link_codes;
-- ALTER TABLE public.profiles
--     DROP COLUMN IF EXISTS telegram_notifications_enabled,
--     DROP COLUMN IF EXISTS telegram_linked_at,
--     DROP COLUMN IF EXISTS telegram_user_id;
