-- database/pvl/migrations/2026-05-30_phase42_pvl_cohort_certification_open.sql
--
-- phase42 — admin-тумблер «Приём сертификационных завтраков» по когорте (Этап 2).
-- Добавляет pvl_cohorts.certification_open boolean NOT NULL DEFAULT false.
-- Все существующие когорты стартуют ЗАКРЫТЫМИ: фича катится на прод готовой-
-- закрытой, Ольга (admin) открывает приём вручную в нужный день. Переиспользуется
-- на будущие потоки (у каждой когорты свой флаг).
--
-- Базируется на ТЗ _171 (стратег) + recon/dryrun _172 (codeexec).
--
-- RLS НЕ ТРОГАЕМ — recon _172 показал, что на pvl_cohorts RLS УЖЕ включён и
-- уже есть полный корректный набор политик, ровно покрывающий требования ТЗ §3:
--   • pvl_cohorts_select_all          SELECT TO authenticated USING (true)
--       (+ RESTRICTIVE pvl_cohorts_active_access_guard_select has_platform_access)
--       → члены когорты (active-access authenticated) читают флаг приёма;
--   • pvl_cohorts_update_admin        UPDATE TO authenticated USING/CHECK is_admin()
--       → менять certification_open может ТОЛЬКО admin (то, что нужно);
--   • pvl_cohorts_insert_admin / _delete_admin — write тоже admin-only;
--   • pvl_cohorts_active_access_guard_write RESTRICTIVE ALL has_platform_access.
-- web_anon грантов/политик на pvl_cohorts нет — флаг не уходит в public.
--
-- Grants НЕ меняем: ensure_garden_grants() уже грантит full CRUD на pvl_cohorts;
-- add-колонки грантов не требует (table-level GRANT покрывает новые колонки),
-- net authenticated grants остаётся 166. В конце — SELECT ensure_garden_grants()
-- ради idempotent-грантов (страховка от Timeweb daily wipe ~13:08 UTC) +
-- NOTIFY pgrst 'reload schema' (чтобы новая колонка появилась в PostgREST API).
--
-- Apply (gen_user, single-transaction, как phase40):
--   scp database/pvl/migrations/2026-05-30_phase42_pvl_cohort_certification_open.sql \
--       root@5.129.251.56:/tmp/
--   ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
--     PGPASSWORD="$DB_PASS" PGSSLMODE="$DB_SSLMODE" PGSSLROOTCERT="$DB_SSLROOTCERT" \
--     psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
--     -v ON_ERROR_STOP=1 -f /tmp/2026-05-30_phase42_pvl_cohort_certification_open.sql'
--   # после apply (опц.): ssh root@5.129.251.56 /opt/garden-monitor/recover_grants.sh
--   #   ожидание AUTH_CNT=166 / ANON_CNT=4, exit 0

\set ON_ERROR_STOP on

BEGIN;

-- ── 1. SCHEMA: флаг приёма по когорте ──────────────────────────────────
ALTER TABLE public.pvl_cohorts
  ADD COLUMN certification_open boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pvl_cohorts.certification_open IS
  'Тумблер приёма сертификационных завтраков (Этап 2). DEFAULT false = приём закрыт; существующие когорты после миграции ЗАКРЫТЫ намеренно — фича катится готовой-закрытой, admin открывает вручную (phase42, 2026-05-30).';

-- ── 2. Grants idempotent + PostgREST schema reload (тело proc'а НЕ меняем) ──
SELECT public.ensure_garden_grants();

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- VERIFY (вне транзакции)
-- ─────────────────────────────────────────────────────────────────────

\echo === V1: колонка certification_open добавлена ===
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='pvl_cohorts'
  AND column_name='certification_open';
-- ожидание: certification_open | boolean | NO | false

\echo === V2: все существующие когорты ЗАКРЫТЫ ===
SELECT count(*) AS total, count(*) FILTER (WHERE certification_open) AS open_cnt
FROM public.pvl_cohorts;
-- ожидание: total=2, open_cnt=0

\echo === V3: RLS без изменений (t) + 6 политик на месте ===
SELECT relrowsecurity AS rls_enabled FROM pg_class WHERE oid='public.pvl_cohorts'::regclass;
SELECT count(*) AS policies FROM pg_policy WHERE polrelid='public.pvl_cohorts'::regclass;
-- ожидание: t / 6

\echo === V4: net authenticated grants (ожидание 166 — без изменений) ===
SELECT count(*) AS authenticated_grants
FROM information_schema.role_table_grants
WHERE grantee='authenticated' AND table_schema='public';
