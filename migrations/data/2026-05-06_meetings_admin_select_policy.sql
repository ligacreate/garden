-- Garden — admin SELECT bypass policy на meetings.
-- Дата: 2026-05-06
--
-- Контекст:
--   До SEC-001 (2026-05-03) PostgREST коннектился под gen_user
--   (owner) БЕЗ role-switch на JWT. Owner bypass'ит RLS → админская
--   статистика в Garden (вкладка «Статистика» в AdminPanel.jsx,
--   через api.getAllMeetings → SELECT * FROM meetings) видела ВСЕ
--   meetings всех ведущих.
--
--   После SEC-001 включён JWT-role-switch → запросы Ольги
--   (role='admin') пошли под authenticated → RLS-policies на
--   meetings (only owner: `auth.uid() = user_id`) ограничили
--   видимость её собственными meetings (всего 2 шт).
--
--   Симптом «статистика пропала» был с 2026-05-03, заметили
--   2026-05-06 при работе над FEAT-002. Не регрессия FEAT-002,
--   давний скрытый баг.
--
-- Решение:
--   Добавить SELECT-policy с admin-bypass через is_admin() helper
--   (создан phase 17, SECURITY DEFINER, читает profiles.role).
--   Это даёт админам видимость ВСЕХ meetings без затрагивания
--   writes (INSERT/UPDATE/DELETE остаются owner-only by design).
--
-- Не трогает:
--   - existing policies (Users can {view,insert,update,delete} own
--     meetings) остаются как есть, новая policy добавляется поверх
--     (PostgreSQL RLS — OR между policies одного command'а);
--   - GRANT'ы на meetings — phase 16 даёт authenticated full CRUD,
--     не меняем;
--   - admin writes на meetings — отдельная задача, если когда-то
--     понадобится (сейчас admin не должен случайно править чужие
--     meetings из админ-flow).
--
-- Apply: psql под gen_user, прогнан стратегом 2026-05-06.
--
-- Связано:
--   plans/BACKLOG.md (История 2026-05-06)
--   migrations/2026-05-03_phase16_grant_role_switch_bulk.sql (GRANT'ы)
--   migrations/2026-05-03_phase17_grant_execute_rls_helpers.sql (is_admin)
--   views/AdminPanel.jsx (AdminStatsDashboard)
--   services/dataService.js (getAllMeetings)

\set ON_ERROR_STOP on

BEGIN;

CREATE POLICY meetings_select_admin
ON public.meetings
FOR SELECT
USING (public.is_admin());

NOTIFY pgrst, 'reload schema';

COMMIT;

-- VERIFY (вне транзакции)

\echo === Policy meetings_select_admin создана ===
SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expr
FROM pg_policy
WHERE polrelid = 'public.meetings'::regclass
  AND polname = 'meetings_select_admin';
-- ожидание: 1 строка, USING (is_admin())
