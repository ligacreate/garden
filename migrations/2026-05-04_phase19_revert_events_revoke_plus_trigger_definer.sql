-- migrations/2026-05-04_phase19_revert_events_revoke_plus_trigger_definer.sql
--
-- SEC-001 phase 19 — hot-fix регрессии phase 18 + архитектурный фикс trigger'а.
--
-- ИНЦИДЕНТ:
--   Phase 18 (2026-05-04) REVOKE'нула INSERT/UPDATE/DELETE на public.events
--   от authenticated, чтобы закрыть ANOM-002/SEC-011 (events writes
--   wide-open). Архитектурное предположение: "events пишутся ТОЛЬКО
--   через trigger sync_meeting_to_event под owner-ролью".
--
--   Это предположение оказалось НЕВЕРНЫМ:
--   1. trigger sync_meeting_to_event() имеет prosecdef=f (SECURITY
--      INVOKER) — выполняется под ролью caller'а, не owner'а.
--      При UPDATE meetings под authenticated trigger пытается
--      INSERT/UPDATE/DELETE в events ТОЖЕ под authenticated → 42501.
--   2. Фронт ДОПОЛНИТЕЛЬНО делает PATCH /events напрямую (не только
--      через meetings+trigger) — подтверждено через Claude in Chrome.
--
--   Симптомы у пользователей:
--   - Ведущая обновляет meeting → toast "Ошибка обновления встречи"
--     (вся транзакция откатывается из-за trigger 42501).
--   - PATCH /events напрямую падает 42501 на REVOKE.
--
-- РЕШЕНИЕ (две части в одной транзакции):
--   1. Revert REVOKE — GRANT INSERT/UPDATE/DELETE на events для
--      authenticated. Восстанавливаем доступ, который phase 18 убрала.
--   2. ALTER FUNCTION sync_meeting_to_event() SECURITY DEFINER —
--      попутный архитектурный фикс (бесплатно в той же миграции).
--      Trigger будет выполняться под gen_user, что соответствует
--      изначальному дизайн-намерению.
--   3. SET search_path = public для функции — defense-in-depth для
--      DEFINER-функции (предотвращает search_path attacks).
--
-- ⚠️ ANOM-002/SEC-011 СНОВА ОТКРЫТА (временно):
--   После phase 19 у authenticated есть полный CRUD на events,
--   а RLS-policies на events — все USING/WITH CHECK = true.
--   Любой залогиненный может переписать/удалить произвольное событие
--   через PATCH/DELETE /events напрямую. Это сознательный временный
--   шаг для разблокировки пользователей.
--
--   Окончательное закрытие — phase 20 (узкие RLS-policies на events
--   через JOIN на meetings.user_id; либо через trigger-only
--   архитектуру, если фронт перепишут на meetings-only writes).
--
-- Связанные документы:
--   migrations/2026-05-04_phase18_meetings_anon_read_revoke_events_writes.sql
--   plans/BACKLOG.md — ANOM-002/SEC-011, phase 20 задача
--
-- Apply: psql под gen_user, \set ON_ERROR_STOP on, \i этот файл.
-- Verify-блок ниже исполнится после COMMIT.

\set ON_ERROR_STOP on

BEGIN;

-- ── PART 1: revert phase 18 REVOKE ──
GRANT INSERT, UPDATE, DELETE ON public.events TO authenticated;

-- ── PART 2: trigger в SECURITY DEFINER + safe search_path ──
ALTER FUNCTION public.sync_meeting_to_event() SECURITY DEFINER;
ALTER FUNCTION public.sync_meeting_to_event() SET search_path = public;

-- ── PART 3: PostgREST schema cache reload ──
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- VERIFY (вне транзакции)
-- ─────────────────────────────────────────────────────────────────────

\echo === V1: authenticated writes на events восстановлены (ожидание: 4 строки) ===
SELECT privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'events' AND grantee = 'authenticated'
ORDER BY privilege_type;

\echo === V2: sync_meeting_to_event теперь DEFINER + search_path=public ===
\echo Ожидание: is_definer=t, proconfig содержит search_path=public
SELECT proname, prosecdef AS is_definer, proconfig
FROM pg_proc
WHERE proname = 'sync_meeting_to_event';
