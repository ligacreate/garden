-- migrations/2026-05-18_phase34_tg_trigger_status_fix.sql
--
-- BUG-TG-TRIGGER-STATUS-MISMATCH — P0 hotfix.
--
-- Функция tg_enqueue_homework_event() проверяла to_status='submitted',
-- а реальный статус после сдачи ДЗ — 'in_review' (211 событий за всё
-- время, submitted_count=0). Менторы не получали push о сданных ДЗ.
--
-- Меняем одну строку в теле функции; триггер уже привязан и enabled,
-- бэкфилл не делаем (per бриф _61).

BEGIN;

-- Pre: защита от двойного apply
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc
         WHERE proname = 'tg_enqueue_homework_event'
           AND pg_get_functiondef(oid) LIKE '%NEW.to_status = ''submitted''%'
    ) THEN
        RAISE EXCEPTION 'phase34 pre: функция либо отсутствует, либо уже patched';
    END IF;
END $$;

-- Patch: точная копия pg_get_functiondef() с прода 2026-05-18,
-- единственное изменение — `IF NEW.to_status = 'in_review' THEN`
CREATE OR REPLACE FUNCTION public.tg_enqueue_homework_event()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
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
    IF NEW.to_status = 'in_review' THEN  -- BUG-TG-TRIGGER-STATUS-MISMATCH: было 'submitted' (несуществующий статус)
        SELECT student_id INTO v_student_id
          FROM public.pvl_student_homework_submissions
         WHERE id = NEW.submission_id;
        v_recipient_profile_id := public.tg_resolve_mentor_profile(v_student_id);
        IF NEW.from_status = 'revision' THEN
            v_event_type := 'hw_submitted_revision';
        ELSE
            v_event_type := 'hw_submitted_new';
        END IF;
        IF v_recipient_profile_id IS NULL THEN
            RAISE NOTICE 'tg-trigger: mentor unresolved for student_id=%', v_student_id;
            RETURN NEW;
        END IF;
    ELSIF NEW.to_status = 'accepted' THEN
        SELECT student_id INTO v_student_id
          FROM public.pvl_student_homework_submissions
         WHERE id = NEW.submission_id;
        v_recipient_profile_id := v_student_id;
        v_event_type := 'hw_accepted';
    ELSIF NEW.to_status = 'revision' THEN
        SELECT student_id INTO v_student_id
          FROM public.pvl_student_homework_submissions
         WHERE id = NEW.submission_id;
        v_recipient_profile_id := v_student_id;
        v_event_type := 'hw_revision_requested';
    ELSE
        RETURN NEW;  -- rejected/overdue в MVP не шлём
    END IF;

    IF NEW.changed_by = v_recipient_profile_id THEN
        RETURN NEW;
    END IF;

    SELECT telegram_user_id, telegram_notifications_enabled
      INTO v_recipient_tg, v_recipient_enabled
      FROM public.profiles
     WHERE id = v_recipient_profile_id;
    IF v_recipient_tg IS NULL OR v_recipient_enabled IS DISTINCT FROM TRUE THEN
        RETURN NEW;
    END IF;

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
$function$;

-- Post: подтверждение patched
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc
         WHERE proname = 'tg_enqueue_homework_event'
           AND pg_get_functiondef(oid) LIKE '%NEW.to_status = ''in_review''%'
    ) THEN
        RAISE EXCEPTION 'phase34 post: patch FAILED — функция не содержит in_review';
    END IF;
    RAISE NOTICE 'phase34: tg_enqueue_homework_event patched OK (in_review)';
END $$;

-- DDL safety-net (RUNBOOK 1.3)
SELECT public.ensure_garden_grants();

COMMIT;
