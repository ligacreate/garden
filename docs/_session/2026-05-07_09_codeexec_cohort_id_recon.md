# cohort_id recon — почему все 22 `pvl_students.cohort_id IS NULL`

**Адресат:** стратег (claude.ai).
**Автор:** VS Code Claude Code (executor).
**Создано:** 2026-05-07.
**Источник запроса:** [`2026-05-07_08_strategist_commit_phase25_prompt.md`](2026-05-07_08_strategist_commit_phase25_prompt.md) Шаг 2.
**Контекст:** apply phase 25 ([`2026-05-07_07_codeexec_phase25_apply_report.md`](2026-05-07_07_codeexec_phase25_apply_report.md))
выявил `pvl_students.cohort_id IS NULL` у всех 22 студентов → RPC
`pvl_admin_progress_summary` возвращает `[]` для любого `p_cohort_id`.

**Режим:** read-only. **НЕ apply, НЕ commit.**

---

## TL;DR

**Smoking gun найден за 5 минут.** Self-heal апсерт в
[`services/pvlMockApi.js:603-633`](../../services/pvlMockApi.js#L603-L633)
жёстко пишет `cohort_id: null` при создании новой строки в
`pvl_students`:

```js
async function ensurePvlStudentInDb(userId) {
    // …
    await pvlPostgrestApi.upsertPvlStudent({
        id: sqlId,
        full_name: fullName,
        status: 'active',
        cohort_id: null,    // ← ХАРДКОД
        mentor_id: null,    // ← ХАРДКОД
    });
}
```

Это **единственный writer** в `pvl_students.cohort_id` во всём коде
(grep по callers подтвердил). UI для назначения когорты в Garden-
админке отсутствует. Frontend cohort-логика работает из mock-domain
с хардкодом `'cohort-2026-1'` (seed-id), не из реальной БД.

**Рекомендация:**
1. **Backfill сейчас** — `UPDATE pvl_students SET cohort_id = '11111111-…-101'
   WHERE cohort_id IS NULL` (одна когорта в БД, все 22 студента ей
   принадлежат).
2. **Fix `ensurePvlStudentInDb` отдельной сессией** — заменить
   хардкод `cohort_id: null` на резолюцию через
   `seedCohortIdToSqlUuid(profile.cohortId)`. Иначе следующая
   новая ученица снова попадёт в БД с NULL.
3. **Не менять контракт RPC** — `p_cohort_id uuid` остаётся
   обязательным параметром. Это правильное решение для масштабирования
   на N когорт.

---

## Section 1 — где `cohort_id` / `cohortId` используется в коде

Полный grep `grep -rn 'cohort_id\|cohortId' services/ utils/ views/ App.jsx`
дал ~80 хитов. Систематизация:

### 1.1. `services/pvlPostgrestApi.js` — DB-обёртка

Только **один** реальный read-фильтр по `cohort_id` ([`pvlPostgrestApi.js:249`](../../services/pvlPostgrestApi.js#L249)):
```js
async listCalendarEvents(filters = {}) {
    if (filters.cohortId) params.cohort_id = `eq.${filters.cohortId}`;
    // …
}
```

Это для `pvl_calendar_events.cohort_id`, **не** `pvl_students.cohort_id`.
Для студентов чтения через PostgREST с фильтром по cohort_id **нет
ни одного callsite** (`listStudents()` без фильтров).

`upsertPvlStudent(payload)` ([`pvlPostgrestApi.js:510-518`](../../services/pvlPostgrestApi.js#L510-L518))
принимает любой payload (включая `cohort_id`), но без валидации
содержимого — что прислали, то и пишет.

### 1.2. `services/pvlMockApi.js` — mock domain (4245 строк, основной writer)

| Использование | Строки | Что делает |
|---|---|---|
| `cohort_id: null` хардкод в upsertPvlStudent payload | [626](../../services/pvlMockApi.js#L626) | **Корень проблемы.** Self-heal upsert при первом обращении к студенту. |
| Mapping seed↔SQL `'cohort-2026-1' ↔ '11111111-…-101'` | [155-160](../../services/pvlMockApi.js#L155-L160) | Frozen маппинг. Существует, но в ensurePvlStudentInDb не используется. |
| `seedCohortIdToSqlUuid(seedOrSql)` ф-ция | [187](../../services/pvlMockApi.js#L187) | Используется для `target_cohort_id` в content-items ([395](../../services/pvlMockApi.js#L395), [3560](../../services/pvlMockApi.js#L3560), [3602](../../services/pvlMockApi.js#L3602)) и cohort_id в course_weeks/control_points ([3828](../../services/pvlMockApi.js#L3828), [3858](../../services/pvlMockApi.js#L3858)). **Никогда не вызывается для pvl_students.** |
| `cohortId: 'cohort-2026-1'` в seed/profiles | [1140, 1180, 1294, 1819, 2294, 3497, 3813](../../services/pvlMockApi.js#L1140) и т.д. | Mock-side хардкод дефолтной когорты. Используется по всему mentor-cabinet flow. |
| `profile?.cohortId || 'cohort-2026-1'` | [2159, 2166, 2257, 2314, 2642, 2588 etc.](../../services/pvlMockApi.js#L2159) | Fallback на hardcoded seed-id когда mock-profile.cohortId пуст. |
| `ensurePvlStudentInDb` callers | 9 мест: [743, 1205, 1866, 1933, 1974, 2088, 2524, 3920](../../services/pvlMockApi.js#L743) и др. | Все триггерят upsert с `cohort_id: null` при необходимости. |

### 1.3. `views/PvlPrototypeApp.jsx` — UI

10 хитов, все **читающие** (filter/show/title), **ни одного writer'а**:

| Строка | Назначение |
|---|---|
| [223-227](../../views/PvlPrototypeApp.jsx#L223-L227) `resolveStudentCohortIdForPvl(studentId)` | `return p?.cohortId || 'cohort-2026-1'` — читает из mock `db.studentProfiles`, fallback хардкод. |
| [1120, 1189, 1274](../../views/PvlPrototypeApp.jsx#L1120) (CMS-utility) | default param `cohortId = 'cohort-2026-1'`. |
| [2092-2093](../../views/PvlPrototypeApp.jsx#L2092-L2093) StudentDashboard | `profile?.cohortId || profile?.cohort || 'cohort-2026-1'`. |
| [2588](../../views/PvlPrototypeApp.jsx#L2588) | то же, что 227. |
| [3395, 3446, 3955](../../views/PvlPrototypeApp.jsx#L3395) | прокидка `cohortId="cohort-2026-1"` или `mentorCohortId = mp?.cohortIds?.[0] \|\| 'cohort-2026-1'`. |

`MentorDashboard` ([3955](../../views/PvlPrototypeApp.jsx#L3955)) — `mentorCohortId = pvlDomainApi.db.mentorProfiles.find(m => m.userId === mentorId)?.cohortIds?.[0] || 'cohort-2026-1'`. Это **mock-data lookup**, не БД.

### 1.4. `views/AdminPanel.jsx`

```bash
grep 'cohort_id\|cohortId' views/AdminPanel.jsx
```
→ **0 хитов**. UI для назначения когорты в админке Garden **отсутствует**.

### 1.5. `data/pvl/seed.js`

Хардкод `cohortId: 'cohort-2026-1'` в seed-cohorts/weeks/lessons/tasks/etc. (~10 мест). Это статика mock-данных.

### 1.6. App.jsx, push-server, components/, utils/

`grep` пуст. `cohort_id` нигде не используется в этих слоях.

---

## Section 2 — как определяется «текущая когорта»

### 2.1. На стороне frontend

**Хардкод `'cohort-2026-1'` (seed-id, не SQL uuid).**

- Первый источник — mock seed [`data/pvl/seed.js:16`](../../data/pvl/seed.js#L16) — единственная активная когорта.
- Резолюция в UI — `profile?.cohortId || 'cohort-2026-1'` через `resolveStudentCohortIdForPvl` ([PvlPrototypeApp.jsx:225-227](../../views/PvlPrototypeApp.jsx#L225-L227)).
- `profile.cohortId` берётся из `db.studentProfiles` (mock-domain), который синхронизируется из БД через `syncPvlActorsFromGarden` ([pvlMockApi.js:1057](../../services/pvlMockApi.js#L1057)). Но cohort_id у db.studentProfiles загружается из БД **не** из `pvl_students.cohort_id` — а из ... нужно проверять детально (за рамки recon).
- В коротко: **где бы UI ни искал cohortId — кончает на `'cohort-2026-1'` хардкоде.**

Когда переход seed→SQL нужен (для PostgREST-запросов), используется `seedCohortIdToSqlUuid('cohort-2026-1') → '11111111-1111-1111-1111-111111111101'` ([pvlMockApi.js:158-160, 187](../../services/pvlMockApi.js#L158-L160)).

### 2.2. На стороне БД

`pvl_students.cohort_id` **никогда не читается** в коде (нет ни одного `WHERE cohort_id` в pvl_students-связанных запросах). Поле существует в схеме, но используется только в:
- Backfill через ручной psql (не сделано).
- Будущий `pvl_admin_progress_summary(p_cohort_id)` ← **это первый реальный consumer.**
- `pvl_calendar_events.cohort_id` (другая таблица).

### 2.3. Кто пишет в `pvl_students.cohort_id`?

**Единственный writer** во всём коде — `ensurePvlStudentInDb` ([pvlMockApi.js:603-633](../../services/pvlMockApi.js#L603-L633)):

```js
async function ensurePvlStudentInDb(userId) {
    if (!pvlPostgrestApi.isEnabled()) return;
    const sqlId = studentSqlIdByUserId(userId);
    if (!sqlId) return;
    if (pvlStudentSyncedToDb.has(sqlId)) return;

    // ARCH-012 hotfix: ensure делает upsert в pvl_students, но RLS на этой
    // таблице — admin-only (phase 11.1). Под mentor/student любая попытка —
    // 403 → 200+ console-warns за сессию. Раздаём только админу; для
    // mentor/student — оставляем ручной flow (admin предсоздаёт строки).
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
            cohort_id: null,    // ← ХАРДКОД
            mentor_id: null,    // ← ХАРДКОД
        });
    } catch (err) {
        // …
    }
}
```

**Что делает:**
- Триггерится при первом обращении к студенту в любом из 9 callsite'ов (см. таблицу 1.2 выше) — в сессии админа upsert строка в `pvl_students` с `cohort_id: null` / `mentor_id: null`.
- Если строка уже есть (был upsert раньше) — `merge-duplicates` перезаписывает только присланные поля. Поскольку в payload `cohort_id: null` всегда — каждый upsert **обнуляет** `cohort_id` для существующих студентов.

**Импликация:**
- Все 22 строки в `pvl_students` созданы через этот код.
- Все 22 имеют `cohort_id IS NULL` потому что их `cohort_id` ни разу не был установлен (никто не запускал backfill).
- Любая будущая ручная установка cohort_id рискует **обнулиться при следующем визите Ольги/Насти/Ирины в учительскую** — `ensurePvlStudentInDb` сработает и переуст. в null. Это **второй уровень риска** — недостаточно просто backfill, надо ещё фикс ensurePvlStudentInDb.

#### Дополнительно: `mentor_id` — та же история

В payload `mentor_id: null` — то есть `pvl_students.mentor_id` тоже всегда NULL. Но реальные mentor-связки хранятся в `pvl_garden_mentor_links` (которые правильно ведутся через `pvlPostgrestApi.upsertGardenMentorLink` отдельно). Так что **`pvl_students.mentor_id` де-факто dead code**, mentor-логика работает через links-таблицу.

Для phase 25 RPC: `mentor_id` в результат идёт через
`COALESCE(mentor_links.mentor_id, pvl_students.mentor_id)` —
fallback `pvl_students.mentor_id` всегда NULL → ОК, `links.mentor_id`
работает корректно.

### 2.4. Откуда взять правильный `cohort_id` для backfill?

Из **mock-mapping** [`pvlMockApi.js:158-160`](../../services/pvlMockApi.js#L158-L160) — **единственная** активная когорта на текущий момент:

```js
'cohort-2026-1' → '11111111-1111-1111-1111-111111111101'
```

И в БД `pvl_cohorts` ровно одна строка с этим UUID:
```
id                                   | title
-------------------------------------|------------------
11111111-1111-1111-1111-111111111101 | ПВЛ 2026 Поток 1
```

→ Все 22 студента сейчас фактически принадлежат именно этой когорте.

---

## Section 3 — рекомендация

### 3.1. Сейчас (для разблокировки FEAT-017 frontend smoke)

**Backfill data-миграция** — отдельный файл, идемпотентная, под gen_user.

```sql
-- migrations/data/2026-05-07_pvl_students_cohort_backfill.sql
\set ON_ERROR_STOP on

BEGIN;

-- Pre-check: единственная активная когорта в БД.
DO $$
DECLARE v_count int;
BEGIN
    SELECT count(*) INTO v_count FROM public.pvl_cohorts;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Expected exactly 1 cohort, found %', v_count;
    END IF;
END $$;

-- Backfill: все NULL-cohort_id студенты привязаны к единственной когорте.
UPDATE public.pvl_students
SET cohort_id = '11111111-1111-1111-1111-111111111101'
WHERE cohort_id IS NULL;

-- Verify
SELECT count(*) AS students_total,
       count(cohort_id) AS students_with_cohort,
       count(*) FILTER (WHERE cohort_id = '11111111-1111-1111-1111-111111111101') AS students_in_pvl_2026_1
FROM public.pvl_students;
-- Ожидание: 22 / 22 / 22

COMMIT;
```

⚠ Это **data-миграция**, не schema → не нужно `ensure_garden_grants()`.
RUNBOOK 1.3 относится к DDL, здесь только UPDATE.

### 3.2. Через неделю-две (фикс корня — отдельной сессией)

**Поправить `ensurePvlStudentInDb`** в [`services/pvlMockApi.js:622-628`](../../services/pvlMockApi.js#L622-L628):

```diff
+    const cohortSeedId = pvlDomainApi.db.studentProfiles
+        .find((p) => p.userId === userId)?.cohortId || 'cohort-2026-1';
+    const cohortSqlId = seedCohortIdToSqlUuid(cohortSeedId);
+
     await pvlPostgrestApi.upsertPvlStudent({
         id: sqlId,
         full_name: fullName,
         status: 'active',
-        cohort_id: null,
+        cohort_id: cohortSqlId,
         mentor_id: null,
     });
```

Так новые студенты (и при повторных upsert'ах — существующие) будут
получать корректный `cohort_id` из mock-profile (или fallback на
hardcoded `'cohort-2026-1'`).

**Но** есть тонкость: `merge-duplicates` upsert **перезаписывает**
все поля из payload. Если когда-нибудь Ольга вручную поставит
студента в другую когорту через будущий admin-UI, следующий
`ensurePvlStudentInDb` снесёт это значение обратно. Лечение:
либо опускать `cohort_id` из payload upsert'а если он уже стоит
(условный SELECT перед upsert'ом), либо использовать INSERT ON
CONFLICT DO NOTHING вместо merge-duplicates.

Это уже задача **ARCH-012** в backlog (убрать клиентский self-heal
вообще). Для FEAT-017 достаточно backfill в (3.1).

### 3.3. RPC контракт — оставить как есть

**Не менять** на `p_cohort_id DEFAULT NULL → возвращать всех`.
Аргументы:
- Когорт станет 2+ к лету 2026 (ПВЛ Поток 2). Изоляция нужна.
- Frontend FEAT-017 уже знает «свою когорту» через mock seed-id,
  легко преобразовать в SQL uuid через `seedCohortIdToSqlUuid`.
- Если делать optional cohort_id → admin случайно выгрузит сразу
  все когорты (UX-риск).

---

## Что вернуть стратегу

Этот файл (`docs/_session/2026-05-07_09_codeexec_cohort_id_recon.md`).

Ожидаемое решение:
- 🟢 на data-миграцию (3.1)? Если да — могу сделать сразу одной
  серией (создать файл + apply под gen_user + verify).
- Заводим ARCH-012 расширение или новый таск на фикс
  `ensurePvlStudentInDb` (3.2)?
- Подтверждение, что RPC-контракт остаётся `p_cohort_id uuid`
  обязательным (3.3).

**НЕ apply, НЕ commit.** Phase 25 commit `66c7c0e` лежит локально
ahead of origin/main, ждёт отдельный 🟢 PUSH.
