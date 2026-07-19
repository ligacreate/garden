-- migrations/data/2026-07-19_scenario_26_usage_note.sql
--
-- Заполнение usage_note для сценария id=26 «День больших планов на бумаге»
-- (Ольга Скребейко). Текст — личное разрешение автора использовать
-- сценарий полностью. Требует колонку scenarios.usage_note
-- (migrations/2026-07-19_scenarios_usage_note.sql) — накатывать после неё.

\set ON_ERROR_STOP on

BEGIN;

UPDATE public.scenarios
   SET usage_note = 'Эту механику можно смело брать и проводить полностью по моему сценарию — добавляй свои фирменные фишечки, опыт и истории.'
 WHERE id = 26;

COMMIT;
