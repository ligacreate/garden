-- migrations/2026-05-04_phase18_meetings_anon_read_revoke_events_writes.sql
--
-- SEC-001 phase 18 — anon read для Meetings + revoke authenticated writes на events.
--
-- Контекст:
--   После phase 16 (bulk GRANT для authenticated) обнажилась зеркальная
--   дыра: web_anon (роль PostgREST для запросов без JWT) имеет 0 GRANT'ов
--   на public-таблицы. До SEC-001 PostgREST не переключал роль и шёл
--   под gen_user (owner) → любой SELECT работал. После SEC-001 включён
--   role-switch через JWT → no-JWT = web_anon → 42501 на любую SELECT.
--
--   Diagnostic 2026-05-04 показал: приложение Meetings
--   (meetings.skrebeyko.ru) ходит к api.skrebeyko.ru анонимно для
--   4 public-read таблиц, все падают 42501. Подтверждено через
--   DevTools Console: 12 проваленных запросов (3 retry × 4 таблицы)
--   на каждой загрузке. Юзеры видят "Не удалось загрузить свежие
--   данные, показаны старые" — кеш в Meetings закрывает дыру.
--
--   Подтверждение через прямой curl (Г1 в текущей сессии):
--     curl https://api.skrebeyko.ru/events?select=id,title&limit=1
--     → HTTP 401, code 42501, "permission denied for table events"
--     curl с Bearer JWT на тот же URL
--     → HTTP 200 + JSON
--
-- Побочно:
--   ANOM-002/SEC-011 — RLS-policies на events открыты USING(true) для
--   INSERT/UPDATE/DELETE. После phase 16 у authenticated есть full CRUD
--   GRANT на events → любой залогиненный может переписать/удалить
--   произвольное событие. События пишутся ТОЛЬКО через trigger
--   sync_meeting_to_event (под owner-ролью при изменении meetings),
--   прямого INSERT/UPDATE/DELETE из фронта в events не нужно.
--   Закрываем эту дыру в той же миграции — REVOKE writes от
--   authenticated.
--
-- Контракт:
--   1. GRANT SELECT для web_anon на 4 public-read таблицы:
--      - events    — broadcast встречи (Meetings-app, лендинг)
--      - cities    — справочник городов (форма регистрации)
--      - notebooks — контентные тетради Meetings
--      - questions — FAQ Meetings
--   2. REVOKE INSERT/UPDATE/DELETE на events от authenticated.
--      SELECT для authenticated НЕ трогаем — Garden фронт продолжает
--      читать events.
--
-- Не трогает (deferred / closed):
--   - profiles / users_auth / messages / pvl_*     — НЕ для anon (PII / closed community)
--   - writes на cities/notebooks/questions от authenticated — отдельный
--     таск ANOM-004 (нужна разведка: кто и что туда пишет)
--   - meetings RLS — owner-only by design (гости видят через events)
--
-- Bonus insight (для backlog):
--   questions + notebooks — это таблицы Meetings, не "чужие"
--   (CLEAN-011 в backlog — переосмыслить).
--
-- Связанные документы:
--   docs/EXEC_2026-05-03_post_smoke_repeat_v3.md
--   migrations/2026-05-03_phase16_grant_role_switch_bulk.sql
--   migrations/2026-05-03_phase17_grant_execute_rls_helpers.sql
--
-- Apply: psql под gen_user, \set ON_ERROR_STOP on, \i этот файл.
-- Verify-блок ниже исполнится после COMMIT.

\set ON_ERROR_STOP on

BEGIN;

-- ── PART 1: web_anon SELECT для 4 public-read таблиц ──
GRANT SELECT ON public.events    TO web_anon;
GRANT SELECT ON public.cities    TO web_anon;
GRANT SELECT ON public.notebooks TO web_anon;
GRANT SELECT ON public.questions TO web_anon;

-- ── PART 2: закрытие ANOM-002/SEC-011 — events writes wide-open ──
REVOKE INSERT, UPDATE, DELETE ON public.events FROM authenticated;

-- ── PART 3: PostgREST schema cache reload ──
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- VERIFY (вне транзакции)
-- ─────────────────────────────────────────────────────────────────────

\echo === V1: web_anon SELECT на 4 таблицы (ожидание: все t) ===
SELECT t.table_name,
       EXISTS (
         SELECT 1 FROM information_schema.role_table_grants
         WHERE table_schema = 'public' AND table_name = t.table_name
           AND grantee = 'web_anon' AND privilege_type = 'SELECT'
       ) AS web_anon_select
FROM (VALUES ('events'),('cities'),('notebooks'),('questions')) AS t(table_name)
ORDER BY t.table_name;

\echo === V2: authenticated на events — только SELECT, без writes ===
\echo Ожидание: ровно 1 строка с SELECT, без INSERT/UPDATE/DELETE
SELECT privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'events'
  AND grantee = 'authenticated'
ORDER BY privilege_type;

\echo === V3: web_anon НЕТ доступа к чувствительным таблицам (контроль) ===
\echo Ожидание: 0 строк (web_anon к profiles/users_auth/messages/pvl_audit_log не имеет грантов)
SELECT table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee = 'web_anon'
  AND table_name IN ('profiles','users_auth','messages','pvl_audit_log')
ORDER BY table_name, privilege_type;
