-- migrations/2026-05-18_phase36_tg_trigger_security_definer.sql
--
-- BUG-HW-SUBMIT-NO-HISTORY — P0 hotfix.
--
-- tg_enqueue_homework_event и tg_enqueue_direct_message_event объявлены
-- без SECURITY DEFINER → выполняются с правами вызывающей роли
-- (authenticated). У authenticated нет GRANT INSERT на
-- public.tg_notifications_queue (только у gen_user). После phase34
-- (исправление to_status='in_review') trigger стал реально доходить до
-- INSERT в queue для submit'ов студенток → permission denied → откат
-- всей транзакции → запись в pvl_homework_status_history не появляется
-- → ментор не получает push.
--
-- Фикс: ALTER FUNCTION ... SECURITY DEFINER SET search_path = public, pg_temp.
-- Owner функций = gen_user (у которого есть INSERT на queue), плюс
-- зафиксированный search_path по стандарту проекта (как в is_mentor_for,
-- is_admin, has_platform_access). Тело функций не меняем.
--
-- См. recon factsheet: docs/_session/2026-05-18_69_codeexec_bug_hw_submit_recon.md

BEGIN;

-- Pre-assert: защита от двойного apply
DO $$
DECLARE
    v_hw_secdef boolean;
    v_dm_secdef boolean;
BEGIN
    SELECT prosecdef INTO v_hw_secdef
      FROM pg_proc
     WHERE proname = 'tg_enqueue_homework_event'
       AND pronamespace = 'public'::regnamespace;
    SELECT prosecdef INTO v_dm_secdef
      FROM pg_proc
     WHERE proname = 'tg_enqueue_direct_message_event'
       AND pronamespace = 'public'::regnamespace;

    IF v_hw_secdef IS NULL OR v_dm_secdef IS NULL THEN
        RAISE EXCEPTION 'phase36 pre: одна из функций tg_enqueue_*() отсутствует';
    END IF;
    IF v_hw_secdef = true AND v_dm_secdef = true THEN
        RAISE EXCEPTION 'phase36 pre: обе функции уже SECURITY DEFINER (миграция применена ранее)';
    END IF;
END $$;

-- Patch: SECURITY DEFINER + явный search_path
ALTER FUNCTION public.tg_enqueue_homework_event()
    SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp';

ALTER FUNCTION public.tg_enqueue_direct_message_event()
    SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp';

-- Post-assert: подтверждение
DO $$
DECLARE
    v_hw_secdef boolean;
    v_dm_secdef boolean;
BEGIN
    SELECT prosecdef INTO v_hw_secdef
      FROM pg_proc
     WHERE proname = 'tg_enqueue_homework_event'
       AND pronamespace = 'public'::regnamespace;
    SELECT prosecdef INTO v_dm_secdef
      FROM pg_proc
     WHERE proname = 'tg_enqueue_direct_message_event'
       AND pronamespace = 'public'::regnamespace;

    IF v_hw_secdef IS NOT TRUE OR v_dm_secdef IS NOT TRUE THEN
        RAISE EXCEPTION 'phase36 post: ALTER не сработал (hw=%, dm=%)', v_hw_secdef, v_dm_secdef;
    END IF;
    RAISE NOTICE 'phase36: tg_enqueue_homework_event и tg_enqueue_direct_message_event теперь SECURITY DEFINER';
END $$;

-- DDL safety-net (RUNBOOK 1.3)
SELECT public.ensure_garden_grants();

COMMIT;
