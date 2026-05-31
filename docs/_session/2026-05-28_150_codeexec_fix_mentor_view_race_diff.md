# Track B1 — STOP: диагноз требует пересмотра стратегом

**Адресат:** Ольга (связной) → стратег.
**Автор:** VS Code Claude Code (codeexec).
**Дата:** 2026-05-28 (нумерация _150 после _149).
**Статус:** ⛔ **fix НЕ применён**, git status пуст. Жду уточнения от стратега.

---

## TL;DR

Литеральная гипотеза из ТЗ Track B1 — «`hydrateGardenMentorAssignmentsFromDb` зовётся **раньше** готовности `db.studentProfiles`, и срабатывает молчаливый `if (ids.length === 0) return;`» — **не подтверждается кодом**.

- `hydrateGardenMentorAssignmentsFromDb` вызывается **внутри** `syncPvlActorsFromGarden` на строке [services/pvlMockApi.js:1341](garden/services/pvlMockApi.js#L1341), **ПОСЛЕ** того как та же функция уже наполнила `db.studentProfiles` (строки [1276-1325](garden/services/pvlMockApi.js#L1276-L1325)).
- Других вызывающих сторон у `hydrateGardenMentorAssignmentsFromDb` нет (grep по всему репо — единственный call site).
- Для Василины `ids.length === 0` **не сработает**: ids собирается из всех `db.studentProfiles` (а это весь поток + другие синхронизированные ученицы), а не только из её менти. Pattern A (бейлаут на пустой ids) её симптом **не лечит**.

Я зафиксировал свой ход «STOP по правилу пункта 6 ТЗ»: «Если обнаружишь, что race в другом месте — STOP».

Ниже разбираю что показало чтение кода и какие **3 альтернативные паттерна** реально соответствуют race-сценарию у Василины. Жду решения, какой паттерн (или комбинацию) применять.

---

## 1. Что реально показывает код

### 1.1. Единственный вызов `hydrateGardenMentorAssignmentsFromDb`

```
services/pvlMockApi.js:1341  await hydrateGardenMentorAssignmentsFromDb();
```

Это **внутри** `syncPvlActorsFromGarden`, в shape:

```js
export async function syncPvlActorsFromGarden() {
  // [1186-1219] SWR-кэш + api.getUsers — загрузить массив users
  // [1232] mentors = users.filter(canActAsCourseMentor)
  // [1235] pvlTrackMembers = users.filter(classifyGardenProfileForPvlStudent !== null)
  // [1239-1274] mentors → db.users.push + db.mentorProfiles.push (menteeIds: [])
  // [1276-1325] pvlTrackMembers → db.users.push + db.studentProfiles.push
  // [1328-1332] applicants → ensurePvlStudentInDb (FK row)
  await hydrateGardenMentorAssignmentsFromDb();  // ← вот тут, line 1341
  // [1369-1393] syncTrackerAndHomeworkFromDb (для активных трек-членов)
}
```

То есть `db.studentProfiles` **уже наполнен** к моменту вызова hydrate — внутри той же функции, тем же `users` массивом.

### 1.2. Что значит для Василины

Когда `syncPvlActorsFromGarden` отработает с её JWT (мы это подтвердили в _149):
- `api.getUsers()` → 58 profiles (включая Лилию/Марину/Ольгу Р., все `role='applicant'`).
- `classifyGardenProfileForPvlStudent` каждой из них → `{ gardenRole: 'applicant' }` (не `null`).
- Все три попадают в `pvlTrackMembers` → push в `db.studentProfiles`.
- ids в `hydrateGardenMentorAssignmentsFromDb` = все userId из `db.studentProfiles` (включая её 3 менти и всех остальных учениц потока).
- `listGardenMentorLinksByStudentIds(ids)` под её JWT возвращает 3 строки (её 3 линка) — мы это подтвердили в _149 §2.3.
- `applyGardenMentorLinkRow` правильно обновляет `db.mentorProfiles[Василина].menteeIds = [Лилия, Марина, Ольга Р.]`.

**Pattern A** (бейлаут на `ids.length === 0`) **не отработает у Василины** — у неё ids явно непустой (вся когорта).

### 1.3. Откуда тогда пустота?

Если код работает как описано, у Василины **должны** быть menti после первой полной отработки `syncPvlActorsFromGarden`. То что они НЕ появляются — означает один из этих сценариев:

**Сценарий S1: SWR-кэш `pvl_users_swr_v1` стейл и не содержит её менти.**
- На первом mount Василина читает stale cache (без applicants Лилии/Марины/Ольги Р.).
- Сейчас в [1196-1203](garden/services/pvlMockApi.js#L1196-L1203) код: «кэш есть — используем сразу, обновляем в фоне».
- `users = cachedUsers` (stale) → `pvlTrackMembers` не содержит её менти → `db.studentProfiles` без них → hydrate с ids БЕЗ её менти → серверу спрашивает links для не-её студентов → 0 её строк → `db.mentorProfiles[Василина].menteeIds` остаётся `[]`.
- Background-refresh обновляет cache **для следующей сессии**, но в текущей `db` уже зафиксирован stale state.
- 30s setTimeout retry ([PvlPrototypeApp.jsx:8226-8233](garden/views/PvlPrototypeApp.jsx#L8226-L8233)) ловит ту же самую SWR-логику: `cachedUsers` уже обновлён фоном → fresh → должно сработать. Но если Василина закрыла вкладку до 30s — пустота сохраняется.

**Сценарий S2: `api.getUsers()` падает на network/JWT-bootstrap.**
- `users.length === 0` после 3-retry-cycle (0/100/200ms) → `return { synced: false, reason: 'no_users' }` на [строке 1220](garden/services/pvlMockApi.js#L1220) → hydrate **не зовётся вообще**.
- `dataService._cachedFetch` ([dataService.js:1170](garden/services/dataService.js#L1170)) кэширует `[]` на 30 сек → повторный sync через 30s setTimeout **получит тот же empty array из in-memory кэша** → `synced: false` ещё раз.
- Через >30s старый кэш истекает, но к этому моменту нет triggering re-sync.

**Сценарий S3: race RealtimeChannel / forceRefresh не доходит после background SWR refresh.**
- Cached path выполнился → hydrate отработал на stale → задеплоился stale state в `db.mentorProfiles[Василина].menteeIds = []`.
- Background SWR-refresh обновляет `pvl_users_swr_v1` → но cb на line 1201 **только сохраняет в localStorage**, не вызывает re-sync `db`.
- На следующем session-mount всё повторится, если localStorage в это время уже актуальный → corrext.
- Но если background SWR падает (network) → cache не обновляется → каждый новый mount читает один и тот же stale cache.

---

## 2. Почему буквальный Pattern A не сработает

ТЗ Track B1 описывает:

> (A) В `hydrateGardenMentorAssignmentsFromDb`: если `ids.length === 0`,
>     не возвращаться молча. Сделать await на функцию что наполняет
>     `db.studentProfiles` (например `getUsers()`), затем повторно собрать
>     ids.

Для **Василины** `ids.length === 0` **никогда не сработает**: у неё ids = весь поток (все ученицы + другие мenti других менторов). Pattern A защищает от сценария «db.studentProfiles вообще пуст» (например первый mount, кэш пуст, network падает). Это **другой** класс багов — был зарепорчен ранее как `BUG-PVL-ADMIN-AS-MENTOR-EMPTY` и закрыт фиксом Variant A/B/C в мае ([lessons/2026-05-11-pvl-admin-mentor-race-condition.md](garden/docs/lessons/2026-05-11-pvl-admin-mentor-race-condition.md)).

Pattern B (useEffect с зависимостью от `db.studentProfiles.length > 0`) тоже не подходит:
- hydrate **не зовётся из useEffect** — он внутри `syncPvlActorsFromGarden`.
- На React-уровне useMemo уже имеет deps на `_pvlGardenApplicantsSynced`, `mentorProfiles.length`, `studentProfiles.length` — это Variant C из _11. Когда state меняется — пересчёт срабатывает.
- Проблема не в re-render'е display'я, а в том что **в `db.mentorProfiles[Василина].menteeIds` записан пустой массив** и больше не перезаписывается.

---

## 3. Какие паттерны РЕАЛЬНО соответствуют race у Василины

Предлагаю три варианта на выбор стратегу:

### Pattern A' — bypass SWR-cache при первом sync, использовать только background-refresh

`syncPvlActorsFromGarden` сейчас: если cache есть — используем stale данные, fresh обновляем в фоне. Меняем на: **ждём fresh данные, cache используем только если fresh не пришёл за N ms**.

```js
// services/pvlMockApi.js:1183-1219 — переписать SWR-логику
const cachePromise = readCachedUsers();
const networkPromise = api.getUsers().then((fresh) => {
    if (Array.isArray(fresh) && fresh.length > 0) {
        writeCachedUsers(fresh);
    }
    return fresh;
}).catch(() => []);

// "Race vs timeout": ждём fresh 800ms, иначе fallback на cache
const fresh = await Promise.race([
    networkPromise,
    new Promise((r) => setTimeout(() => r(null), 800)),
]);

let users;
if (Array.isArray(fresh) && fresh.length > 0) {
    users = fresh;
} else {
    users = (await cachePromise) || (await networkPromise);  // ждём дольше
}
if (!Array.isArray(users) || users.length === 0) return { synced: false, reason: 'no_users' };
```

**Плюсы:** напрямую лечит S1 (stale cache).
**Минусы:** замедляет initial sync на ~800ms (особенно если в 800ms не уложились — ждём ещё). Перепишет существующую SWR-логику, нужен внимательный review.

### Pattern B' — re-run hydrate после background SWR refresh

Background refresh в `syncPvlActorsFromGarden` сейчас только обновляет localStorage и не зовёт re-sync. Меняем: после успешного fresh-refresh — re-classify и re-hydrate.

```js
api.getUsers().then(async (fresh) => {
    if (!Array.isArray(fresh) || fresh.length === 0) return;
    writeCachedUsers(fresh);
    // diff: если в fresh появились новые userId — re-populate studentProfiles + re-hydrate
    const existingIds = new Set((db.studentProfiles || []).map((p) => String(p.userId)));
    const freshClassified = fresh
        .map((u) => ({ profile: u, admission: classifyGardenProfileForPvlStudent(u) }))
        .filter((x) => x.admission != null);
    const hasNew = freshClassified.some((x) => !existingIds.has(String(x.profile.id)));
    if (hasNew) {
        // запустить полный re-sync
        await syncPvlActorsFromGarden();  // но с защитой от re-entry
    }
}).catch(() => {});
```

**Плюсы:** локальный фикс, не меняет SWR-семантику.
**Минусы:** re-entry в `syncPvlActorsFromGarden` — нужен флаг `_pvlSyncInFlight`, иначе бесконечная рекурсия.

### Pattern C' — после успешной hydrate, проверить «у меня (mentor) есть менti?»

Самый точечный: после `applyGardenMentorLinkRow` в `hydrateGardenMentorAssignmentsFromDb`, если для текущего ментора (мы знаем его UID через `auth.uid()` / `actingUserId`) menteeIds оказался пуст — но в БД есть линки с `mentor_id = я` — это сигнал что studentProfiles не содержит их. Делаем дозагрузку:

```js
async function hydrateGardenMentorAssignmentsFromDb() {
    if (!pvlPostgrestApi.isEnabled()) return;
    const ids = [...new Set((db.studentProfiles || []).map((p) => String(p.userId || '').trim()).filter(isUuidString))];
    if (ids.length > 0) {
        const rows = await pvlPostgrestApi.listGardenMentorLinksByStudentIds(ids);
        for (const row of rows || []) applyGardenMentorLinkRow(row);
    }

    // Дополнительный gap-fix: текущий пользователь — ментор, но menteeIds пуст?
    const currentUid = getAuthUserId();
    if (!currentUid) return;
    const myMentorProfile = (db.mentorProfiles || []).find((m) => String(m.userId) === String(currentUid));
    if (!myMentorProfile || (myMentorProfile.menteeIds || []).length > 0) return;

    // Спросим напрямую: есть ли в БД линки для меня?
    const myLinks = await pvlPostgrestApi.listGardenMentorLinksByMentorId(currentUid);  // NEW API
    if (!myLinks || myLinks.length === 0) return;  // правда пусто — ок

    // Есть линки, но db.studentProfiles не имеет этих студентов — догружаем
    const missingStudentIds = myLinks.map((r) => r.student_id).filter((id) => !ids.includes(id));
    if (missingStudentIds.length === 0) {
        // ids всё включают, просто applyGardenMentorLinkRow выше не сматчилось — apply сейчас
        for (const row of myLinks) applyGardenMentorLinkRow(row);
        return;
    }

    // Дозагрузить недостающих студентов из profiles и pvl_students
    const missingProfiles = await api.getUsersByIds(missingStudentIds);  // NEW API
    for (const u of missingProfiles) {
        // те же шаги что в syncPvlActorsFromGarden строки 1276-1325
    }
    for (const row of myLinks) applyGardenMentorLinkRow(row);
}
```

**Плюсы:** хирургично, не трогает SWR-семантику, лечит ровно сценарий «мой mentorProfile пуст, хотя в БД есть линки».
**Минусы:** требует двух новых API в `pvlPostgrestApi`: `listGardenMentorLinksByMentorId` и `getUsersByIds` (или эквивалентный фильтр). Логика дозагрузки студентов дублирует часть `syncPvlActorsFromGarden`.

---

## 4. Дополнительные нюансы для стратега

### 4.1. 30s setTimeout retry

В [PvlPrototypeApp.jsx:8226-8233](garden/views/PvlPrototypeApp.jsx#L8226-L8233) уже есть retry через 30 сек. Это значит:
- Если Василина оставит вкладку открытой 30+ сек **после** того как background SWR cache обновился — следующий sync должен прицепить менти.
- Если она hard-reload'ит до этого — снова та же история (cache в localStorage уже свежий → должно сработать).

Возможно тут есть **дополнительный** баг — в её сценарии background SWR refresh **сам не отрабатывает** (например, JWT истекает, но не обновляется автоматически на этом endpoint). Тогда cache в localStorage НИКОГДА не обновляется, и каждый mount читает один stale кэш.

### 4.2. _149 §6 предлагает DevTools-сигналы

Я повторно настаиваю: без хотя бы **одного** живого сигнала от Василины (что именно в её `pvl_users_swr_v1` сейчас, какие network-запросы реально летят, есть ли ошибки в console) мы выбираем паттерн вслепую. Pattern A' лечит S1, Pattern B' лечит S1+S3, Pattern C' лечит S1+S2+S3 — но каждый требует разного объёма изменений.

Если стратег готов идти вслепую — я склоняюсь к **Pattern B'** как «средний по риску»: он не трогает SWR-семантику, добавляет одну дополнительную проверку diff'а на background-refresh, лечит S1 и S3. S2 (cold-network-fail) остаётся не покрытым, но он уже маскируется 30s setTimeout retry.

### 4.3. RichEditor / BUG-PVL-AUTOREFRESH

Не возвращаю `setInterval+visibilitychange+focus` — отмечаю это явно. Все три предложенных паттерна локальны к hydrate / sync-цепочке, не глобальный setInterval.

---

## 5. Что НЕ сделал

- ⛔ Не применял Pattern A (literal version) — не лечит Василину, может ввести в заблуждение.
- ⛔ Не выбрал A'/B'/C' самовольно — масштаб ре-архитектуры разный, нужен стратег-ответ.
- ⛔ Не делал `git add` (нет изменений в файлах).
- ⛔ Не делал deploy.
- ⛔ Не звал DevTools у Василины (как указал ТЗ Track B1).

---

## 6. Вопрос стратегу

Выбрать **один** из:

- **(a) A'** — переписать SWR на «сначала network, потом fallback на cache». Замедляет initial sync на ~800ms.
- **(b) B'** — добавить re-sync на background-refresh с защитой от re-entry. Локально, без изменения SWR.
- **(c) C'** — точечный gap-fix в hydrate: если я ментор и menteeIds пуст — спросить БД напрямую и дозагрузить недостающих студентов. Требует 1-2 новых API в `pvlPostgrestApi`.
- **(d)** — другое (твой паттерн, я реализую).
- **(e) Сначала DevTools у Василины**, потом фикс под конкретный сигнал.

Жду решения. Если в течение часа нет ответа и Василина продолжает работать без mentor view — могу сделать **минимальную страховку** в виде Pattern C' как наименее инвазивную (точечный gap-fix, не меняет SWR-семантику, локален к hydrate). Но это только по твоей отмашке 🟢.

---

**Git status:** clean (никаких изменений в working tree).
