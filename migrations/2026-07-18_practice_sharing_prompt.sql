-- migrations/2026-07-18_practice_sharing_prompt.sql
--
-- Практики: новое поле «Шеринг» (sharing_prompt) — подводка/вопрос,
-- с которым ведущая запускает обмен в группе. Модель — как
-- reflection_questions (migrations/15_practices_extended_fields.sql).
--
-- idempotent. RUNBOOK 1.3: ensure_garden_grants() в конце транзакции
-- (schema-changing DDL может триггернуть Timeweb ACL-resync).

\set ON_ERROR_STOP on

BEGIN;

ALTER TABLE IF EXISTS public.practices
  ADD COLUMN IF NOT EXISTS sharing_prompt text;

-- Post: колонка есть
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='practices'
           AND column_name='sharing_prompt'
    ) THEN
        RAISE EXCEPTION 'sharing_prompt: колонка не создана';
    END IF;
    RAISE NOTICE 'sharing_prompt: OK — колонка practices.sharing_prompt на месте';
END $$;

-- DDL safety-net (RUNBOOK 1.3 — Timeweb GRANT-wipe после DDL)
SELECT public.ensure_garden_grants();

COMMIT;

-- ROLLBACK:
-- BEGIN;
--   ALTER TABLE public.practices DROP COLUMN IF EXISTS sharing_prompt;
--   SELECT public.ensure_garden_grants();
-- COMMIT;
