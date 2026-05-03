-- migrations/2026-05-03_phase17_grant_execute_rls_helpers.sql
--
-- SEC-001 phase 17 — GRANT EXECUTE для RLS-helper функций.
--
-- Контекст:
--   После phase 16 bulk GRANT (table-level) проверка SECURITY DEFINER
--   функций в public (Q10) выявила 5 функций без EXECUTE для authenticated:
--     is_admin()                            — RLS-helper (boolean)
--     is_mentor_for(uuid)                   — RLS-helper (boolean)
--     get_events_public()                   — RPC, тело не читано (deferred)
--     increment_user_seeds(uuid[], integer) — мутация баланса (deferred)
--     handle_new_user()                     — trigger function (NE требуется)
--
--   Без EXECUTE на is_admin/is_mentor_for каждая RLS-policy с этими
--   helper'ами возвращает 42501 "permission denied for function".
--   Это та же мина, что NEW-BUG-007 (phase 16 bulk-grant), но на
--   уровне функций. Зеркальный пропуск SEC-001 фазы 14.5.
--
-- Диагностика (read-only):
--   Q9:  is_mentor_for — одна сигнатура (uuid), prosecdef=t,
--        acl_raw='{gen_user=X/gen_user}' — только владельцу.
--   Q10: 5 SECURITY DEFINER в public — auth_has_exec = f для всех.
--
-- Контракт:
--   GRANT EXECUTE на 2 read-only boolean helper'а: is_admin, is_mentor_for(uuid).
--   Обе SECURITY DEFINER → исполняются под gen_user. Безопасно: возвращают
--   true/false, не мутируют состояние.
--
-- Не включены в эту фазу (deferred):
--   - get_events_public()                — тело не читано (Q12 в работе);
--                                          включение → phase 18 если safe.
--   - increment_user_seeds(uuid[], int)  — мутация баланса; без проверки
--                                          is_admin внутри = privilege
--                                          escalation. Требует Q12 + аудит.
--   - handle_new_user()                  — trigger function, EXECUTE для
--                                          caller не нужен (вызывается
--                                          системой на INSERT в auth).
--
-- Связанные документы:
--   docs/EXEC_2026-05-03_post_smoke_repeat.md
--   migrations/2026-05-03_phase16_grant_role_switch_bulk.sql
--
-- Apply: psql под gen_user, \set ON_ERROR_STOP on, \i этот файл.

\set ON_ERROR_STOP on

BEGIN;

-- RLS-policies вызывают is_admin() и is_mentor_for(uuid).
-- SECURITY DEFINER + read-only boolean → grant безопасен.
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_mentor_for(uuid) TO authenticated;

-- Postgres ACL update заставит PostgREST refresh schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- VERIFY (вне транзакции)
-- ─────────────────────────────────────────────────────────────────────

\echo === V1: EXECUTE grants на is_admin, is_mentor_for (ожидание: обе t) ===
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants g
    WHERE g.specific_schema = 'public' AND g.routine_name = p.proname
      AND g.grantee = 'authenticated' AND g.privilege_type = 'EXECUTE'
  ) AS auth_has_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('is_admin', 'is_mentor_for')
ORDER BY p.proname;

\echo === V2: deferred функции НЕ изменились (ожидание: все f) ===
\echo Ожидание: get_events_public, handle_new_user, increment_user_seeds — все auth_has_exec=f
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants g
    WHERE g.specific_schema = 'public' AND g.routine_name = p.proname
      AND g.grantee = 'authenticated' AND g.privilege_type = 'EXECUTE'
  ) AS auth_has_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('handle_new_user', 'get_events_public', 'increment_user_seeds')
ORDER BY p.proname;
