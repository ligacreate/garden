-- migrations/data/2026-05-07_pvl_students_cohort_backfill.sql
--
-- Backfill pvl_students.cohort_id для активной когорты ПВЛ 2026 Поток 1.
--
-- Контекст: smoking gun — services/pvlMockApi.js:622-628 хардкодит
-- cohort_id: null в ensurePvlStudentInDb. Все 22 активных студента
-- имеют cohort_id IS NULL. Без backfill RPC pvl_admin_progress_summary
-- возвращает [] для любого p_cohort_id → FEAT-017 frontend пуст.
--
-- ВНИМАНИЕ: backfill регрессирует при следующем визите админа в PVL,
-- пока хардкод не исправлен (BUG-PVL-COHORT-NULL-OVERWRITE в backlog).
-- При проявлении регрессии — повторить эту миграцию.
--
-- Apply:
--   ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
--     PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
--     -v ON_ERROR_STOP=1 -f /tmp/2026-05-07_pvl_students_cohort_backfill.sql'

\set ON_ERROR_STOP on

BEGIN;

-- Snapshot до:
\echo === Pre-backfill: students по cohort_id ===
SELECT cohort_id, count(*) FROM public.pvl_students GROUP BY 1 ORDER BY 1 NULLS FIRST;

-- Backfill: все NULL → единственная активная когорта.
-- Идемпотентно через WHERE cohort_id IS NULL.
UPDATE public.pvl_students
SET cohort_id = '11111111-1111-1111-1111-111111111101'
WHERE cohort_id IS NULL;

-- Snapshot после:
\echo === Post-backfill: students по cohort_id ===
SELECT cohort_id, count(*) FROM public.pvl_students GROUP BY 1 ORDER BY 1 NULLS FIRST;

-- Sanity: RPC вернёт > 0 студентов (проверим вне транзакции под gen_user
-- через альтернативу — see verify ниже).

COMMIT;
