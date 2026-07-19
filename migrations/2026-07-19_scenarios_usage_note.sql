-- migrations/2026-07-19_scenarios_usage_note.sql
--
-- Сценарии: новое поле usage_note (text) — per-scenario заметка автора
-- о допустимом использовании сценария (напр. «можно брать и проводить
-- полностью»). Показывается заметным блоком под названием сценария в
-- разделе «Сценарии лиги» (карточка + просмотр). Модель — как
-- sharing_prompt (migrations/2026-07-18_practice_sharing_prompt.sql).
--
-- idempotent. RUNBOOK 1.3: ensure_garden_grants() в конце транзакции
-- (schema-changing DDL может триггернуть Timeweb ACL-resync).

\set ON_ERROR_STOP on

BEGIN;

ALTER TABLE IF EXISTS public.scenarios
  ADD COLUMN IF NOT EXISTS usage_note text;

-- Post: колонка есть
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='scenarios'
           AND column_name='usage_note'
    ) THEN
        RAISE EXCEPTION 'usage_note: колонка не создана';
    END IF;
    RAISE NOTICE 'usage_note: OK — колонка scenarios.usage_note на месте';
END $$;

-- DDL safety-net (RUNBOOK 1.3 — Timeweb GRANT-wipe после DDL)
SELECT public.ensure_garden_grants();

COMMIT;

-- ROLLBACK:
-- BEGIN;
--   ALTER TABLE public.scenarios DROP COLUMN IF EXISTS usage_note;
--   SELECT public.ensure_garden_grants();
-- COMMIT;
