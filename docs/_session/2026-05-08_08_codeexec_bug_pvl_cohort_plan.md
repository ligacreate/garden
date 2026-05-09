# BUG-PVL-COHORT-NULL-OVERWRITE — план фикса

**Адресат:** стратег (claude.ai).
**Автор:** VS Code Claude Code (executor).
**Создано:** 2026-05-08.
**Источник:** [`2026-05-08_07_strategist_bug_pvl_cohort_recon_prompt.md`](2026-05-08_07_strategist_bug_pvl_cohort_recon_prompt.md)
**Статус:** план готов, ожидает 🟢 на apply. Apply / commit **не делал**.

---

## TL;DR

- Корень бага подтверждён: `ensurePvlStudentInDb` в `services/pvlMockApi.js:622-628`
  отправляет в upsert payload `cohort_id: null, mentor_id: null` всегда,
  безусловно. PostgREST с `resolution=merge-duplicates` транслирует это в
  `ON CONFLICT (id) DO UPDATE SET cohort_id=NULL, mentor_id=NULL` — backfill
  затирается на каждом визите админа.
- Все нужные хелперы уже есть: `seedCohortIdToSqlUuid` ([pvlMockApi.js:187](../../services/pvlMockApi.js#L187))
  и `uuidOrNull` ([pvlMockApi.js:177](../../services/pvlMockApi.js#L177)).
  Ничего нового реализовывать не надо.
- `db.studentProfiles[].cohortId` (seed-style, например `'cohort-2026-1'`)
  и `db.studentProfiles[].mentorId` (UUID или мок-id вроде `u-men-1`) —
  доступны изнутри функции по `userId`.
- Рекомендованный путь — **гибрид** (вариант A+B по prompt'у): передавать
  `cohort_id` / `mentor_id` в payload **только** если резолвинг даёт
  валидное значение, иначе опускать поле — merge-duplicates сохранит
  существующее значение в БД.
- Callsites `ensurePvlStudentInDb`: насчитал **8** (стратег говорил 9 —
  возможно, посчитал warn-line как 9-й; в bare-callsites — 8). Все
  передают только `userId` / `studentId`, ни один не передаёт cohort/mentor
  — значит fix полностью локализуется внутри функции, без правок callers.

---

## 1. Текущий код `ensurePvlStudentInDb` целиком

[`services/pvlMockApi.js:603-634`](../../services/pvlMockApi.js#L603-L634):

```js
/**
 * Гарантирует строку в pvl_students для Garden UUID (= тот же id, что profiles.id).
 * Ранняя синхронизация из Сада — только для абитуриентов; иначе — при записи submission/прогресса/вопроса.
 * Без этого INSERT в pvl_student_* с FK на pvl_students падает, если строку не создали вручную.
 */
async function ensurePvlStudentInDb(userId) {
    if (!pvlPostgrestApi.isEnabled()) return;
    const sqlId = studentSqlIdByUserId(userId);
    if (!sqlId) return;
    if (pvlStudentSyncedToDb.has(sqlId)) return;

    // ARCH-012 hotfix: ensure делает upsert в pvl_students, но RLS на этой
    // таблице — admin-only (phase 11.1). Под mentor/student любая попытка —
    // 403 → 200+ console-warns за сессию. Раздаём только админу; для
    // остальных return. Архитектурный fix (убрать ensure-loop с клиента) —
    // отдельной задачей.
    const currentUser = readGardenCurrentUserFromStorage();
    const pvlRole = resolvePvlRoleFromGardenProfile(currentUser);
    if (pvlRole !== 'admin') return;

    pvlStudentSyncedToDb.add(sqlId);
    const user = (db.users || []).find((u) => String(u.id) === String(userId));
    const fullName = user?.fullName || user?.name || 'Участница';
    try {
        await pvlPostgrestApi.upsertPvlStudent({
            id: sqlId,
            full_name: fullName,
            status: 'active',
            cohort_id: null,    // ← bug: затирает backfill
            mentor_id: null,    // ← bug: затирает backfill
        });
    } catch (err) {
        pvlStudentSyncedToDb.delete(sqlId);
        // eslint-disable-next-line no-console
        console.warn('[PVL DB] ensurePvlStudentInDb failed for', sqlId, String(err?.message || err));
    }
}
```

Замечания по логике:
- Гейт по `pvlRole !== 'admin'` (ARCH-012 hotfix): означает, что баг
  triggers ТОЛЬКО при заходе админа. Ученицы/менторы upsert не запускают.
  Это объясняет, почему backfill 2026-05-07 ещё держится (verified
  2026-05-08 утром) — никто из админов не заходил после backfill'а.
- `pvlStudentSyncedToDb` — Set в памяти текущей сессии, защищает от
  повторных upsert'ов в одну сессию. Но **между сессиями** не помогает:
  при следующем логине админа Set пуст, цикл upsert повторится. Это и
  есть таймер бомбы.
- Никакой логики разрешения `cohort_id` нет — `null` хардкодом.

## 2. Текущий код `upsertPvlStudent` + headers/Prefer

[`services/pvlPostgrestApi.js:510-518`](../../services/pvlPostgrestApi.js#L510-L518):

```js
async upsertPvlStudent(payload) {
    const rows = await request('pvl_students', {
        method: 'POST',
        params: { on_conflict: 'id' },
        body: [payload],
        prefer: 'resolution=merge-duplicates,return=representation',
    });
    return asArray(rows)[0] || null;
},
```

Через [`request()`](../../services/pvlPostgrestApi.js#L65) формируется HTTP-запрос:

```
POST https://api.skrebeyko.ru/pvl_students?on_conflict=id
Authorization: Bearer <admin JWT>
Content-Type: application/json
Prefer: resolution=merge-duplicates,return=representation

[{"id":"<uuid>", "full_name":"...", "status":"active", "cohort_id":null, "mentor_id":null}]
```

## 3. Поведение PostgREST `resolution=merge-duplicates` для не-переданных полей

### Factual (по официальной документации PostgREST)

Документация PostgREST ([Upsert / Bulk insertion](https://postgrest.org/en/stable/references/api/tables_views.html#upsert)):

> By using the `Prefer: resolution=merge-duplicates` header, all duplicate
> rows will be updated with the values in the body. Other rows will be
> inserted.

«Updated **with the values in the body**» — ключевое. PostgREST
транслирует POST с `resolution=merge-duplicates` в SQL вида:

```sql
INSERT INTO pvl_students (id, full_name, status, cohort_id, mentor_id)
VALUES (...)
ON CONFLICT (id)
DO UPDATE SET
    full_name = EXCLUDED.full_name,
    status    = EXCLUDED.status,
    cohort_id = EXCLUDED.cohort_id,    -- ← null, если в payload null
    mentor_id = EXCLUDED.mentor_id;    -- ← null, если в payload null
```

При этом — и это критическая часть для нашего фикса — в SET-клозе
**только колонки, явно присутствующие в body**. Если поле в payload не
передано (отсутствует ключ), PostgREST не включает его в INSERT-list и в
DO UPDATE SET — существующее значение в строке остаётся нетронутым.
Стандартное поведение PostgreSQL `INSERT ... ON CONFLICT DO UPDATE SET`.

### Подтверждение из кодовой базы

В кодовой базе уже есть случаи, где этот pattern работает корректно. Например,
[`upsertCourseWeek`](../../services/pvlPostgrestApi.js#L483-L490) передаёт только нужные колонки и не
обнуляет остальные. Никаких признаков bypass'а merge-duplicates семантики
в коде нет.

### Предупреждение

Эта секция — **factual based on docs + PG semantics**, не результат
живого smoke-теста. Полная гарантия — после apply'а сделать одну
проверку: вручную обновить admin-сессию в браузере, дождаться, пока
прошёл upsert, прочитать строку из `pvl_students` через `psql` или
PostgREST GET — `cohort_id` должен остаться `'11111111-…-101'`. См.
секцию 7 (Smoke-план).

## 4. Хелперы для резолвинга

### `seedCohortIdToSqlUuid` — ✅ существует

[`services/pvlMockApi.js:187-192`](../../services/pvlMockApi.js#L187-L192):

```js
function seedCohortIdToSqlUuid(seedOrSql) {
    if (seedOrSql == null || seedOrSql === '') return null;
    const s = String(seedOrSql).trim();
    if (isUuidString(s)) return s;
    return PVL_SEED_COHORT_TO_SQL_UUID[s] || null;
}
```

Карта ([L158-160](../../services/pvlMockApi.js#L158-L160)):

```js
const PVL_SEED_COHORT_TO_SQL_UUID = Object.freeze({
    'cohort-2026-1': '11111111-1111-1111-1111-111111111101',
});
```

Поведение:
- `seedCohortIdToSqlUuid(null)` → `null`
- `seedCohortIdToSqlUuid('')` → `null`
- `seedCohortIdToSqlUuid('cohort-2026-1')` → `'11111111-…-101'`
- `seedCohortIdToSqlUuid(<UUID>)` → возвращает тот же UUID
- `seedCohortIdToSqlUuid('garbage')` → `null`

### `uuidOrNull` — ✅ существует (для mentor_id)

[`services/pvlMockApi.js:177-179`](../../services/pvlMockApi.js#L177-L179):

```js
function uuidOrNull(v) {
    return isUuidString(v) ? String(v).trim() : null;
}
```

Хелпера `seedMentorIdToSqlUuid` нет — и не нужен. `mentor_id` в БД —
UUID (Garden auth user.id). Мок-mentorы (`u-men-1` и т.п.) не должны
писаться в pvl_students — это сломает FK / UUID-validation. Через
`uuidOrNull` мок-mentorов отфильтруем.

### `db.studentProfiles[].cohortId` / `mentorId` — доступны

`db.studentProfiles` — массив профилей с полями:
- `userId` — Garden user UUID или мок (`u-st-*`).
- `cohortId` — seed-style id, default `'cohort-2026-1'`.
- `mentorId` — UUID или мок (`u-men-1` и т.п.) или `null`.

Изнутри `ensurePvlStudentInDb(userId)` искать профиль так:

```js
const profile = (db.studentProfiles || []).find((p) => String(p.userId) === String(userId));
```

Этот pattern уже используется по всей кодовой базе ([L973](../../services/pvlMockApi.js#L973),
[L1175](../../services/pvlMockApi.js#L1175), [L1786](../../services/pvlMockApi.js#L1786)).

## 5. Предлагаемый diff — гибрид (вариант A+B)

Выбор: **гибрид**. Обоснование — все условия для варианта B выполнены
(хелперы есть, `profile.cohortId` доступен), но не для всех студентов
профиль резолвится — например, тестовая фикстура «Участница»
(`33333…01`, см. memory) живёт без profile/auth. Для таких — поведение
варианта A (опустить поле, не трогать существующее в БД).

### Diff

```diff
@@ services/pvlMockApi.js
 async function ensurePvlStudentInDb(userId) {
     if (!pvlPostgrestApi.isEnabled()) return;
     const sqlId = studentSqlIdByUserId(userId);
     if (!sqlId) return;
     if (pvlStudentSyncedToDb.has(sqlId)) return;

     // ARCH-012 hotfix ...
     const currentUser = readGardenCurrentUserFromStorage();
     const pvlRole = resolvePvlRoleFromGardenProfile(currentUser);
     if (pvlRole !== 'admin') return;

     pvlStudentSyncedToDb.add(sqlId);
     const user = (db.users || []).find((u) => String(u.id) === String(userId));
     const fullName = user?.fullName || user?.name || 'Участница';
+
+    /**
+     * Резолвим cohort_id / mentor_id из studentProfiles, но **передаём в
+     * payload только если получили валидное значение**. Если для этого
+     * userId профиль не найден / cohort не маппится в SQL UUID / mentor
+     * не UUID — поле опускается, и PostgREST с merge-duplicates оставит
+     * текущее значение в БД нетронутым. Это закрывает
+     * BUG-PVL-COHORT-NULL-OVERWRITE: backfill cohort_id больше не
+     * затирается при заходе админа в PVL.
+     */
+    const profile = (db.studentProfiles || []).find((p) => String(p.userId) === String(userId));
+    const resolvedCohortId = profile?.cohortId ? seedCohortIdToSqlUuid(profile.cohortId) : null;
+    const resolvedMentorId = profile?.mentorId ? uuidOrNull(profile.mentorId) : null;
+
     try {
-        await pvlPostgrestApi.upsertPvlStudent({
-            id: sqlId,
-            full_name: fullName,
-            status: 'active',
-            cohort_id: null,
-            mentor_id: null,
-        });
+        const payload = {
+            id: sqlId,
+            full_name: fullName,
+            status: 'active',
+        };
+        if (resolvedCohortId) payload.cohort_id = resolvedCohortId;
+        if (resolvedMentorId) payload.mentor_id = resolvedMentorId;
+        await pvlPostgrestApi.upsertPvlStudent(payload);
     } catch (err) {
         pvlStudentSyncedToDb.delete(sqlId);
         console.warn('[PVL DB] ensurePvlStudentInDb failed for', sqlId, String(err?.message || err));
     }
 }
```

### Семантика по случаям

| Случай                                                       | profile.cohortId | profile.mentorId | resolvedCohortId | resolvedMentorId | payload содержит cohort_id? | mentor_id? | Результат                                       |
|--------------------------------------------------------------|------------------|------------------|------------------|------------------|----------------------------|------------|-------------------------------------------------|
| Активная ученица Поток 1, есть ментор-UUID                   | `'cohort-2026-1'` | `<UUID>`        | `'11111111-…-101'` | `<UUID>`        | ✅ да                      | ✅ да      | INSERT/UPDATE с правильными значениями          |
| Активная ученица Поток 1, мок-ментор `u-men-1`               | `'cohort-2026-1'` | `'u-men-1'`     | `'11111111-…-101'` | `null`          | ✅ да                      | ❌ нет     | cohort_id обновлён, mentor_id в БД сохранён     |
| Тест-фикстура «Участница» (`33333…01`), нет профиля          | —                | —                | `null`           | `null`           | ❌ нет                     | ❌ нет     | Только id/full_name/status — backfill сохранён  |
| Профиль есть, но cohortId не в карте (битый seed)            | `'cohort-?'`     | `null`           | `null`           | `null`           | ❌ нет                     | ❌ нет     | Backfill сохранён                               |
| Новый абитуриент с дефолтным cohortId                        | `'cohort-2026-1'` | `null`          | `'11111111-…-101'` | `null`          | ✅ да                      | ❌ нет     | cohort_id записан при INSERT                    |

Главное: **во всех случаях** `cohort_id: null` / `mentor_id: null` в
payload больше не уходит — backfill 2026-05-07 не регрессирует ни в одном
сценарии.

### Почему не «строгий» вариант B (всегда передавать)

В варианте B, если `seedCohortIdToSqlUuid(profile.cohortId)` вернёт
`null` (например, profile есть, но cohortId не маппится), мы получим
`cohort_id: null` в payload — снова regression. Гибрид это закрывает.

### Почему не вариант A (просто убрать поля)

Вариант A не отправляет cohort_id никогда. Тогда новых студентов,
которых ещё нет в БД, INSERT создаст с `cohort_id IS NULL` —
не-регрессия, но и не fix. Гибрид даёт обе стороны: backfill держится
+ новых корректно прописываем.

## 6. Callsite'ы `ensurePvlStudentInDb`

Найдено **8** вызовов (в одном файле — `services/pvlMockApi.js`,
вне его callsite'ов нет; в тестах не нашлось). Стратег говорил «9» —
видимо, считал и `console.warn` строку с упоминанием имени.

| L#   | Контекст                                                                                  | Что передаётся в `ensurePvlStudentInDb` | Затрагивает cohort/mentor? |
|------|-------------------------------------------------------------------------------------------|----------------------------------------|----------------------------|
| 743  | `syncTrackerAndHomeworkFromDb` — bulk early-ensure для абитуриентов                       | `s.userId` (из studentProfiles)        | Нет (только id/fullName)   |
| 1205 | `syncPvlActorsFromGarden` — после fetch'а из Сада, абитуриенты                            | `String(u.id)`                         | Нет                        |
| 1866 | `persistTrackerProgressToDb`                                                              | `studentId`                            | Нет                        |
| 1933 | `persistTrackerCheckToDb` (внутри `fireAndForget`)                                        | `studentId`                            | Нет                        |
| 1974 | `persistSubmissionToDb`                                                                   | `studentId`                            | Нет                        |
| 2088 | `persistContentProgressToDb` (внутри `fireAndForget`)                                     | `studentId`                            | Нет                        |
| 2524 | `markChecklistItem` (внутри `fireAndForget`)                                              | `studentId`                            | Нет                        |
| 3920 | `createStudentQuestion` (внутри `fireAndForget`)                                          | `studentId`                            | Нет                        |

**Вывод:** ни один callsite не передаёт cohort/mentor. Все правки —
**локально внутри `ensurePvlStudentInDb`**, callers не трогаем. 8/8.

## 7. Smoke-план (после apply, до 🟢 на закрытие тикета)

### 7.1 Up-front sanity (до того как админ зайдёт)

```sql
-- В psql на 5.129.251.56:
SELECT count(*) FILTER (WHERE cohort_id IS NULL) AS nulls,
       count(*) FILTER (WHERE cohort_id = '11111111-1111-1111-1111-111111111101') AS p1,
       count(*) AS total
FROM pvl_students;
-- ожидаем: nulls=0, p1=22, total=22 (текущее состояние)
```

### 7.2 Trigger upsert (зайти админом в PVL)

1. Залогиниться админом в Сад → перейти в PVL-учительскую (любую
   страницу, которая дёргает sync — обычно «Прогресс» или «Студенты»).
2. Подождать ~5 секунд (fireAndForget upsert'ы успели).
3. Открыть DevTools → Network → отфильтровать по `pvl_students` →
   убедиться, что POST'ы прошли с 200.
4. Прочитать payload одного из POST'ов в DevTools — должен **не
   содержать** ключей `cohort_id`, `mentor_id` (либо содержать
   правильный UUID, никак не `null`).

### 7.3 Verify в БД (главный тест)

```sql
-- Тот же запрос, что в 7.1 — после визита админа:
SELECT count(*) FILTER (WHERE cohort_id IS NULL) AS nulls,
       count(*) FILTER (WHERE cohort_id = '11111111-1111-1111-1111-111111111101') AS p1
FROM pvl_students;
-- ожидаем: nulls=0, p1=22 (без изменений)
```

Если `nulls > 0` — фикс не сработал, **немедленный rollback** (см.
секцию 8) и повторная диагностика.

### 7.4 Положительный кейс (новый абитуриент)

Если в течение сессии в Сад зарегистрировался новый абитуриент трека —
проверить, что после визита админа:

```sql
SELECT id, full_name, cohort_id, mentor_id FROM pvl_students WHERE id = '<new uuid>';
```

`cohort_id` должен быть `'11111111-…-101'`, не NULL.

### 7.5 Отрицательный кейс (тест-фикстура)

Тест-фикстура «Участница» (`33333…01`, см. memory) — без профиля.
Проверить:

```sql
SELECT cohort_id FROM pvl_students WHERE id = '33333333-3333-3333-3333-333333333301';
-- ожидаем: то же значение, что было до визита админа (текущее
-- состояние — `null`, поскольку backfill туда не клал; должно
-- остаться `null`).
```

## 8. Rollback

```bash
git revert <fix commit sha>
git push origin main
```

После revert — backfill снова станет уязвим. Перед revert'ом
зафиксировать текущее состояние:

```sql
SELECT count(*) FILTER (WHERE cohort_id IS NULL) AS nulls,
       count(*) FILTER (WHERE cohort_id = '11111111-1111-1111-1111-111111111101') AS p1
FROM pvl_students;
```

Если revert делается потому что smoke 7.3 показал regression — после
revert'а backfill **уже потерян** (записи затёрлись на NULL). В этом
случае: повторно выполнить backfill 2026-05-07 (`UPDATE pvl_students SET
cohort_id='11111111-…-101' WHERE …`), потом думать, почему фикс не
сработал.

## Чего НЕ делал (по prompt'у)

- Apply (правок в `services/pvlMockApi.js` нет — только в этом плане).
- Commit / push.
- Живой smoke-тест на prod-БД.
- Не рефакторил `ensurePvlStudentInDb` сверх минимально-нужного (ARCH-012
  hotfix-комментарий на месте, гейт по pvlRole сохранён).

## Открытые вопросы для стратега

1. **Smoke-тест перед apply.** Стоит ли мне сделать читающий smoke
   (одиночный POST через `psql` или PostgREST GET, чтобы факт
   merge-duplicates на этой конкретной таблице/версии PostgREST зафиксировать
   эмпирически)? Док-доказательство в секции 3 — сильное, но не 100%.
2. **Включить ли в этот же commit тест?** В кодовой базе нашёл несколько
   test-файлов — стоит ли добавить unit-тест на `ensurePvlStudentInDb`,
   который мокает `pvlPostgrestApi.upsertPvlStudent` и проверяет, что
   `cohort_id` в payload присутствует только когда нужно? Или отдельный
   тикет.
3. **Архитектурный fix.** ARCH-012 hotfix предполагает, что вся ensure-loop
   с клиента — anti-pattern (admin-only RLS, etc.). Этот фикс — точечный,
   bомба обезврежена, но архитектура остаётся хрупкой. Нужен ли отдельный
   тикет на «убрать ensure-loop с клиента полностью» (например, через DB
   trigger или admin-only sync-job)?
