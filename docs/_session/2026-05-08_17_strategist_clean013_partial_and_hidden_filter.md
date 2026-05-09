# Cleanup CLEAN-013 partial + frontend hidden-filter

**Адресат:** VS Code Claude Code (executor).
**Автор:** стратег (claude.ai).
**Создано:** 2026-05-08.

🟢 на оба шага. Один commit (или два логически разделённых
сообщения). Push сразу — frontend-патч + data-миграция, не DDL.

## Шаг 1 — Frontend filter через `hiddenGardenUserIds`

Цель: дашборд FEAT-017 уважает существующий «глазик»-механизм
(localStorage `hiddenGardenUserIds`). Ольга кликает «глазик» в
users-табе → скрытые исчезают и из «Прогресс ПВЛ».

### Правки

**`views/AdminPanel.jsx`** — передать проп:

```diff
-{tab === 'pvl-progress' && (
-    <AdminPvlProgress />
-)}
+{tab === 'pvl-progress' && (
+    <AdminPvlProgress hiddenIds={hiddenGardenUserIds} />
+)}
```

**`views/AdminPvlProgress.jsx`** — принять проп + фильтр:

```diff
-export default function AdminPvlProgress() {
+export default function AdminPvlProgress({ hiddenIds = [] }) {
```

В `useMemo visibleRows` — добавить фильтр **первым**, до stateFilter
и сортировки:

```diff
 const visibleRows = useMemo(() => {
-    let out = rows;
+    let out = rows;
+    if (hiddenIds?.length) {
+        out = out.filter(r => !hiddenIds.includes(String(r.student_id)));
+    }
     if (stateFilter !== 'all') out = out.filter(r => r.state_line === stateFilter);
     ...
-}, [rows, sort, stateFilter]);
+}, [rows, sort, stateFilter, hiddenIds]);
```

То же самое в `useMemo` для `totals` — пересчитать без скрытых:

```diff
-const totals = useMemo(() => buildTotals(rows), [rows]);
+const totals = useMemo(() => {
+    const visible = hiddenIds?.length
+        ? rows.filter(r => !hiddenIds.includes(String(r.student_id)))
+        : rows;
+    return buildTotals(visible);
+}, [rows, hiddenIds]);
```

Это нужно, чтобы счётчики и GroupProgressBar тоже показывали
**только видимых**.

## Шаг 2 — Data-migration cleanup CLEAN-013 (3 удаления)

Удаляем полностью (profile + auth + pvl_students + связи) для:

| UUID | ФИО |
|---|---|
| `1431f70e-63bd-4709-803a-5643540fc759` | LIlia MALONG (дубль) |
| `3746da91-5c66-4e91-9966-15643136dae6` | Рита |
| `49c267b1-7ef6-48f6-bb2f-0e6741491b90` | Екатерина Салама |

**НЕ трогаем** Настина фея (`1085e06d-…`) и Настин фиксик
(`1b10d2ef-…`) — Ольга их оставит как тест-окружение, скроет через
«глазик» отдельно (UI-действие, не наша зона).

### Файл миграции

`migrations/data/2026-05-08_cleanup_clean013_partial.sql`:

```sql
-- migrations/data/2026-05-08_cleanup_clean013_partial.sql
--
-- Cleanup CLEAN-013 partial: 3 пользователя.
--
-- Логика повторяет public.admin_delete_user_full(uuid) — DELETE из
-- всех связанных таблиц: pvl_garden_mentor_links, pvl_students
-- (CASCADE → pvl_student_*), users_auth, profiles. Audit-запись
-- остаётся в pvl_audit_log по дизайну (audit-trail integrity).
--
-- Не удаляем (Ольга 2026-05-08): Настина фея, Настин фиксик —
-- оставлены как тест-окружение Насти, будут скрыты через
-- localStorage hiddenGardenUserIds («глазик» в Garden AdminPanel).
--
-- Apply:
--   ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
--     PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
--     -v ON_ERROR_STOP=1 -f /tmp/2026-05-08_cleanup_clean013_partial.sql'

\set ON_ERROR_STOP on

BEGIN;

\echo === Pre-cleanup ===
SELECT count(*) AS pvl_students FROM pvl_students;
SELECT count(*) AS profiles FROM profiles WHERE id IN (
  '1431f70e-63bd-4709-803a-5643540fc759',
  '3746da91-5c66-4e91-9966-15643136dae6',
  '49c267b1-7ef6-48f6-bb2f-0e6741491b90'
);

-- Audit BEFORE delete (3 записи)
INSERT INTO public.pvl_audit_log (
  id, actor_user_id, action, entity_type, entity_id, payload, created_at
)
SELECT
  gen_random_uuid()::text,
  NULL::text,  -- системная миграция, не от лица админа
  'cleanup_clean013_partial',
  'profile',
  uuid_id::text,
  jsonb_build_object(
    'summary', 'Cleanup CLEAN-013 partial (стратег decision 2026-05-08)',
    'deleted_user_id', uuid_id
  ),
  now()
FROM (VALUES
  ('1431f70e-63bd-4709-803a-5643540fc759'::uuid),
  ('3746da91-5c66-4e91-9966-15643136dae6'::uuid),
  ('49c267b1-7ef6-48f6-bb2f-0e6741491b90'::uuid)
) AS t(uuid_id);

-- Защитный DELETE из pvl_garden_mentor_links (FK не объявлен).
DELETE FROM pvl_garden_mentor_links
WHERE student_id IN (
  '1431f70e-63bd-4709-803a-5643540fc759',
  '3746da91-5c66-4e91-9966-15643136dae6',
  '49c267b1-7ef6-48f6-bb2f-0e6741491b90'
)
   OR mentor_id IN (
  '1431f70e-63bd-4709-803a-5643540fc759',
  '3746da91-5c66-4e91-9966-15643136dae6',
  '49c267b1-7ef6-48f6-bb2f-0e6741491b90'
);

-- DELETE pvl_students (CASCADE снесёт pvl_student_*)
DELETE FROM pvl_students WHERE id IN (
  '1431f70e-63bd-4709-803a-5643540fc759',
  '3746da91-5c66-4e91-9966-15643136dae6',
  '49c267b1-7ef6-48f6-bb2f-0e6741491b90'
);

-- DELETE users_auth
DELETE FROM users_auth WHERE id IN (
  '1431f70e-63bd-4709-803a-5643540fc759',
  '3746da91-5c66-4e91-9966-15643136dae6',
  '49c267b1-7ef6-48f6-bb2f-0e6741491b90'
);

-- DELETE profiles (последним, потому что users_auth/pvl_students могут
-- иметь FK не объявлены, но логически profiles — корневая)
DELETE FROM profiles WHERE id IN (
  '1431f70e-63bd-4709-803a-5643540fc759',
  '3746da91-5c66-4e91-9966-15643136dae6',
  '49c267b1-7ef6-48f6-bb2f-0e6741491b90'
);

\echo === Post-cleanup ===
SELECT count(*) AS pvl_students FROM pvl_students;
SELECT count(*) AS profiles_left FROM profiles WHERE id IN (
  '1431f70e-63bd-4709-803a-5643540fc759',
  '3746da91-5c66-4e91-9966-15643136dae6',
  '49c267b1-7ef6-48f6-bb2f-0e6741491b90'
);
-- ожидание: pvl_students=14 (17-3), profiles_left=0

COMMIT;
```

## Apply + commit

1. Apply migration через ssh+psql.
2. Один commit с обоими изменениями (frontend + migration).

Сообщение коммита:

```
feat: hidden-filter в FEAT-017 + cleanup CLEAN-013 partial (3 user)

- Frontend: AdminPvlProgress принимает hiddenIds prop из
  hiddenGardenUserIds (localStorage). Скрытые через "глазик" в
  AdminPanel users-табе пользователи исчезают из дашборда +
  пересчитывают totals/GroupProgressBar.
- Data: cleanup CLEAN-013 partial — удалены LIlia MALONG (дубль),
  Рита, Екатерина Салама. Настина фея + Настин фиксик оставлены
  как тест-окружение Насти (Ольга скроет через "глазик").
- pvl_students: 17 → 14.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

3. Push сразу.

## Отчёт

В файл:
```
docs/_session/2026-05-08_18_codeexec_clean013_partial_apply.md
```

С commit hash, push результат, snapshot pvl_students до/после.

## После apply

Ольга:
1. Cmd+Shift+R на FEAT-017 → видит 14 строк (Настина фея ещё в списке).
2. В AdminPanel → users → находит Настина фея (`viktorovna7286@gmail.com`) и Настин фиксик (`zobyshka@gmail.com`) → жмёт «глазик» → скрывает.
3. Возвращается в FEAT-017 → видит **12 строк** (минус 2 скрытых).
4. Это и есть реальная картина Поток 1.
