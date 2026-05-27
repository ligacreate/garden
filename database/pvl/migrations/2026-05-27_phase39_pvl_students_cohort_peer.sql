-- database/pvl/migrations/2026-05-27_phase39_pvl_students_cohort_peer.sql
--
-- phase39 — peer-видимость pvl_students для участниц курса (cohort peer).
--
-- Закрывает gap в phase38: до этой миграции RLS на pvl_students пускал
-- только own/mentor/admin (политика pvl_students_select_own_or_mentor_or_admin).
-- listMyCohortPeers() из frontend Сессии 2 под applicant'ом возвращал
-- только свою row.
--
-- Добавляет PERMISSIVE SELECT через is_pvl_cohort_peer(id) — фильтр
-- role='applicant' уже встроен в helper (см. phase38).
--
-- Apply:
--   ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
--     PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
--     -v ON_ERROR_STOP=1 -f /tmp/2026-05-27_phase39_pvl_students_cohort_peer.sql'
--
-- recover_grants.sh / ensure_garden_grants() — НЕ обновляются:
-- phase39 не добавляет таблиц / GRANT'ов, только новую POLICY.
-- AUTH_CNT остаётся 166.

\set ON_ERROR_STOP on

BEGIN;

CREATE POLICY pvl_students_select_cohort_peer
  ON pvl_students FOR SELECT TO authenticated
  USING (is_pvl_cohort_peer(id));

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- VERIFY (вне транзакции)
-- ─────────────────────────────────────────────────────────────────────

\echo === V1: новая политика создана ===
SELECT polname, polcmd
FROM pg_policy
WHERE polrelid = 'pvl_students'::regclass
  AND polname = 'pvl_students_select_cohort_peer';
-- ожидание: 1 строка, polcmd='r' (SELECT)

\echo === V2: count policies on pvl_students ===
SELECT count(*) AS pvl_students_policies
FROM pg_policy
WHERE polrelid = 'pvl_students'::regclass;
-- ожидание: было 6 (active_access_guard_select/write, delete_admin,
-- insert_admin, select_own_or_mentor_or_admin, update_admin) → стало 7

\echo === V3: под applicant Ириной — видит peer-applicant'ов своей когорты ===
SET ROLE authenticated;
SET request.jwt.claim.sub = '35019374-d7de-4900-aa9d-1797bcca9769'; -- Ирина Петруня
SELECT count(*) AS irina_sees_total FROM pvl_students;
-- ожидание: все applicant'ы её когорты (cohort id 11111111-...-101)
-- — intern'ы той же когорты НЕ видны (helper фильтрует role='applicant').
RESET ROLE;
