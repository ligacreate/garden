# 🟢 backfill cohort_id + PUSH phase 25

**Адресат:** VS Code Claude Code (executor).
**Автор:** стратег (claude.ai).
**Создано:** 2026-05-07.
**Источники:**
- apply-отчёт phase 25: [`2026-05-07_07_codeexec_phase25_apply_report.md`](2026-05-07_07_codeexec_phase25_apply_report.md)
- cohort_id recon: [`2026-05-07_09_codeexec_cohort_id_recon.md`](2026-05-07_09_codeexec_cohort_id_recon.md)

## Контекст

Phase 25 commit `66c7c0e` лежит локально, не push'нут. Все 22
`pvl_students.cohort_id IS NULL`. Recon показал smoking gun —
хардкод `cohort_id: null` в `pvlMockApi.js:622-628`. Backfill
регрессирует при будущих визитах админа, пока хардкод не исправлен,
но это **отдельная задача**, не блокирующая FEAT-017 frontend smoke.

## Шаг 1 — 🟢 apply backfill data-миграции

Под `gen_user` через ssh+psql. Это data-UPDATE без DDL, RUNBOOK 1.3
(`ensure_garden_grants`) **не нужен** — Timeweb wipe срабатывает
только на DDL.

### Создать файл

```
migrations/data/2026-05-07_pvl_students_cohort_backfill.sql
```

### Содержимое (готов к apply)

```sql
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
```

### Apply-команда

```bash
scp migrations/data/2026-05-07_pvl_students_cohort_backfill.sql \
    root@5.129.251.56:/tmp/

ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
  PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
  -v ON_ERROR_STOP=1 -f /tmp/2026-05-07_pvl_students_cohort_backfill.sql'
```

### Verify после apply

```sql
-- Под gen_user, read-only.

-- V1: распределение
SELECT cohort_id, count(*)
FROM public.pvl_students
GROUP BY 1
ORDER BY 1 NULLS FIRST;
-- Ожидание: 22 строки на '11111111-...-101', 0 NULL

-- V2: GRANT counts (DML не должен задевать, но проверим)
SELECT
  (SELECT count(*) FROM information_schema.role_table_grants
     WHERE grantee='authenticated' AND table_schema='public') AS auth,
  (SELECT count(*) FROM information_schema.role_table_grants
     WHERE grantee='web_anon' AND table_schema='public') AS anon;
-- Ожидание: 158 / 4

-- V3 (sanity FEAT-017 readiness): какие counts соберёт
-- pvl_admin_progress_summary, если бы вызывался под admin.
-- Эмулируем агрегатом read-only:
SELECT count(*) AS students_in_target_cohort
FROM public.pvl_students
WHERE cohort_id = '11111111-1111-1111-1111-111111111101';
-- Ожидание: 22
```

## Шаг 2 — commit backfill локально

После apply:

```bash
git add migrations/data/2026-05-07_pvl_students_cohort_backfill.sql
git commit -m "$(cat <<'EOF'
data: backfill pvl_students.cohort_id для активной когорты Поток 1

Все 22 активных студента имели cohort_id IS NULL — следствие
хардкода null в pvlMockApi.js:622-628 ensurePvlStudentInDb.
Backfill открывает RPC pvl_admin_progress_summary для FEAT-017
(возвращал [] для любого p_cohort_id из-за NULL).

ВНИМАНИЕ: регрессирует при следующем визите админа в PVL до
исправления хардкода (BUG-PVL-COHORT-NULL-OVERWRITE).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

После commit вернуть `git status` + `git log -2 --oneline`.

## Шаг 3 — 🟢 PUSH

После того как backfill commit локально:

```bash
git push origin main
```

Должно пройти fast-forward с 2 commit'ами: phase 25 (`66c7c0e`) +
backfill data-migration (новый hash).

Вернуть raw output `git push` + `git log -2 --oneline`.

## Что НЕ делаем сейчас

- **Fix хардкода `ensurePvlStudentInDb`** (`pvlMockApi.js:622-628`) —
  отдельный тикет `BUG-PVL-COHORT-NULL-OVERWRITE` в backlog.
  Следующая сессия. Замена `cohort_id: null` на правильную
  конверсию (`seedCohortIdToSqlUuid(profile.cohortId)` или эквивалент).
- **FEAT-017 frontend** — следующая сессия после хардкод-фикса.
- **INFRA-N** (cache-headers) — следующая сессия.

## После завершения шагов 1-3

Стратег обновит:
- `garden/plans/BACKLOG.md` (добавить BUG-PVL-COHORT-NULL-OVERWRITE
  + другие новые тикеты сегодня)
- memory `project-garden.md` (snapshot 2026-05-07)
- HANDOVER 2026-05-07 в `docs/journal/`
