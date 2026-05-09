# BUG-PVL-COHORT-NULL-OVERWRITE — recon + план фикса

**Адресат:** VS Code Claude Code (executor).
**Автор:** стратег (claude.ai).
**Создано:** 2026-05-08.
**Источник:** cohort_id recon
[`2026-05-07_09_codeexec_cohort_id_recon.md`](2026-05-07_09_codeexec_cohort_id_recon.md).

## Контекст

Smoking gun: `services/pvlMockApi.js:622-628` `ensurePvlStudentInDb`
хардкодит `cohort_id: null, mentor_id: null` в upsert. После backfill
2026-05-07 (`UPDATE pvl_students SET cohort_id='11111111-…-101'`) при
следующем визите админа в PVL-учительскую upsert перезатрёт обратно
на NULL. Сейчас backfill держится (verified 2026-05-08 утром, 0 NULL,
22 в Поток 1) — значит никто не заходил с момента apply. До фикса —
бомба замедленного действия.

Задача — закрыть так, чтобы:
1. Backfill не регрессировал.
2. Новых студентов корректно прописывали в когорту.
3. Существующих — не перетирали, если в БД уже стоит правильное
   значение.

Read-only recon + план в файл. **НЕ apply, НЕ commit.**

## Что нужно

### 1. Прочитать `ensurePvlStudentInDb`

`services/pvlMockApi.js:622-628` (и контекст ±50 строк выше/ниже).

- Точный код функции.
- Откуда берётся `profile.cohortId` (если такое поле есть)?
- Откуда `mentor_id`?
- Когда функция вызывается (callers — 9 callsite'ов, упоминалось в
  предыдущем recon)?

### 2. Прочитать `pvlPostgrestApi.upsertPvlStudent`

`services/pvlPostgrestApi.js`. Точный endpoint, headers, body.

Особенно интересует:
- `Prefer: resolution=merge-duplicates`?
- `on_conflict=id`?
- Что происходит, если в payload **не передан** `cohort_id` /
  `mentor_id` — PostgREST с merge-duplicates **сохраняет** или
  **обнуляет** не-переданные поля?

В PostgreSQL merge-duplicates через `INSERT ... ON CONFLICT DO UPDATE
SET col = EXCLUDED.col` — обновляет только переданные колонки. Но
PostgREST может вести себя иначе — нужен факт, не предположение.

Проверить можно через psql:
```sql
-- Что генерит PostgREST для merge-duplicates на этой таблице?
-- Или посмотреть логи PostgREST/Postgres на одном тестовом запросе.
```

### 3. Найти `seedCohortIdToSqlUuid` (если такая функция есть)

В `pvlMockApi.js` или в seed-моделях. Если есть — это конвертер
`'cohort-2026-1'` → `'11111111-1111-1111-1111-111111111101'`.

Если нет — придётся либо хардкодить SQL UUID когорты, либо
полагаться на существующее значение в БД (вариант B ниже).

### 4. Спроектировать fix — два варианта на выбор

#### Вариант A — payload без cohort_id/mentor_id (минимальный)

Если PostgREST с merge-duplicates сохраняет не-переданные поля
(почти точно так — это стандартное поведение PG `ON CONFLICT DO
UPDATE`):

```diff
 await pvlPostgrestApi.upsertPvlStudent({
     id: sqlId,
     full_name: fullName,
     status: 'active',
-    cohort_id: null,
-    mentor_id: null,
 });
```

Минимум кода, минимум риска. Backfill в БД сохранится.

**Минус:** новые студенты, которых ещё нет в БД, после INSERT будут с
`cohort_id IS NULL` и не попадут в RPC `pvl_admin_progress_summary`.
Это **не регрессия** относительно текущего состояния (всё равно был
NULL), но не fix root cause.

#### Вариант B — корректная конверсия cohort_id

Если есть `seedCohortIdToSqlUuid` (или её можно реализовать):

```diff
 await pvlPostgrestApi.upsertPvlStudent({
     id: sqlId,
     full_name: fullName,
     status: 'active',
-    cohort_id: null,
-    mentor_id: null,
+    cohort_id: seedCohortIdToSqlUuid(profile.cohortId),
+    mentor_id: profile.mentorId ? seedMentorIdToSqlUuid(profile.mentorId) : null,
 });
```

Полный fix root cause: новые студенты сразу пропишутся в правильную
когорту.

**Минус:** требует существование (или реализации) конвертеров.

#### Гибрид — A + B

```diff
+    // Передаём cohort_id/mentor_id ТОЛЬКО если профиль их знает.
+    // Иначе оставляем существующее в БД (merge-duplicates).
+    const resolvedCohortId = profile.cohortId
+        ? seedCohortIdToSqlUuid(profile.cohortId)
+        : undefined;
+    const resolvedMentorId = profile.mentorId
+        ? seedMentorIdToSqlUuid(profile.mentorId)
+        : undefined;
+
     await pvlPostgrestApi.upsertPvlStudent({
         id: sqlId,
         full_name: fullName,
         status: 'active',
+        ...(resolvedCohortId !== undefined ? { cohort_id: resolvedCohortId } : {}),
+        ...(resolvedMentorId !== undefined ? { mentor_id: resolvedMentorId } : {}),
-        cohort_id: null,
-        mentor_id: null,
     });
```

Это **рекомендованный путь**, если конвертеры есть/можно сделать.

### 5. Что проверить перед apply

- Подтвердить через test-call (read-only): что PostgREST с
  merge-duplicates действительно щадит не-переданные поля. Можно
  через psql эмуляцию или локальный smoke. Это критично для всех
  трёх вариантов.

## Что вернуть

План в файл:
```
docs/_session/2026-05-08_08_codeexec_bug_pvl_cohort_plan.md
```

Структура:
- Section 1: Текущий код `ensurePvlStudentInDb` целиком.
- Section 2: Текущий код `upsertPvlStudent` + headers/Prefer.
- Section 3: Поведение PostgREST merge-duplicates с не-переданными
  полями (factual, не гипотеза).
- Section 4: Существует ли `seedCohortIdToSqlUuid` (и friends)?
  Если нет — что нужно для реализации.
- Section 5: Предлагаемый diff — выбор Варианта A / B / гибрид с
  обоснованием.
- Section 6: Список callsite'ов `ensurePvlStudentInDb` (9 штук) —
  затрагивает ли каждый из них cohort_id/mentor_id, или только
  `id`/`full_name`.
- Section 7: Smoke-план — как проверить, что fix работает (например,
  под админ-JWT через UI зайти в PVL → проверить, что в БД
  cohort_id остался прежним).
- Section 8: Rollback — git revert single commit.

**НЕ apply.** Жду 🟢 после ревью.
