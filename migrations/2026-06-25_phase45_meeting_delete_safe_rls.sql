-- migrations/2026-06-25_phase45_meeting_delete_safe_rls.sql
--
-- Безопасное удаление встречи ведущей — enforcement на уровне RLS.
-- См. docs/_session/2026-06-25_205_codeexec_meeting_delete_safe_diff.md
--
-- Контекст:
--   Ведущая может удалять СВОЮ встречу (RLS «Users can delete own meetings»,
--   USING auth.uid() = user_id). UI скрывает кнопку для completed/с семенами,
--   сервис-слой (dataService.deleteMeeting) тоже гардит. Эта миграция
--   продавливает гард в БД, чтобы его нельзя было обойти прямым PostgREST
--   DELETE: удаляемо только status <> 'completed' И seeds_awarded не true.
--
-- Контракт (1 ALTER POLICY, дёшево, без миграции данных):
--   USING (auth.uid() = user_id
--          AND status <> 'completed'
--          AND COALESCE(seeds_awarded, false) = false)
--
-- Не трогает: имя политики, роли ({public}), GRANT'ы, триггер
--   on_meeting_change_sync_event (он сам снимает зеркало в events на DELETE),
--   admin-delete (его в проде нет — см. BACKLOG MEETING-ADMIN-DELETE-ANY).
--
-- Идемпотентна: повторный ALTER переустанавливает то же выражение.
-- Apply: scp + psql под gen_user, \set ON_ERROR_STOP on, \i этот файл.

\set ON_ERROR_STOP on

BEGIN;

ALTER POLICY "Users can delete own meetings." ON public.meetings
  USING (
    auth.uid() = user_id
    AND status <> 'completed'
    AND COALESCE(seeds_awarded, false) = false
  );

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- VERIFY (вне транзакции)
-- ─────────────────────────────────────────────────────────────────────

\echo === V1: USING политики содержит гард status/seeds ===
SELECT pg_get_expr(polqual, polrelid) AS using_expr
FROM pg_policy
WHERE polname = 'Users can delete own meetings.'
  AND polrelid = 'public.meetings'::regclass;
-- ожидание: (((auth.uid() = user_id) AND (status <> 'completed'::text))
--            AND (COALESCE(seeds_awarded, false) = false))
