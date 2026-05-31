# Диагностика 2026-05-28 — JWT-impersonation Василины, mentor view пуст

**Адресат:** Ольга (связной) → стратег.
**Автор:** VS Code Claude Code (codeexec).
**Дата:** 2026-05-28.
**Режим:** read-only. psql под `gen_user`, `SET LOCAL ROLE authenticated` + `SET LOCAL "request.jwt.claims"`. Никаких UPDATE/INSERT/DELETE. Все запросы в `BEGIN; … ROLLBACK;`.

**JWT:** `{"sub":"6cf385c3-5d4b-44dc-bcf1-6aa17d50bac7","role":"authenticated"}` (Василина Лузина).

---

## TL;DR — Вердикт (b)

**Server-side ПОЛНОСТЬЮ работает под её JWT.** Все таблицы, которые читает frontend для mentor view, под её JWT возвращают данные:

- `pvl_garden_mentor_links` — 3 линка (Лилия/Марина/Ольга Р.) ✅
- `pvl_students` — 3 строки (active/active/applicant) ✅
- `profiles` — 58 строк всего, 3 menti все role=applicant ✅
- `pvl_student_content_progress` — 47/22/51 строк ✅
- `pvl_student_homework_submissions` — 5/3/6 строк ✅
- `pvl_checklist_items` — 20/9/19 строк ✅
- `is_mentor_for(каждая menti)` = true ✅
- `has_platform_access(Василина)` = true ✅
- `is_admin()` = false ✅

**Bug — на frontend.** RLS, GRANTы, RPC, миграции phase39 peer-discovery — НЕ затронуты регрессией. Нужны DevTools-сигналы у Василины (см. §6).

---

## Замечание про UUID

В ТЗ Ольги UUID были даны в формате `d302b93d-…-526dfe8c4a15` — первые 8 и последние 12, середина многоточием. Это запутало: при первом запуске я подставил **придуманные** середины (`b8a4-4a2f-9d99` и т.п.) — `WHERE … IN (3 uuid)` возвращал 0 rows из-за несовпадения, что выглядело бы как «bug в RLS». При перепроверке через `WHERE mentor_id = Василина` я узнал реальные UUID из БД и перезапустил downstream-проверки.

**Полные реальные UUID:**

| Имя             | UUID                                   |
|-----------------|----------------------------------------|
| Лилия Мaлонг    | `d302b93d-5d29-4787-82d3-526dfe8c4a15` |
| Марина Шульга   | `d128a7a3-2c1d-4ba9-92fa-cd72d69f9837` |
| Ольга Разжигаева| `90c9b7c7-db13-41bd-b393-49d79fc571b1` |

Передаю их явно — пусть стратег обновит свой recon-индекс на полные значения.

---

## Технический нюанс impersonation

`SELECT auth.uid()` напрямую под `SET LOCAL ROLE authenticated` падает с
`permission denied for schema auth` — role `authenticated` имеет `EXECUTE`
на `auth.uid()`, но **не имеет** `USAGE` на схему `auth`. Это не баг
prod'а: PostgREST использует RLS-полиси, где `auth.uid()` зовётся
внутри policy expression (компилирована owner'ом схемы), а **не** через
прямой `SELECT auth.uid()` из клиентских запросов.

Поэтому везде ниже вместо `auth.uid()` использовал явный UUID Василины,
а helper-функции `public.has_platform_access(…)`, `public.is_admin()`,
`public.is_mentor_for(…)` — `SECURITY DEFINER` (проверено в pg_proc),
они работают как из RLS, так и из прямого SELECT.

---

## 1. Baseline под JWT Василины

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"6cf385c3-5d4b-44dc-bcf1-6aa17d50bac7","role":"authenticated"}';

SELECT public.has_platform_access('6cf385c3-…'::uuid);
-- has_access | t

SELECT public.is_admin();
-- is_admin | f
```

Verdict: **gate-функции пропускают её.** `*_active_access_guard_select` (RLS policy on every PVL table) даёт зелёный свет.

---

## 2. Главный тест — `pvl_garden_mentor_links` под её JWT

### 2.1. RLS policy

```
pvl_garden_mentor_links_select_own_or_mentor_or_admin:
  (student_id = auth.uid()) OR (mentor_id = auth.uid()) OR is_admin()
```

### 2.2. Запрос «как фронт делал бы по mentor_id»

```sql
SELECT student_id, mentor_id, updated_at
FROM pvl_garden_mentor_links
WHERE mentor_id = '6cf385c3-5d4b-44dc-bcf1-6aa17d50bac7'::uuid;
```

| student_id                             | mentor_id                              | updated_at                 |
|----------------------------------------|----------------------------------------|----------------------------|
| d302b93d-5d29-4787-82d3-526dfe8c4a15   | 6cf385c3-…                             | 2026-04-16 09:33:01.678+03 |
| d128a7a3-2c1d-4ba9-92fa-cd72d69f9837   | 6cf385c3-…                             | 2026-04-17 16:19:22.896+03 |
| 90c9b7c7-db13-41bd-b393-49d79fc571b1   | 6cf385c3-…                             | 2026-05-18 14:33:38.086+03 |

**3 строки.** Полностью совпадает с тем что recon _140 видел под gen_user. RLS под её JWT режет до её же 3-х линков (count(*) total visible = 3).

### 2.3. Запрос «как фронт реально делает» (`listGardenMentorLinksByStudentIds`)

REST: `GET /pvl_garden_mentor_links?student_id=in.(d302..,d128..,90c9..)`

SQL-эмуляция:

```sql
SELECT student_id, mentor_id, updated_at
FROM pvl_garden_mentor_links
WHERE student_id IN (
  'd302b93d-5d29-4787-82d3-526dfe8c4a15',
  'd128a7a3-2c1d-4ba9-92fa-cd72d69f9837',
  '90c9b7c7-db13-41bd-b393-49d79fc571b1'
);
```

**3 строки** (те же что в 2.2). Verdict: ✅ RLS пускает, endpoint целиком возвращает её 3 menti.

---

## 3. Цепочка SELECT'ов фронта — все под её JWT

### 3.1. `services/pvlPostgrestApi.js#listStudentContentProgress`

REST: `GET /pvl_student_content_progress?student_id=eq.{X}`

```sql
SELECT student_id, count(*) FROM pvl_student_content_progress
WHERE student_id IN (3 menti) GROUP BY student_id;
```

| student_id                             | rows |
|----------------------------------------|------|
| 90c9b7c7-db13-41bd-b393-49d79fc571b1   | 47   |
| d128a7a3-2c1d-4ba9-92fa-cd72d69f9837   | 22   |
| d302b93d-5d29-4787-82d3-526dfe8c4a15   | 51   |

**RLS** `pvl_student_content_progress_select_own_or_mentor_or_admin`:
`(student_id = auth.uid()) OR is_admin() OR is_mentor_for(student_id)`.
`is_mentor_for(каждая)` = true (см. §3.4). Verdict: ✅.

### 3.2. `services/pvlPostgrestApi.js#listStudentHomeworkSubmissions`

```sql
SELECT student_id, count(*) FROM pvl_student_homework_submissions
WHERE student_id IN (3 menti) GROUP BY student_id;
```

| student_id                             | subs |
|----------------------------------------|------|
| 90c9b7c7-…                             | 5    |
| d128a7a3-…                             | 3    |
| d302b93d-…                             | 6    |

Verdict: ✅.

### 3.3. `services/pvlPostgrestApi.js#listStudentChecklistItems` + `getStudentCourseProgress`

```
pvl_checklist_items:          d302=19, d128=9, 90c9=20
pvl_student_course_progress:  d302=1   (Марина и Ольга Р. — 0 строк в этой таблице)
```

`pvl_student_course_progress` пустота для Марины/Ольги Р. — **не баг RLS**: проверял отдельно под gen_user — там тоже нет записей по ним. Это исторически — старая система course progress, заменена `pvl_student_content_progress` (§3.1).

### 3.4. `is_mentor_for(каждая menti)` под её JWT

```sql
SELECT public.is_mentor_for('d302..'::uuid);  -- t (Лилия)
SELECT public.is_mentor_for('d128..'::uuid);  -- t (Марина)
SELECT public.is_mentor_for('90c9..'::uuid);  -- t (Ольга Р.)
```

Все три = true. Это даёт ей доступ ко всем downstream-таблицам менти через RLS-полиси, которые проверяют `is_mentor_for(student_id)`.

---

## 4. `pvl_students` + `profiles` — данные и роли

### 4.1. `pvl_students` под её JWT

```sql
SELECT id, full_name, cohort_id, status FROM pvl_students
WHERE id IN (3 menti);
```

| id                                     | full_name        | cohort_id                              | status    |
|----------------------------------------|------------------|----------------------------------------|-----------|
| d128a7a3-…                             | Марина Шульга    | 11111111-…-111111111101                | active    |
| d302b93d-…                             | Лилия Мaлонг     | 11111111-…-111111111101                | active    |
| 90c9b7c7-…                             | Ольга Разжигаева | 11111111-…-111111111101                | applicant |

**3 строки.** RLS `pvl_students_select_own_or_mentor_or_admin` пускает через `is_mentor_for(id) = true`. Регрессии phase39 peer-discovery нет — `is_pvl_cohort_peer` тут даже не дёргается, потому что предыдущая клаузла `is_mentor_for` уже даёт true.

**Нюанс:** Ольга Разжигаева — `pvl_students.status = 'applicant'`, остальные две `active`. На RLS это не влияет (полиси по status не фильтруют). На фронте `getMentorMentees` (pvlMockApi.js:3208) фильтрует только seed-demo IDs, по status не режет. То есть **не источник пустоты UI у Василины**.

### 4.2. `profiles` под её JWT (для `dataService.getUsers`)

`services/dataService.js#getUsers` (dataService.js:1568) делает `GET /profiles?select=*`. RLS `profiles_active_access_guard_select`:
`(id = auth.uid()) OR has_platform_access(auth.uid())`.
`has_platform_access(Василина) = true` → пускает любые profiles.

```sql
SELECT count(*) FROM profiles;
-- 58
```

**58 строк всего.** Из них её 3 menti:

| id                                     | name             | role      |
|----------------------------------------|------------------|-----------|
| d128a7a3-…                             | Марина Шульга    | applicant |
| 90c9b7c7-…                             | Ольга Разжигаева | applicant |
| d302b93d-…                             | Лилия Мaлонг     | applicant |

**Все три role=applicant** — корректно, никто не «провалился» в intern/student/etc. Не сходит с пути hydrate.

---

## 5. ВЕРДИКТ — где bug

### (b) Все RLS возвращают данные → bug на frontend.

Server-side под её JWT отдаёт ВСЁ:

- линки (3)
- pvl_students (3)
- profiles (58 total, 3 menti с role=applicant)
- content_progress (47/22/51)
- homework_submissions (5/3/6)
- checklist_items (20/9/19)

Это **исключает** все server-side гипотезы:
- ❌ RLS pvl_garden_mentor_links под её JWT — работает.
- ❌ has_platform_access — true.
- ❌ Регрессия phase39 peer-discovery — нет, основная клаузла `is_mentor_for` пропускает.
- ❌ Роль menti изменена — все три applicant, как и было.

Гипотеза **H3 из recon _140** теперь самая правдоподобная: frontend в момент mount Василининого `/mentor/dashboard` имеет **пустой/stale `db.studentProfiles`**, из-за чего:

```js
// services/pvlMockApi.js:1122
async function hydrateGardenMentorAssignmentsFromDb() {
    const ids = [...new Set((db.studentProfiles || []).map(...).filter(isUuidString))];
    if (ids.length === 0) return;  // ← молча выходит
    const rows = await pvlPostgrestApi.listGardenMentorLinksByStudentIds(ids);
    ...
}
```

Альтернативно — `getMentorMentees` (pvlMockApi.js:3208) фильтрует
`db.studentProfiles.filter(p => menteeIds.has(p.userId))` — если линки
загружены, но `db.studentProfiles` пуст (`getUsers` не вернул профили
или вернул урезанный список) — результат всё равно 0.

---

## 6. Что запросить у Василины (DevTools)

**Запрос Ольге** — передать Василине, попросить открыть DevTools на `/mentor/dashboard` (или где у неё mentor view):

### 6.1. **Network tab** (отфильтровать по `skrebeyko`)
1. `GET https://api.skrebeyko.ru/profiles?select=*` — какой **status code** и сколько объектов в JSON response (должно быть ~58)?
2. `GET https://api.skrebeyko.ru/pvl_garden_mentor_links?student_id=in.(…)` — какой status, какое значение `?student_id=in.(…)` в URL (есть ли там её 3 UUID), какой response?
3. **Если запросов вообще нет** — это сигнал: `hydrateGardenMentorAssignmentsFromDb` молча вышел из-за `ids.length === 0`.

### 6.2. **Application → Local Storage** (origin `liga.skrebeyko.ru`)
1. Ключ `pvl_users_swr_v1`: содержимое (parsed JSON `{ ts, d: [...] }`) — сколько объектов в массиве `d`? Есть ли там Лилия `d302b93d-…`, Марина `d128a7a3-…`, Ольга Р. `90c9b7c7-…`?
2. Ключ `garden_currentUser`: чей user, role какая, есть ли `access_status`?
3. Ключ `garden_users` (или похожее): какой объём?

### 6.3. **Console**
1. Любые ошибки `[PVL]` (особенно `[PVL] hydrate_mentor_links failed`, `[PVL] mentor link:`).
2. MON-001 события (`error reporter`).
3. Сетевые `401`/`403`/`5xx`.

### 6.4. **Application → Service Workers**
1. Активный `SW_VERSION` — совпадает ли с актуальным `2026-05-27-pvl-etap1-own-page-button-fix` (или новее)?
2. Если version старая — `unregister` + reload (но это лечение, а не диагноз).

---

## 7. Что я НЕ делал

- ⛔ Не модифицировал данные (всё в `BEGIN; … ROLLBACK;`).
- ⛔ Не трогал RLS / GRANTы — всё корректно.
- ⛔ Не пытался «починить» через SQL под её JWT.
- ⛔ Не делал deploy, не бампал sw.js.

Жду от стратега решения: ловим живые DevTools (предпочтительно), либо
делать «слепой» fix по H3 (например, дефенсивный retry в
`hydrateGardenMentorAssignmentsFromDb` если `db.studentProfiles`
оказался пустой при первом проходе).
