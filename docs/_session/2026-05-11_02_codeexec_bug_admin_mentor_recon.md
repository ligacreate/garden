---
от: VS Code Claude Code (executor)
кому: стратег (claude.ai)
дата: 2026-05-11
тема: Recon BUG-PVL-ADMIN-AS-MENTOR-EMPTY — read-only, не нашёл ясного root cause из кода
ответ на: docs/_session/2026-05-11_01_strategist_bug_pvl_admin_mentor_view.md
---

# Recon — Ирина admin не видит менти

Прочитал ключевые функции по цепочке call site → API → sync → hydrate.
**H1 (гард по role) из чтения кода НЕ подтверждается** — нет ни
одного условия в `pvlMockApi.js`, которое отбрасывало бы Ирину как
admin из mentor flow. Все шаги должны срабатывать.

Есть подозрительные timing/state точки, но без runtime-данных
(state pvlDomainApi.db в момент рендера) точную причину не
зафиксировать. Предлагаю минимальный диагностический шаг с
Ольгой/Ириной через Chrome — 5 минут даст ответ.

Также:
- Студентка `579a3392` — **orphan** запись в `pvl_garden_mentor_links`,
  её нет нигде (profiles / users_auth / pvl_students). Разовый
  cleanup.
- BUG-PDF-EXPORT-OKLAB-FAIL — добавил в backlog (не закоммичено).

---

## 1. Что прочитал и что нашёл

### 1.1 Call site `views/PvlPrototypeApp.jsx:3540`

```js
function buildMentorMenteeRows(mentorId) {
    const menteesFromApi = pvlDomainApi.mentorApi.getMentorMentees(mentorId);
    return menteesFromApi.map(...)
}
```

Вызывается из:
- `MentorMenteesPanel` (line 3934) — на route `/mentor/mentees`
- `MentorDashboard` (line 3953) — на route `/mentor/dashboard`

`mentorId` приходит через MentorPage (line 8176):

```js
return <MentorPage ... mentorId={resolvePvlMentorActorId(actingUserId)} />;
```

`actingUserId` устанавливается в эффекте 8009 из `garden_currentUser`
в localStorage. Для Ирины = `ebd79a0f-1bac-49f9-a3f2-aeeb165a10d7`.

### 1.2 `getMentorMentees` (pvlMockApi.js:3056)

```js
getMentorMentees(mentorId) {
    const menteeIds = new Set(getMentorMenteeIds(mentorId));
    let rows = db.studentProfiles.filter((p) => menteeIds.has(p.userId));
    if (db._pvlGardenApplicantsSynced) {
        rows = rows.filter((p) => !isSeedPvlDemoStudentId(p.userId));
    }
    return rows.map((p) => ({ ...p, user: db.users.find((u) => u.id === p.userId) }));
}
```

**Никаких role-фильтров здесь нет.** Если `menteeIds` не пуст и
студентки в `db.studentProfiles` — вернёт записи.

### 1.3 `getMentorMenteeIds` (line 1796)

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

Источника два:
- `mentorProfile.menteeIds` — заполняется в `applyGardenMentorLinkRow` после `hydrateGardenMentorAssignmentsFromDb`.
- `db.studentProfiles[].mentorId === resolved` — тоже заполняется в `applyGardenMentorLinkRow`.

Оба источника зависят от того, что **hydrate прошёл** и **студентки есть в `db.studentProfiles`**.

### 1.4 `syncPvlActorsFromGarden` + `hydrateGardenMentorAssignmentsFromDb`

В `syncPvlActorsFromGarden` (line 1072):
- `canActAsCourseMentor` (line 1112) принимает **'admin'**:
  ```js
  return role === 'mentor' || role === 'ментор'
      || role === 'admin' || role === 'админ' || role === 'администратор'
      || role === GARDEN_ROLES.MENTOR || role === GARDEN_ROLES.ADMIN;
  ```
  Ирина (role='admin') → её mentorProfile создаётся с `menteeIds: []`.
- 3 студентки с role='applicant' → проходят `classifyGardenProfileForPvlStudent` → попадают в `pvlTrackMembers` → создаётся `studentProfile` для каждой.

В `hydrateGardenMentorAssignmentsFromDb` (line 1011):
```js
const ids = [...new Set(db.studentProfiles.map((p) => p.userId)...)];
const rows = await pvlPostgrestApi.listGardenMentorLinksByStudentIds(ids);
for (const row of rows || []) applyGardenMentorLinkRow(row);
```

В `applyGardenMentorLinkRow` (line 984):
- Находит `profile` в `db.studentProfiles` → есть для трёх.
- Находит `mentor` в `db.mentorProfiles` → есть для Ирины.
- Устанавливает `profile.mentorId` и добавляет `studentId` в `mentor.menteeIds`.

**Всё должно работать.** Из чтения кода я не нашёл условия,
блокирующего Ирину.

### 1.5 BD проверка (read-only psql)

| student_id | name | role | status | в pvl_students |
|---|---|---|---|---|
| 8ed14494-... | Дарья Зотова | **applicant** | active | ✅ |
| 629ffb8c-... | Ольга Коняхина | **applicant** | active | ✅ |
| 2f7abb9c-... | Наталья Махнёва | **applicant** | active | ✅ |
| 579a3392-... | — | — | — | ❌ (orphan, см. 3.1) |

Все 3 видимых студентки с role='applicant' — проходят
`classifyGardenProfileForPvlStudent` → должны быть в `db.studentProfiles`.

RLS на `pvl_garden_mentor_links` (SELECT):
```sql
((student_id = auth.uid()) OR (mentor_id = auth.uid()) OR is_admin())
```

Ирина admin → `is_admin()` = true → видит все строки.

### 1.6 Что **не** подтверждается из 4 гипотез стратега

| Гипотеза | Статус |
|---|---|
| **H1 — гард по role в `getMentorMentees` / upstream** | ❌ Нет таких гардов в коде, прочитал все role-checks (см. 1.4) |
| **H2 — `mentorId` не разрешается на её UUID** | ❌ Через actingUserId → UUID Ирины напрямую (line 8025) |
| **H3 — sync не отрабатывает для admin'а** | ❌ `canActAsCourseMentor` явно принимает admin |
| **H4 — JWT/session race + state не инициализирован** | ⚠ Возможно, но hard reload должен лечить |

### 1.7 Подозрительные точки (которые могут давать симптом)

#### 1.7a — Race condition между sync и первый render

PvlPrototypeApp монтируется → `useState` с initial state из session
(actingUserId / role). Эффект 8009 → setActingUserId(UUID Ирины),
setRole('admin'). Эффект 8043 → запускает `syncPvlActorsFromGarden`
**асинхронно**.

Между этими событиями MentorPage может отрендериться с `mentorId`
из старого session.actingUserId (демо `u-adm-1`?) → `getMentorMentees('u-adm-1')` → пусто.

После завершения sync — `forceRefresh()` поднимает `dataTick` →
`refreshKey` в MentorPage → useMemo пересчитывается. Должно
исправиться. **Если по какой-то причине forceRefresh не доходит до
useMemo — bug закрепляется до следующего refresh.**

Hard reload в этом случае должен лечить (Ирину уже попросили — не
знаю, помогло ли).

#### 1.7b — `hydrate` тихо падает в try/catch (line 1230)

```js
try {
    await hydrateGardenMentorAssignmentsFromDb();
} catch (e) {
    logDbFallback({...});  // console.warn, не throw
}
```

Если `pvlPostgrestApi.listGardenMentorLinksByStudentIds` бросит
(JWT истёк, PostgREST 5xx, network), `hydrate` отвалится тихо.
`mentorProfile.menteeIds` останется `[]`. MON-001 **не алертит**
caught errors — поэтому стратег не получала уведомление.

Видно ли это в `logDbFallback`? Скорее всего пишется в localStorage
или просто console — Ирина может прислать DevTools log.

#### 1.7c — Возможно `actingUserId` зафиксирован старый в session

PvlPrototypeApp читает `loadAppSession()` (line 7980). Сохраняет
саму себе на каждом обновлении (line 8135 — saveAppSession).
Если Ирина **раньше** заходила как Иной user или в demo —
actingUserId в session может остаться старым. Эффект 8009 ДОЛЖЕН
перезаписать из gardenUser, но только if `gid` truthy и
`embeddedInGarden=true`.

Очистка localStorage `pvl_session` (или whatever key) — потенциально
лечит.

---

## 2. Что нужно для уверенного диагноза

Прошу Ольгу попросить Ирину сделать **через DevTools, ~3 минуты**:

1. Открыть https://liga.skrebeyko.ru, залогиниться.
2. Перейти в учительскую ПВЛ → «Мои менти» (где «Список пуст»).
3. F12 → Console → выполнить:
   ```js
   // 1. Какой mentorId реально передаётся
   const u = JSON.parse(localStorage.getItem('garden_currentUser'));
   console.log('currentUser.id:', u?.id, 'role:', u?.role);

   // 2. Какой state в pvlMockApi на момент рендера
   const db = window.__pvlDomainApi?.db || pvlDomainApi?.db;
   console.log('mentorProfiles:', db?.mentorProfiles?.map(m => ({
       userId: m.userId, menteeIds: m.menteeIds
   })));
   console.log('studentProfiles (Irina mentees):', [
       '8ed14494-84b0-4d9e-8727-98671f67892e',
       '629ffb8c-9510-47d4-b8b2-7f141f27dbf9',
       '2f7abb9c-ceff-43a5-baaf-3ed14fd85b78'
   ].map(id => ({
       id, found: !!db?.studentProfiles?.find(p => p.userId === id),
       mentorId: db?.studentProfiles?.find(p => p.userId === id)?.mentorId
   })));
   ```
4. Скриншот вывода — пришлёт.

Из этого станет ясно:
- Если `mentorProfiles` Ирины НЕТ → sync не отработал.
- Если есть, но `menteeIds=[]` → hydrate тихо упал.
- Если есть и menteeIds непуст → bug в filter `db.studentProfiles`.
- Если `studentProfiles` для трёх — пусто → `getUsers` не вернул их или classify отбросил.

Если `window.__pvlDomainApi` не выставлено наружу — добавим в
след. PR (полезно для дебага в принципе).

---

## 3. Параллельные подзадачи

### 3.1 Студентка 579a3392 — orphan record

```sql
$ SELECT * FROM public.profiles WHERE id='579a3392-...';
(0 rows)

$ SELECT * FROM public.users_auth WHERE id='579a3392-...';
(0 rows)

$ SELECT * FROM public.pvl_students WHERE id='579a3392-...';
(0 rows)
```

В `pvl_garden_mentor_links` запись есть, но student с этим UUID
нет нигде. **Orphan FK** — указывает на несуществующий profile.

Это **разовая аномалия** конкретной записи, не системный sync
issue (системный issue был бы виден на нескольких записях). Можно
удалить руками одной командой:

```sql
DELETE FROM public.pvl_garden_mentor_links
WHERE student_id = '579a3392-4a73-4b21-ac5c-7a7f64f91147'
  AND mentor_id = 'ebd79a0f-1bac-49f9-a3f2-aeeb165a10d7';
```

⚠ Жду 🟢 от стратега на DELETE. До этого — не трогаю.

Косвенно это поднимает другой вопрос: **на `pvl_garden_mentor_links.student_id` нет FK к `profiles(id)`** — иначе orphan не мог бы появиться. Связано с `TECH-DEBT-FK-CONTRACTS` в backlog.

### 3.2 BUG-PDF-EXPORT-OKLAB-FAIL — добавлен в backlog

Заведено в `plans/BACKLOG.md` после `BUG-PVL-COHORT-NULL-OVERWRITE`
(P2, перед `BUG-PVL-ENSURE-RESPECTS-ROLE`). Тело: симптом
(unsupported color function "oklab"), root cause (Tailwind v4
oklab vs html2canvas 1.4.1), три решения (A обновить html2canvas,
B конвертация oklab→rgb через computed style, C print-friendly
CSS). MON-001 не ловит — `handleExportPdf` caught.

**Файл изменён локально, не закоммичен** (recon read-only). После
🟢 от стратега могу включить в Phase 2B / отдельный заход вместе с
fix мейн-бага.

---

## 4. Что я предлагаю как fix-стратегию

Без runtime данных от Ирины **точный root cause не зафиксирован**.
Поэтому fix-варианта три, в зависимости от того, что покажет диагностика 2:

### Вариант A — Sync не отрабатывает / падает

Если `mentorProfiles` Ирины пуст или sync ловит exception:
- Возможно api.getUsers возвращает не всё (PostgREST page limit?
  тяжёлый RLS таймаут?).
- Fix: добавить **явный retry / debug log** в `syncPvlActorsFromGarden`
  + `window.__pvlDomainApi` для будущих recon'ов.

### Вариант B — Hydrate тихо падает

Если `mentorProfiles[Ирина].menteeIds=[]` и `studentProfiles` содержит
трёх студенток:
- `listGardenMentorLinksByStudentIds` бросил → caught в hydrate.
- Fix: проверить `logDbFallback` storage; добавить `reportClientError`
  в catch hydrate (через MON-001), чтобы такие сценарии алертили в
  TG → не теряем в blackbox.

### Вариант C — Race condition стабилизировался

Если всё в db есть, но `buildMentorMenteeRows` возвращает пусто:
- bug в `refreshKey`/`useMemo` deps.
- Fix: добавить зависимость на `db._pvlGardenApplicantsSynced` или
  длину `db.mentorProfiles` в useMemo.

Все три fix'а **минимальные** и не ломают существующее. Но **выбрать
без диагностики не могу**.

---

## 5. Git status

Никаких коммитов / push'ей. Состояние локально:

```
$ git status --short | grep -E "^[ M] (App|main|services|views|components|plans)" | head
 M plans/BACKLOG.md
```

Только `plans/BACKLOG.md` — добавил BUG-PDF-EXPORT-OKLAB-FAIL.
Остальные файлы я только читал. Если хочешь — могу `git checkout
plans/BACKLOG.md` чтобы оставить полный clean (но тогда тикет
потеряется до следующего коммита-сессии).

---

## 6. Жду от тебя

1. **🟢 на DELETE orphan record 579a3392** (раздел 3.1).
2. **Промпт для Ольги/Ирины** для диагностики (раздел 2). Я
   составил sample-script, ты можешь его адаптировать или дать
   свой.
3. После получения runtime данных — выбираем fix-вариант (A/B/C
   раздел 4), пишем `_03` план apply, дальше — preview + 🟢 PUSH.

Жду `_03`.
