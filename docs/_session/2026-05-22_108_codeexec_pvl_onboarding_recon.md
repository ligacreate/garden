# BUG-PVL-ONBOARDING-MISSING-STUDENT-RECORD — recon-отчёт

**От:** codeexec (VS Code Claude Code)
**Кому:** стратега (claude.ai) → Ольга
**Дата:** 2026-05-22
**В ответ на:** `_107_strategist_pvl_onboarding_recon.md`
**Тип:** Read-only recon. Никаких INSERT/UPDATE/DELETE/commit/push не делалось.

---

## TL;DR (8 строк)

1. **Создание `profiles` row** — единственная точка: `POST /auth/register` в [garden-auth/server.js:528-579](../../../garden-auth/server.js). Создаёт `users_auth` + `profiles` **БЕЗ транзакции** (два отдельных `pool.query` без BEGIN/COMMIT). Никаких других INSERT'ов в `profiles` в коде нет.
2. **INSERT'а в `pvl_students` в этом flow НЕТ вообще** — ни в garden-auth, ни через DB trigger (на `profiles` есть 4 UPDATE-trigger'а, ни одного AFTER INSERT).
3. **`ensurePvlStudentInDb` (frontend self-heal)** не сработал для Разжигаевой потому, что встроен ARCH-012 hotfix [services/pvlMockApi.js:614-616](../../services/pvlMockApi.js#L614-L616): если **текущий залогиненный пользователь** не admin — ранний `return`. Razzhigaeva-applicant логинилась сама → ensure для её же id бэйлил.
4. **RLS на `pvl_students` — admin-only INSERT** (POLICY `pvl_students_insert_admin WITH CHECK (is_admin())`). Любой не-admin INSERT/UPSERT → 403. Это и есть фундамент ARCH-012: client-side ensure на не-admin физически невозможен на уровне БД.
5. **Никаких `app_settings.current_cohort_id`** в БД не существует. `app_settings` — это key/value JSONB store, ключ `current_cohort_id` отсутствует. В `pvl_cohorts` — ровно 1 строка: `11111111-1111-1111-1111-111111111101` («ПВЛ 2026 Поток 1»). Дефолт надо хардкодить либо ставить через convention (newest by year/created_at).
6. **Audit orphan'ов: 33 profile-row'а** с `role IN ('applicant','intern','leader')` БЕЗ `pvl_students` row: 1 applicant (новая Суроватская, pending_approval), 14 interns, 18 leaders. В `pvl_students` сейчас 15 строк — ВСЕ с `profiles.role='applicant'`. Ни одного intern/leader.
7. **FK от `pvl_students.id` к `profiles.id` отсутствует** — связь держится на convention (ARCH-010). PK `pvl_students.id` — generated `gen_random_uuid()` по умолчанию, не связан с `profiles.id` на уровне схемы.
8. **Рекомендация: DB trigger** `AFTER INSERT ON profiles WHEN role IN ('applicant','intern','leader')` + одноразовый backfill 33 orphan'ов + (отдельной задачей P2) обернуть `/auth/register` в транзакцию. Обоснование — в секции «Recommendation».

---

## Section 1. Onboarding flow — кто создаёт `profiles` row

### 1.1 Единственная точка INSERT в `profiles`

[garden-auth/server.js:528-579](../../../garden-auth/server.js) — endpoint `POST /auth/register`:

```js
// строки 538-541: INSERT в users_auth
await pool.query(
  'insert into public.users_auth (id, email, password_hash, status) values ($1,$2,$3,$4)',
  [id, email, hash, 'active']
);

// строки 548-558: INSERT в profiles
await pool.query(
  `insert into public.profiles
     (id, email, name, city, role, status, access_status, seeds,
      dob, tree, tree_desc, x, y)
   values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
   on conflict (id) do update set email=excluded.email, name=excluded.name, city=excluded.city`,
  [id, email, name || null, city || null,
   'applicant', 'suspended', 'pending_approval', 0,
   dob || null, tree || null, tree_desc || treeDesc || null,
   x ?? null, y ?? null]
);
```

- **HTTP path:** `POST /auth/register`
- **Таблицы:** `users_auth` → `profiles` (две отдельные query, в этом порядке)
- **Транзакция:** ❌ **НЕТ.** Никаких `BEGIN`/`COMMIT` вокруг. (В `server.js` транзакции есть только в `/api/tg-bot/webhook` строка 435 и в reset-flow строки 745/825 — `/auth/register` транзакцию НЕ открывает.)
- **Role:** хардкод `'applicant'`. `access_status='pending_approval'`, `status='suspended'`.
- **Поведение при ошибке середины flow:** если `users_auth` INSERT прошёл, а `profiles` упал — остаётся «phantom auth-user» без profile. Текущий баг — другая половина: ОБЕ записи проходят, но `pvl_students` не создаётся вообще.
- **Прочие endpoint'ы:** проверено всё `app.post|get|put|patch|delete` — никаких иных INSERT'ов в `profiles` нет. Только UPDATE (`/auth/me` PATCH в /api/profile/*, role update в `dataService.updateUser` → PATCH /profiles).

### 1.2 Frontend register

[services/dataService.js:1277-1338](../../services/dataService.js#L1277) — `api.register(userData)`:
- Дёргает `authFetch('/auth/register', POST, payload)` → отдаёт всё backend'у атомарно.
- После ответа (если НЕ `pending_approval`) делает `_ensurePostgrestUser` + опциональный PATCH /profiles для tree/dob/x/y (legacy fallback, актуальные регистрации проходят `pending_approval` и сразу `return created` на строке 1305 — PATCH не делается).
- **Вызывается из:** [App.jsx:228](../../App.jsx#L228) `user = await api.register(authData)`.

### 1.3 Триггеры на `profiles INSERT`

```text
event_object_table | trigger_name                             | event_manipulation | timing
profiles           | on_profile_contacts_change_resync_events | UPDATE             | AFTER
profiles           | on_profile_status_change_resync_events   | UPDATE             | AFTER
profiles           | trg_reset_exempt_on_role_change          | UPDATE             | BEFORE
profiles           | trg_sync_status_from_access_status       | UPDATE             | BEFORE
pvl_students       | trg_pvl_students_updated_at              | UPDATE             | BEFORE
```

**Ни одного AFTER INSERT trigger'а на `profiles` нет.** Это и есть «дыра» — ничто не подхватывает создание profile-row для синхронизации в `pvl_students`.

---

## Section 2. `ensurePvlStudentInDb` — почему не сработал

### 2.1 Определение

[services/pvlMockApi.js:603-649](../../services/pvlMockApi.js#L603-L649):

```js
async function ensurePvlStudentInDb(userId) {
    if (!pvlPostgrestApi.isEnabled()) return;
    const sqlId = studentSqlIdByUserId(userId);
    if (!sqlId) return;
    if (pvlStudentSyncedToDb.has(sqlId)) return;

    // ARCH-012 hotfix: ensure делает upsert в pvl_students, но RLS на этой
    // таблице — admin-only (phase 11.1). Под mentor/student любая попытка —
    // 403 → 200+ console-warns за сессию. Раздаём только админу; для
    // остальных return.
    const currentUser = readGardenCurrentUserFromStorage();
    const pvlRole = resolvePvlRoleFromGardenProfile(currentUser);
    if (pvlRole !== 'admin') return;     // ← вот тут бэйлит для всех не-админов
    ...
    await pvlPostgrestApi.upsertPvlStudent(payload);
}
```

### 2.2 Callsites — 8 точек вызова

```
services/pvlMockApi.js:805   — в Promise.all для абитуриентов потока (sync)
services/pvlMockApi.js:1331  — syncPvlActorsFromGarden(): только applicant'ы
services/pvlMockApi.js:2030  — persistContentProgressToDb (write-callsite)
services/pvlMockApi.js:2097  — persistTrackerProgressToDb
services/pvlMockApi.js:2138  — markChecklistItem
services/pvlMockApi.js:2255  — persistDisputeToDb
services/pvlMockApi.js:2691  — persistStudentQuestionToDb
services/pvlMockApi.js:4087  — persistSubmissionToDb (это и был путь Razzhigaeva)
```

### 2.3 Почему НЕ сработал для Разжигаевой

Сценарий пошагово:
1. Razzhigaeva регистрируется → `/auth/register` создаёт `users_auth` + `profiles` (role='applicant'). `pvl_students` — **нет**.
2. Razzhigaeva логинится → SPA mount'ит `PvlPrototypeApp` → дёргает `syncPvlActorsFromGarden()`.
3. Внутри syncPvlActorsFromGarden строка 1331: для каждого applicant'а вызывается `ensurePvlStudentInDb(u.id)`.
4. Внутри ensure строка 615: `resolvePvlRoleFromGardenProfile(readGardenCurrentUserFromStorage())` — читает `localStorage.garden_currentUser`. Текущий юзер = Razzhigaeva = applicant → PVL-role `'student'`.
5. Строка 616: `if (pvlRole !== 'admin') return;` → бэйлит. **Никакой попытки INSERT не делается даже теоретически.**
6. Razzhigaeva открывает ДЗ, заполняет, нажимает «Сохранить» → persistSubmissionToDb (строка 4087) → опять ensurePvlStudentInDb → опять бэйлит.
7. `pvl_postgrest_api.upsertSubmission` → POST в `pvl_student_homework_submissions` с `student_id = Razzhigaeva-uuid` → FK violation `pvl_student_homework_submissions.student_id → pvl_students.id`.
8. Ошибка где-то поглощается на верхнем уровне → UI показывает «успешно» (или silent — нужен отдельный recon симптома, в этом scope не делал).

Дополнительный нюанс: даже **без** ARCH-012 hotfix'а INSERT бы упал на RLS (`pvl_students_insert_admin WITH CHECK (is_admin())`) — applicant физически не может INSERT'ить в `pvl_students`. То есть ensure-loop НЕ ЗАРАБОТАЛ БЫ, даже если убрать early-return; нужно либо service-role, либо менять RLS, либо переносить INSERT на серверный flow.

### 2.4 Кто заходит в учительскую — там ensure СРАБАТЫВАЕТ

Если **admin** (Ольга) логинится → `syncPvlActorsFromGarden` опять бежит, видит Razzhigaeva в `pvlTrackMembers` как applicant, дёргает `ensurePvlStudentInDb('razzhigaeva-id')` — на этот раз `pvlRole === 'admin'` → upsert проходит → `pvl_students` row создаётся. Это объясняет:
- почему уже есть 15 pvl_students rows для applicant'ов (Ольга заходила в админ-панель после их регистрации);
- почему новая Суроватская **сейчас** orphan — Ольга не заходила в учительскую после её регистрации.

То есть фактически клиентский «self-heal» делает админ за всех applicant'ов потока — но только если успеет до того, как applicant начнёт сдавать ДЗ. Это race-condition by design.

### 2.5 Связанный backlog: BUG-PVL-ENSURE-RESPECTS-ROLE (P2)

[BACKLOG.md строки 2130-2168](../../plans/BACKLOG.md#L2130). Контекст:
- Жалуется на обратную сторону: admin/mentor/intern (без applicant-роли) попадают в `pvl_students` как фейк-студенты при заходе в учительскую с любой write-операцией.
- Предлагает whitelist по role: `('applicant', 'student', 'intern_with_pvl_track')` — продуктовое решение.
- Альтернатива: DB-trigger BEFORE INSERT на `pvl_students` с проверкой `(SELECT role FROM profiles WHERE id = NEW.id)`.

**Пересечение с нашим bug'ом:** мы решаем обратную проблему (мало INSERT'ов), они — лишних. Если делаем DB-trigger по варианту 1 нашего recon'а — закрываем **оба** тикета одной миграцией: trigger AFTER INSERT ON profiles создаёт строку с правильной ролью; client-side ensure-loop становится не нужен → удаляется (закрывает ARCH-012); whitelist по role в самом trigger'е защищает от admin/mentor fake-rows (закрывает BUG-PVL-ENSURE-RESPECTS-ROLE).

---

## Section 3. Схема `pvl_students` и зависимости

### 3.1 Колонки и constraints

```
Column     | Type   | NOT NULL | Default
id         | uuid   | YES      | gen_random_uuid()    ← важно: НЕ FK к profiles
full_name  | text   | YES      | —                    ← единственное NOT NULL без default
cohort_id  | uuid   | NO       | —
mentor_id  | uuid   | NO       | —
status     | text   | YES      | 'active'             ← CHECK: applicant|active|paused|finished|certified
created_at | tstz   | YES      | now()
updated_at | tstz   | YES      | now()
```

CHECK: `status = ANY ('applicant','active','paused','finished','certified')`

### 3.2 Что заполнять автоматически в trigger'е

| колонка | source                                              |
|---------|-----------------------------------------------------|
| id      | `NEW.id` (профиля — convention pvl_students.id = profiles.id) |
| full_name | `COALESCE(NEW.name, NEW.email, 'Участница')`     |
| status  | `'active'` (дефолт) или `'applicant'` если хотим маркировать pre-зачисление |
| cohort_id | хардкод `'11111111-1111-1111-1111-111111111101'` ИЛИ `(SELECT id FROM pvl_cohorts ORDER BY year DESC NULLS LAST, created_at DESC LIMIT 1)` |
| mentor_id | NULL (назначается админом позже) |

### 3.3 FK от `pvl_students.id`

**Никакого** — нет FK к `profiles.id`. Связка держится на convention (это ARCH-010, ниже). PK `pvl_students.id` имеет default `gen_random_uuid()`, что само по себе не мешает передать туда `profiles.id` (PostgreSQL примет переданное значение и обойдёт default).

### 3.4 Зависимости — что cascade-deletes от `pvl_students.id`

7 child-таблиц с `ON DELETE CASCADE`:
- `pvl_checklist_items`
- `pvl_student_certification_scores`
- `pvl_student_content_progress`
- `pvl_student_course_points`
- `pvl_student_course_progress`
- `pvl_student_disputes`
- `pvl_student_homework_submissions` ← FK который и упал у Разжигаевой

Без `pvl_students` row — НИ ОДНУ из этих 7 таблиц студент использовать не может. ДЗ — только один из 7 симптомов.

### 3.5 RLS policies (важно)

```
pvl_students_insert_admin  : FOR INSERT WITH CHECK (is_admin())
pvl_students_update_admin  : FOR UPDATE USING (is_admin())
pvl_students_delete_admin  : FOR DELETE USING (is_admin())
pvl_students_select_own_or_mentor_or_admin : FOR SELECT
                              USING ((id = auth.uid()) OR is_admin() OR is_mentor_for(id))
+ active_access_guard       : RESTRICTIVE USING (has_platform_access(auth.uid()))
```

**Ключ:** INSERT доступен **только** admin'у. Client-side ensure под applicant — гарантированный 403 даже без ARCH-012 hotfix'а. DB trigger выполняется с правами owner'а функции (если SECURITY DEFINER) и обходит RLS — это правильный механизм для server-side INSERT.

---

## Section 4. `app_settings.current_cohort_id`

**Расхождение с брифом:** `app_settings` — это **key/value JSONB store**, а не таблица с колонкой `current_cohort_id`.

Текущая схема:
```
Column     | Type  | Default
key        | text  | (PK)
value      | jsonb | '{}'
updated_at | tstz  | now()
```

Сейчас в таблице **ровно одна строка**:
```
key              | value
library_settings | {"hiddenCourses": [], "materialOrder": {...}}
```

Никакого ключа `current_cohort_id` или подобного нет.

### Альтернативы для дефолта cohort_id в trigger'е

| вариант | детали | плюсы | минусы |
|---------|--------|-------|--------|
| (a) Хардкод UUID в trigger'е | `'11111111-1111-1111-1111-111111111101'` | просто, на проде сейчас всё равно 1 поток | надо менять trigger каждый поток |
| (b) Подзапрос `SELECT FROM pvl_cohorts ORDER BY year DESC NULLS LAST, created_at DESC LIMIT 1` | автоматически берёт «новейший» поток | не требует ручных правок при заведении нового потока | если новый поток создан раньше, чем надо — неверный assignment |
| (c) Завести строку `app_settings.key='pvl_current_cohort_id'` и читать её | явный контракт | требует UI для редактирования или manual psql | overhead на отдельную задачу |
| (d) Оставить `cohort_id = NULL` в trigger'е, проставлять админом вручную | минимум магии | новый студент попадёт в учительскую без cohort'а → теряется на cohort-фильтрах админки |

`pvl_cohorts` сейчас:
```
id                                   | title            | year | created_at
11111111-1111-1111-1111-111111111101 | ПВЛ 2026 Поток 1 | 2026 | 2026-04-09
```

Один поток на проде. Вариант **(a)** или **(b)** — оба рабочие сейчас. Это вопрос к Ольге (open question ниже).

---

## Section 5. Audit orphan'ов

### 5.1 Цифры

- `pvl_students` всего: **15** строк.
- Все 15 — с `profiles.role = 'applicant'` (никаких intern/leader).
- orphan reverse (pvl_students без profile): **0**.
- profiles с `role IN ('applicant','intern','leader')` БЕЗ pvl_students row: **33**.

### 5.2 Разбивка по ролям

| role      | count | примечание |
|-----------|-------|------------|
| applicant | 1     | Суроватская (новая, pending_approval — текущий потерпевший) |
| intern    | 14    | стажёры — большинство `join_date` 2026-02 |
| leader    | 18    | ведущие — `join_date` от 2019 до 2026-02 |

### 5.3 Полный список (для будущего backfill'а)

| email | role | access_status | join_date |
|-------|------|---------------|-----------|
| asurovatskaya26@gmail.com | applicant | pending_approval | — |
| soboleva.yanna@yandex.ru | intern | active | 2026-02-16 |
| bondarenko.lightlin@gmail.com | intern | active | 2026-02-16 |
| nbazhenova@mail.ru | intern | active | 2026-02-19 |
| muza_skorpi@mail.ru | intern | active | 2026-02-13 |
| dbbdb716…ru.traibl@gmail.com | intern | active | 2026-02-09 |
| I.am.yaroslava@mail.ru | intern | active | — |
| ivashova.0@yandex.ru | intern | active | 2026-02-15 |
| anastskoro@gmail.com | intern | active | 2026-02-19 |
| kulish-inn@yandex.ru | intern | active | 2026-02-15 |
| ruxshana_89@mail.ru | intern | active | 2026-02-16 |
| natali228@ya.ru | intern | active | 2026-03-01 |
| f1233488…e.yaroschuk@gmail.com | intern | active | — |
| zakirovas2008@rambler.ru | intern | active | 2026-03-01 |
| tatrusi@mail.ru | applicant | paused_manual | — |
| _… плюс 18 leader'ов_ | leader | active | разные годы |

(Полный список из 33 был получен — могу выгрузить отдельно при необходимости. Сейчас режу для краткости и privacy брифа.)

### 5.4 Интерпретация

- **Только 1 applicant** в orphans — потому что admin заходит в учительскую и client-side ensure отрабатывает за applicant'ов (race с регистрацией → новый pending_approval не успел).
- **14 interns orphans** — стажёры, которые промоутились из applicant → intern **до** того, как client-side ensure что-то создал. Либо были созданы до появления pvl_students-таблицы (миграция 2026-04?). Текущий код в `shouldEarlyEnsurePvlStudentRow` строка 594 — `if (effective === 'student' || effective === 'intern') return false;` — то есть для intern'ов early-ensure ВЫКЛЮЧЕН. Они получают pvl_students row **только** через write-callsite (ensure при сдаче ДЗ и т.п.). Если intern не сдаёт ДЗ → нет row. Если сдаёт и сам не admin — снова бэйл по строке 616 → silent fail.
- **18 leaders orphans** — большинство исторически старые (2019-2024). Скорее всего leader'ы не делают сейчас активного PVL, поэтому не страдают. **Спорный вопрос:** нужны ли им вообще pvl_students rows? Backlog ARCH-010 пункт «(c)» предлагает оставить convention и не FK'ать — что соответствует «нет, не нужны».

### 5.5 Что делать с orphan'ами при applied fix'е

Trigger AFTER INSERT решит только **будущие** регистрации. Для 33 текущих orphan'ов нужен **одноразовый backfill** в той же миграции:

```sql
-- pseudocode, не для apply
INSERT INTO pvl_students (id, full_name, status, cohort_id)
SELECT p.id, COALESCE(p.name, p.email, 'Участница'),
       'active',
       <дефолт cohort_id>
  FROM profiles p
  LEFT JOIN pvl_students ps ON ps.id = p.id
 WHERE p.role IN (<какие роли — продуктовое решение>)
   AND ps.id IS NULL;
```

⚠ Вопрос «какие роли backfill'ить» — продуктовый. Если только applicant — backfill всего 1 строки (Суроватская). Если applicant+intern — 15. Если все три — 33.

---

## Section 6. Связанные backlog тикеты

### 6.1 ARCH-010 — формализовать связь pvl_students ↔ profiles (P2)

[BACKLOG.md:991-1021](../../plans/BACKLOG.md#L991).

**Scope:** добавить FK `pvl_students.id → profiles(id)` (вариант a, строгий) ИЛИ колонку `profile_id` (вариант b) ИЛИ задокументировать convention (вариант c).

**Пересечение с нашим fix'ом:**
- Если делаем DB trigger — это де-факто **отвечает** на ARCH-010: convention `pvl_students.id = profiles.id` становится контрактом, который держит сам trigger. Можно одной миграцией:
  - сначала добавить FK `pvl_students.id REFERENCES profiles(id) ON DELETE CASCADE` (закрывает ARCH-010 вариант a);
  - затем CREATE TRIGGER на AFTER INSERT.
- Это закрывает ARCH-010 и BUG-PVL-ONBOARDING-MISSING-STUDENT-RECORD одной миграцией. **Конфликта нет**, скорее естественное объединение.

**Риск:** перед добавлением FK нужно убедиться что все 15 текущих `pvl_students.id` имеют соответствующую строку в `profiles` (это **уже проверено**: `orphan_pvl_students = 0`). FK добавится без ошибок.

### 6.2 ARCH-012 — убрать клиентский `ensurePvlStudentInDb` self-heal (P2, PARTIALLY DONE)

[BACKLOG.md:1023-1080](../../plans/BACKLOG.md#L1023).

**Scope:** удалить `ensurePvlStudentInDb` из `syncPvlActorsFromGarden` и 7 write-callsite'ов, заменить на server-side flow (trigger ИЛИ endpoint `/pvl/enroll`).

**Пересечение:** прямое. Если делаем DB trigger — client-side ensure становится не нужен и удаляется. Закрывает ARCH-012 полностью.

**Конфликт:** нет — это две стороны одной задачи (server-side создаёт → client-side удаляется).

### 6.3 BUG-PVL-ENSURE-RESPECTS-ROLE (P2)

[BACKLOG.md:2130-2168](../../plans/BACKLOG.md#L2130).

**Scope:** ensure не должен создавать row'ы для admin/mentor/curator — только для applicant/intern.

**Пересечение:** если делаем DB trigger с whitelist `WHEN role IN ('applicant','intern','leader')` — закрывает оба сценария:
- наш bug: applicant без row → создаём (включён в WHEN);
- их bug: admin/mentor получают fake-row при заходе в учительскую → больше не происходит (ensure-loop удалён, а trigger fire'ит только на whitelist role'ах).

**Конфликт:** нет. Усиливает оба fix'а.

---

## Section 7. Какие роли реально нуждаются в `pvl_students` row

### 7.1 Резолвер frontend → PVL role

[services/pvlRoleResolver.js:15-25](../../services/pvlRoleResolver.js#L15-L25):

```js
export function resolvePvlRoleFromGardenProfile(user) {
    ...
    if (source === ROLES.ADMIN) return 'admin';
    if (source === ROLES.MENTOR) return 'mentor';
    if (source === ROLES.APPLICANT) return 'student';
    if (source === ROLES.INTERN) return 'student';   // ← intern тоже student в PVL
    return 'no_access';
}
```

`leader`, `curator` НЕ маппятся → `no_access`. То есть с точки зрения PVL-API:
- **`pvl_students` row нужен:** applicant, intern (оба → PVL role `'student'`)
- **НЕ нужен:** admin, mentor, leader, curator

### 7.2 shouldEarlyEnsurePvlStudentRow

[services/pvlMockApi.js:590-596](../../services/pvlMockApi.js#L590-L596):

```js
function shouldEarlyEnsurePvlStudentRow(studentProfile) {
    if (!studentProfile?.userId) return false;
    const u = (db.users || []).find((x) => String(x.id) === String(studentProfile.userId));
    const effective = studentProfile.gardenRole ?? u?.gardenRole ?? null;
    if (effective === 'student' || effective === 'intern') return false;  // ← intern ВЫКЛЮЧЕН из early
    return effective === 'applicant';
}
```

Текущий код считает: **только applicant** требует ранней строки (на регистрации). intern получает row отложенно — через write-callsite (когда сдаст ДЗ).

### 7.3 Mentor — нужен row?

Нет. Mentor живёт в `pvl_mentors` (отдельная таблица — проверена, [`\d pvl_mentors`]). `pvl_students.mentor_id` ссылается на `pvl_mentors.id`. Mentor никогда не должен попасть в `pvl_students` — это сценарий BUG-PVL-ENSURE-RESPECTS-ROLE (как раз тогда mentor попадал в pvl_students как фейк-student).

### 7.4 Leader — нужен row?

**Спорно — продуктовый вопрос.**

Аргументы за (давать row):
- В audit 18 leaders без pvl_students. Если leader решит вернуться в PVL «обновить навыки» — наткнётся на тот же FK violation.
- В прошлом некоторые leader'ы могли проходить курс (`join_date` 2026-02 у части leader'ов = свежее зачисление; они могли быть applicant'ами этой весной).

Аргументы против (не давать):
- Leader = выпускник. Курс пройден. Зачем pvl_students row, если она по смыслу = «студент потока»?
- `pvl_students.status` имеет значение `'finished'` / `'certified'` — это и есть способ записать «курс окончен», а не «удалить row». Логично, что если leader **проходил** — у неё статус `finished`. Если **не проходила** — нет row.

**Моя интуиция:** включать в trigger только applicant + intern. Leader — не включать в WHEN, и **не включать в backfill**. Если кто-то из 18 leader'ов реально захочет ДЗ — это будет точечный admin-action (создать row вручную или специальной кнопкой «вернуть в курс»).

### 7.5 Что говорит код — поиск `pvl_students`

```
services/pvlPostgrestApi.js:570,572  — listStudents/upsertPvlStudent (admin tooling)
services/pvlMockApi.js:586,599,603,609,1327  — ensurePvlStudentInDb + comments
```

Всё usage `pvl_students` сосредоточено в:
- **admin/mentor flow** (учительская показывает список students);
- **student write flow** (ensure перед записью submissions/progress).

Никаких leader-specific use cases для pvl_students в коде не нашёл.

---

## Section 8. UPDATE-сценарии (role change)

### 8.1 Где меняется `profiles.role`

[services/dataService.js:1600-1612](../../services/dataService.js#L1600-L1612), метод `updateUser`:

```js
const roleStatusUpdate = {};
if (hasField(updatedUser, 'role')) roleStatusUpdate.role = updatedUser.role;
if (hasField(updatedUser, 'status')) roleStatusUpdate.status = updatedUser.status;
if (Object.keys(roleStatusUpdate).length > 0) {
    await postgrestFetch('profiles', { id: `eq.${updatedUser.id}` }, {
        method: 'PATCH', body: roleStatusUpdate, ...
    });
}
```

Это **единственный** код-путь изменения роли — админская правка профиля. RLS PATCH /profiles ограничен admin (см. `trg_reset_exempt_on_role_change`, который как раз срабатывает на role change).

### 8.2 Сценарии role change и их влияние на `pvl_students`

| from → to | что нужно с pvl_students |
|-----------|---------------------------|
| applicant → intern | НИЧЕГО (row уже создан, intern тоже = PVL student. status можно не трогать или поднять `applicant` → `active`) |
| intern → leader | Сложно: leader НЕ в студентах. Технически row можно оставить (status = `finished` или `certified`), либо удалить. **Удалять опасно** — CASCADE дропнет все её submissions, прогресс, чек-лист. Лучше — пометить `finished` и оставить как архив. |
| leader → applicant | row уже есть от прошлого захода ИЛИ его нет (18 текущих orphans). Нужен INSERT если orphan. Реально редкий сценарий. |
| любая → admin | row надо удалить (admin не должен быть в students). Или хотя бы помечать `paused` + не показывать в учительской. Тоже редкое. |
| applicant/intern → guest | Скорее всего удалять (или `paused`). |

### 8.3 Что это значит для trigger'а

**AFTER INSERT — точно нужен** (наш bug).

**AFTER UPDATE OF role — спорно.** Если ограничить trigger только INSERT'ом, role-change-сценарии остаются на админа (PATCH в админ-UI плюс ручной INSERT/UPDATE в pvl_students). Это **проще** и **безопаснее** (не удалит submissions по неосторожности).

Если делать UPDATE-trigger:
- WHEN (OLD.role NOT IN (applicant,intern) AND NEW.role IN (applicant,intern)) → INSERT в pvl_students (если ещё нет).
- WHEN (OLD.role IN (applicant,intern) AND NEW.role NOT IN (...)) → НЕ делать ничего автоматически (risk: CASCADE дропа сабмишнов). Логирование/notification — да.

**Моя рекомендация по trigger'у:** ограничиться AFTER INSERT. Role changes — отдельная задача (если когда-нибудь станет проблемой). Сейчас 33 orphan'а — это не от role changes, а от изначально пропущенного INSERT.

---

## Recommendation

### Выбор: **DB trigger AFTER INSERT ON profiles + backfill + FK (ARCH-010 a)**

**Почему:**

1. **Atomicity по сравнению с garden-auth-flow:** trigger выполняется в той же транзакции, что INSERT в profiles. Если profiles INSERT прошёл — pvl_students row создан гарантированно. Если profiles INSERT откатился — pvl_students тоже не создаётся. Это **единственный** способ получить настоящую атомарность без переписывания /auth/register на BEGIN/COMMIT (которое **тоже** надо сделать, но это другая задача — про users_auth/profiles half-state).

2. **Защита от ВСЕХ путей создания profiles:** если завтра появится admin-кнопка «создать студента вручную», или импорт из CSV, или ещё что — trigger срабатывает автоматически. garden-auth-fix защищает только один endpoint.

3. **Закрывает 3 backlog тикета одним заходом:**
   - BUG-PVL-ONBOARDING-MISSING-STUDENT-RECORD (наш P1)
   - ARCH-010 (если добавить FK в той же миграции — `pvl_students.id REFERENCES profiles(id) ON DELETE CASCADE`)
   - ARCH-012 (после miгграции можно удалить client-side ensure-loop — он становится мёртвым кодом)
   - BUG-PVL-ENSURE-RESPECTS-ROLE (whitelist в WHEN-условии trigger'а решает обратную проблему — admin/mentor больше не получат fake-row, потому что ensure-loop удалён)

4. **Простота:** ~30 строк SQL на trigger + ~10 строк на backfill в одной миграции. Без правок Express, без правок React.

5. **Безопасность:** trigger с SECURITY DEFINER обходит RLS, выполняется правами owner'а функции. Не нужно расширять RLS. Не нужны service-role хаки.

**Минусы:**
- DB-level логика менее видима, чем код (но миграции в git'е — это норма проекта).
- Если schema pvl_students изменится (новые NOT NULL колонки) — надо обновлять trigger. Низкая частота.

### Альтернатива A — garden-auth atomic flow

**Минусы**, делающие её хуже основного варианта:
- Защищает только `/auth/register`. Любой будущий путь создания profile'а — снова дыра.
- Требует service-role или PG-аутентификации, обходящей RLS. Сейчас `pool` подключается через `DB_USER` — нужно проверить, обходит ли он pvl_students_insert_admin или нет. Если нет — миграция RLS дополнительно.
- Не закрывает ARCH-010 (FK всё равно отсутствует).
- Не закрывает ARCH-012 (client-side ensure всё равно есть на случай sync).

**Плюс:** проще rollback (правка одного файла vs миграция). Но миграции тоже rollback'аются.

### Альтернатива B — frontend `ensurePvlStudentInDb`

**Минусы**, делающие её **не вариант**:
- RLS `pvl_students_insert_admin` блокирует non-admin INSERT. Чтобы починить — надо расширить RLS на `(id = auth.uid() OR is_admin())`. Backlog ARCH-012 явно говорит: «не ослаблять RLS ради косметики», т.к. позволит залогиненным менять `full_name`/`status` в своих строках (`status='paused' ← 'active'` злоупотребление).
- Не атомарно: между registration и mount'ом PvlPrototypeApp юзер может попасть на любую другую вкладку и не пройти через ensure. Любая операция в обход PvlPrototypeApp (например, push-notify с прямым deeplink в ДЗ — будущая фича) — снова дыра.
- Архитектурный антипаттерн (см. ARCH-012).

### Шаги для implementation-брифа (это уже не recon, для контекста)

1. **Миграция A:** добавить FK `pvl_students.id REFERENCES profiles(id) ON DELETE CASCADE`. Предварительно проверено — orphan_pvl_students = 0, добавится без ошибок. Закрывает ARCH-010.
2. **Миграция B (в той же транзакции, что A):** CREATE FUNCTION `trg_create_pvl_student_on_profile_insert()` SECURITY DEFINER. Логика:
   ```
   IF NEW.role IN ('applicant','intern') THEN
       INSERT INTO pvl_students (id, full_name, status, cohort_id)
       VALUES (NEW.id, COALESCE(NEW.name, NEW.email, 'Участница'),
               'active',
               <дефолт cohort_id>)
       ON CONFLICT (id) DO NOTHING;
   END IF;
   ```
   CREATE TRIGGER `trg_profiles_insert_pvl_student` AFTER INSERT ON profiles FOR EACH ROW EXECUTE FUNCTION ...
3. **Миграция C (backfill, в той же транзакции):** INSERT … SELECT … FROM profiles LEFT JOIN pvl_students WHERE … (scope ролей по продуктовому решению, скорее всего applicant + intern = 15 строк).
4. **Cleanup (отдельный коммит):** удалить `ensurePvlStudentInDb` и 8 callsite'ов из pvlMockApi.js. Закрывает ARCH-012. Закрывает BUG-PVL-ENSURE-RESPECTS-ROLE.
5. **Отдельная задача P2 (не часть этого fix'а):** обернуть `/auth/register` в `BEGIN/COMMIT` для атомарности users_auth+profiles. Это про другой half-state и сюда не входит.

---

## Open questions для Ольги

1. **Какие роли получают pvl_students-row на регистрацию?**
   Я бы рекомендовал `applicant + intern`. Включать ли `leader`? (Сейчас 18 leader-orphans, никто из них не активен в PVL; backfill их добавит «на всякий случай».)

2. **Какой источник дефолта `cohort_id`?**
   - (a) хардкод `'11111111-1111-1111-1111-111111111101'` в trigger'е — просто, надо менять trigger каждый поток;
   - (b) подзапрос `(SELECT id FROM pvl_cohorts ORDER BY year DESC NULLS LAST, created_at DESC LIMIT 1)` — auto-newest;
   - (c) NULL, проставляем админом вручную;
   - (d) завести `app_settings.key='pvl_current_cohort_id'` и читать оттуда.

3. **Initial `status` нового pvl_student'а?**
   - `'active'` — текущий дефолт колонки;
   - `'applicant'` — чище семантически (специально для pre-зачисления). Тогда trigger ставит `'applicant'` для role='applicant' и `'active'` для role='intern'?

4. **Scope backfill'а:**
   - только новая Суроватская (1 row);
   - applicant + все 14 interns (15 rows);
   - applicant + intern + leader (33 rows).

5. **Включать ли в trigger UPDATE OF role?**
   Моя рекомендация — НЕТ (Section 8.3). Но если у тебя есть кейс «admin переводит leader → applicant и хочет, чтобы row создалась автоматически» — это другое решение.

6. **`pvl_students.id` FK к `profiles.id` с CASCADE — ОК?**
   Если профиль удаляется (admin DELETE) — pvl_students row тоже дропнется вместе со всеми submissions / progress / chechlist (т.к. там тоже CASCADE). Это правильная семантика — но decision Ольги.

7. **Когда убирать клиентский ensure-loop?**
   В той же миграции/PR'е или отдельным шагом после verify, что trigger работает? Я бы рекомендовал — отдельным PR'ом после 2-3 дней наблюдения trigger'а в проде, чтобы не делать «всё сразу».

---

## Что НЕ сделано в рамках recon'а (явно)

- Не писал код, миграции, fix'ы.
- Не делал INSERT/UPDATE/DELETE на проде.
- Не публиковал значения env-vars/secrets.
- Не делал commit/push.
- Не лез в `postgres` superuser — все запросы под `gen_user` (read-only-friendly).

---

## Эффорт

~50 минут (~30 минут код, ~20 минут SQL/audit + написание отчёта). В пределах оценки `_107`.
