# Recon: Василина / «Список менти пуст» — где реально активируется fallback

**Дата:** 2026-05-29
**Сессия:** 162
**Режим:** READ-ONLY (никаких правок)
**Триггер:** DevTools данные Василины — Network показал только `profiles?id=eq.6cf385c3-…`, нет запросов к `pvl_garden_mentor_links` и `pvl_students`. UI рендерит текст про «демо-данные подгружаются по профилю ментора». Гипотеза: код выбирает wrong code path / fallback, а не реальный API path.

**Стратегу важно:** ниже я опровергаю гипотезу «demo-mode fallback». В коде нет ветки «если demo → показать заглушку». Текст «Список менти пуст…» — это просто empty-state рендер, когда `menteeRows.length === 0`. Реальная причина — `mentorProfile.menteeIds` остаётся пустым из-за silent-return в hydrate. Подробности ниже.

---

## Раздел 1 — Где живёт текст «Список менти пуст»

**Файл:** [views/PvlPrototypeApp.jsx:3672](views/PvlPrototypeApp.jsx#L3672)
**Компонент:** `MentorMenteesGardenGrid`

```jsx
{menteeRows.length === 0 ? (
    <div className="rounded-lg bg-slate-50/90 px-3 py-6 text-center text-sm text-slate-600">
        Список менти пуст. Если вы только что переключили роль, обновите страницу или откройте «Мои менти» — демо-данные подгружаются по профилю ментора.
    </div>
) : null}
```

Компонент принимает `menteeRows` как пропс (строка 3665) и рендерит сообщение строго при `menteeRows.length === 0`.

**Важный вывод:** это НЕ branching между «demo» и «real». Это обычное empty-state сообщение. В тексте упоминаются «демо-данные», но это только UX-копирайт — кодовой ветки «if (demoMode) showDemo()» рядом нет.

---

## Раздел 2 — Условие активации этого fallback

Активация = `menteeRows = []`. А `menteeRows` приходит из вычисления на уровень выше:

**Файл:** [views/PvlPrototypeApp.jsx:4024](views/PvlPrototypeApp.jsx#L4024)
**Компонент:** `MentorDashboard`

```jsx
function MentorDashboard({ navigate, mentorId, refresh, refreshKey = 0 }) {
    // BUG-PVL-ADMIN-AS-MENTOR-EMPTY (см. комментарий в MentorMenteesPanel).
    const menteeRows = useMemo(
        () => buildMentorMenteeRows(mentorId),
        [
            mentorId,
            refreshKey,
            pvlDomainApi.db._pvlGardenApplicantsSynced,
            pvlDomainApi.db.mentorProfiles.length,
            pvlDomainApi.db.studentProfiles.length,
        ],
    );
    // ...
    <MentorMenteesGardenGrid navigate={navigate} menteeRows={menteeRows} heading="Мои менти" />
```

**Замечание про deps useMemo:** зависимости — это `.length` массивов и флаг `_pvlGardenApplicantsSynced`. Если данные внутри `mentorProfiles[i].menteeIds` мутируются (а они мутируются in-place через `applyGardenMentorLinkRow`), `useMemo` НЕ пересчитается, потому что `.length` не изменился. Это потенциальная вторичная проблема, но не главная — об этом дальше.

---

## Раздел 3 — Цепочка getMentorMentees → почему [] для Василины

### 3.1 `buildMentorMenteeRows` (точка входа)
**Файл:** [views/PvlPrototypeApp.jsx:3575](views/PvlPrototypeApp.jsx#L3575)

```js
function buildMentorMenteeRows(mentorId) {
    const menteesFromApi = pvlDomainApi.mentorApi.getMentorMentees(mentorId);
    return menteesFromApi.map((m) => { /* ... 72 строк маппинга ... */ });
}
```

Если `menteesFromApi = []`, то `menteeRows = []` — путь до empty-state открыт.

### 3.2 `getMentorMentees` (API)
**Файл:** [services/pvlMockApi.js:3210](services/pvlMockApi.js#L3210)

```js
getMentorMentees(mentorId) {
    const menteeIds = new Set(getMentorMenteeIds(mentorId));
    let rows = db.studentProfiles.filter((p) => menteeIds.has(p.userId));
    if (db._pvlGardenApplicantsSynced) {
        rows = rows.filter((p) => !isSeedPvlDemoStudentId(p.userId));
    }
    return rows.map((p) => ({ ...p, user: db.users.find((u) => u.id === p.userId) }));
},
```

Если `getMentorMenteeIds(mentorId)` пустой → `menteeIds = Set()` → `rows = []`.

### 3.3 `getMentorMenteeIds` (ключ ко всему)
**Файл:** [services/pvlMockApi.js:1947](services/pvlMockApi.js#L1947)

```js
function getMentorMenteeIds(mentorId) {
    const resolved = resolveMentorActorId(mentorId);
    if (!resolved) return [];
    const mentorProfile = (db.mentorProfiles || []).find((m) => m.userId === resolved);
    const fromMentorProfile = Array.isArray(mentorProfile?.menteeIds) ? mentorProfile.menteeIds : [];
    const fromStudentProfiles = db.studentProfiles.filter((p) => p.mentorId === resolved).map((p) => p.userId);
    let ids = Array.from(new Set([...fromMentorProfile, ...fromStudentProfiles].map((id) => String(id))));
    if (db._pvlGardenApplicantsSynced) {
        ids = ids.filter((id) => !isSeedPvlDemoStudentId(id));
    }
    return ids;
}
```

**Два источника, объединение:**
- `mentorProfile.menteeIds` — заполняется hydrate'ом из таблицы `pvl_garden_mentor_links`
- `studentProfiles.filter(p => p.mentorId === resolved)` — студенты, у кого поле `.mentorId` прямо ссылается на этого ментора

**Для Василины оба пустые ⇒ возвращается `[]`.**

### 3.4 `hydrateGardenMentorAssignmentsFromDb` (откуда берётся `menteeIds`)
**Файл:** [services/pvlMockApi.js:1122](services/pvlMockApi.js#L1122)

```js
async function hydrateGardenMentorAssignmentsFromDb() {
    if (!pvlPostgrestApi.isEnabled()) return;
    const ids = [
        ...new Set(
            (db.studentProfiles || [])
                .map((p) => String(p.userId || '').trim())
                .filter((id) => isUuidString(id)),
        ),
    ];
    if (ids.length === 0) return;   // ← SILENT RETURN
    const rows = await pvlPostgrestApi.listGardenMentorLinksByStudentIds(ids);
    for (const row of rows || []) {
        applyGardenMentorLinkRow(row);
    }
}
```

**Критическое наблюдение:** функция запрашивает `pvl_garden_mentor_links` только для тех студентов, кто УЖЕ есть в `db.studentProfiles`. Если её менти ещё не загрузились — она просто возвращается, оставляя `menteeIds` пустыми.

### 3.5 `applyGardenMentorLinkRow` (silent guard)
**Файл:** [services/pvlMockApi.js:1095](services/pvlMockApi.js#L1095)

```js
function applyGardenMentorLinkRow(row) {
    const studentId = row?.student_id != null ? String(row.student_id).trim() : '';
    if (!studentId) return;
    const mentorId = row?.mentor_id != null && row.mentor_id !== '' ? String(row.mentor_id).trim() : null;
    const profile = (db.studentProfiles || []).find((p) => String(p.userId) === studentId);
    if (!profile) return;  // ← GUARD: если студента нет в db, строка тихо игнорируется
    // ... дальше обновляет mentor.menteeIds ...
}
```

Если строка из `pvl_garden_mentor_links` пришла на студента, которого нет в `db.studentProfiles` — связь молча отбрасывается.

---

## Раздел 4 — Чем Юля/Лена отличаются от Василины

В коде нет ни одной ветки вида `if (demoMode)` или `if (mentorId in demoList)`. Я грепнул `demo`, `fallback`, `isDemo`, `demoMode`, `demoStudents`, `demoMentor` — все попадания связаны либо с seed/демо-данными (для прототипа без бэкенда), либо с UX-копирайтом. Реальной ветки «demo vs real» для авторизованного юзера нет.

**Что реально отличает Юлю от Василины (гипотезы по убыванию вероятности):**

### Гипотеза A (сильная): порядок sync и состав `db.studentProfiles` на момент hydrate
- `syncPvlActorsFromGarden` (services/pvlMockApi.js:1183) сначала создаёт `mentorProfiles[]` с пустыми `menteeIds: []` (строка 1269), затем `studentProfiles[]`, затем вызывает `hydrateGardenMentorAssignmentsFromDb()` (строка 1343).
- Если в момент hydrate'а в `db.studentProfiles` НЕТ менти Василины (например, она их видит, но они ещё не разлились в db из-за какого-то фильтра), то либо `ids = []` → early return, либо в `rows` нет нужных строк → её `menteeIds` остаются пустыми.
- У Юли — её менти оказались в `db.studentProfiles` к моменту hydrate'а, поэтому её `menteeIds` заполнились корректно.

### Гипотеза B: fallback через `studentProfile.mentorId` поле
- В `getMentorMenteeIds` (строка 1953) есть второй источник: `db.studentProfiles.filter((p) => p.mentorId === resolved)`.
- Если у студентов Юли поле `studentProfile.mentorId` уже было заполнено (например, синхронизировано из таблицы напрямую), а у студентов Василины — нет, то Юля получит менти даже без работающего hydrate, а Василина — нет.

### Гипотеза C: в `pvl_garden_mentor_links` нет строк именно про Василину
- Hydrate отрабатывает, но в БД для её 3 менти нет соответствующих записей (mentor_id пустой или указывает не на неё).
- Это проверяется отдельным SQL-запросом — из кода это не определишь.

### Гипотеза D (слабая): `resolveMentorActorId` возвращает не её ID
**Файл:** [views/PvlPrototypeApp.jsx:238](views/PvlPrototypeApp.jsx#L238)

```js
function resolvePvlMentorActorId(actingUserId) {
    const profiles = pvlDomainApi.db?.mentorProfiles || [];
    if (profiles.some((m) => m.userId === actingUserId)) return actingUserId;
    const isDemoId = !actingUserId || /^u-(men|st|adm)-/.test(String(actingUserId));
    return isDemoId ? (profiles[0]?.userId || actingUserId || null) : actingUserId;
}
```

Для UUID Василины `6cf385c3-…` regex `^u-(men|st|adm)-/` не сматчится, `isDemoId = false`, возвращается её собственный ID. **Эта функция НЕ виновата** при условии, что её `mentorProfile` есть в `db.mentorProfiles`. Если же её mentorProfile не загрузился вообще — `getMentorMenteeIds` всё равно работает (resolved берётся, но `mentorProfile` будет `undefined` → `fromMentorProfile = []` → второй источник тоже пустой).

---

## ВЕРДИКТ

**Опровержение исходной гипотезы:** в коде нет «demo-mode / fallback activation» как отдельной ветки. Текст «Список менти пуст…» — это обычный empty-state, отображаемый при `menteeRows.length === 0`. Слово «демо-данные» в копирайте — только UX-подсказка для админа, не сигнал кодовой ветки.

**Где Василина реально проваливается:**
[services/pvlMockApi.js:1947](services/pvlMockApi.js#L1947) — функция `getMentorMenteeIds(mentorId)` возвращает `[]`, потому что оба её источника пустые:
1. `mentorProfile.menteeIds = []` — hydrate не заполнил
2. `studentProfiles.filter(p => p.mentorId === resolved) = []` — у её менти не проставлено поле `studentProfile.mentorId`

**Подозреваемое корневое звено:** [services/pvlMockApi.js:1122](services/pvlMockApi.js#L1122) — `hydrateGardenMentorAssignmentsFromDb()` запрашивает `pvl_garden_mentor_links` только по `student_id IN (...)` для студентов, уже сидящих в `db.studentProfiles`. Если её 3 менти в этот момент не в db (или их вообще нет в этом snapshot'е, или snapshot до них не дошёл) — связи не подтягиваются. Альтернатива: связи есть в `pvl_garden_mentor_links`, но `mentor_id` для них NULL или указывает не на Василину.

**Что точно нужно проверить перед fix'ом (по сети/SQL, не по коду):**
1. Есть ли в `db.studentProfiles` объекты для её 3 менти после полной загрузки? (Network — был ли запрос `pvl_students` с её 3 IDs?)
2. Есть ли в `pvl_garden_mentor_links` строки `mentor_id = 6cf385c3-… AND student_id IN (её 3 менти)`?
3. У этих 3 студентов в `pvl_students.mentor_id` (или эквивалентном поле) стоит ли её UUID?

Если ответ на (1) — НЕТ запроса вообще к `pvl_students` (а вы говорите, что Network видит только её собственный профиль), то реальная проблема ещё раньше: **sync вообще не запускается под её JWT** — и тогда `db.mentorProfiles`/`db.studentProfiles` остаются на сидовых демо-данных, а её собственный UUID не находит свой mentor profile → fallback ветки не существует → пустой массив.

**Следующая шахта для копки (вне scope этой recon, на будущую сессию):**
- Откуда вызывается `syncPvlActorsFromGarden` и под какими условиями? (Если она не вызывается под Василиной, причина в callsite, а не в самой sync.)
- Где живёт `_pvlGardenApplicantsSynced` флаг — он остаётся `false` под Василиной?

---

**Артефакт сохранён:** `docs/_session/2026-05-29_162_codeexec_recon_vasilina_demo_mode_fallback.md`
