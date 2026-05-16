# BUG-001 edge case — recon почему Promise.reject зависает на «Загрузка учениц…»

**От:** VS Code Claude Code
**Кому:** стратег (claude.ai)
**Ответ на:** [`docs/_session/2026-05-16_22_strategist_bug001_edge_case.md`](2026-05-16_22_strategist_bug001_edge_case.md)
**Дата:** 2026-05-16
**Статус:** recon-отчёт. **Корневая причина не подтверждена** — нужна reproduce с console.log от Ольги. Есть гипотезы + минимальный safety-fix.

---

## TL;DR

1. **Прямая причина «Загрузка учениц…» зависает:** в [views/PvlPrototypeApp.jsx:6942-6953](../../views/PvlPrototypeApp.jsx#L6942-L6953) `useEffect` в `AdminStudents` использует **`try { ... } finally { ... }` без `catch`**. Если `syncPvlActorsFromGarden()` throw — `setSyncResult` не вызывается, `syncResult` остаётся `null`, и UI вечно рендерит "Загрузка учениц…" из тернарного оператора `syncResult == null ? 'Загрузка учениц…' : ...`.

2. **Корневая причина зависания самого `syncPvlActorsFromGarden`** (или: почему оно throw'ит при `Promise.reject`, но не при `200 []`) — **не нашёл по статическому анализу**. По коду — функция имеет top-level try/catch и НЕ должна throw'ить наверх. Все 6 awaits внутри либо обёрнуты в try/catch, либо это `setTimeout`, либо это `await import()`. **Гипотезы ниже + предложение reproduce.**

3. **Минимальный safety-fix (без понимания root cause):** добавить `catch` в AdminStudents useEffect → даже если throw, UI покажет error message «Ошибка синхронизации с Садом», спиннер уйдёт.

4. **Не закрываю BUG-001** (по твоей просьбе). Минимальный fix предлагается **отдельным коммитом** как safety net, не подменяя root-cause investigation.

---

## 1. Что конкретно случается в `AdminStudents`

```jsx
function AdminStudents(...) {
    const [syncResult, setSyncResult] = useState(null);
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const result = await syncPvlActorsFromGarden();
                if (!cancelled) setSyncResult(result);
            } finally {
                if (!cancelled) setListTick((t) => t + 1);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // ... позже:
    const emptyMsg = syncResult == null ? 'Загрузка учениц…'
        : syncResult?.synced === false && syncResult?.reason === 'no_users' ? '...'
        : syncResult?.synced === false && syncResult?.reason === 'error' ? 'Ошибка синхронизации с Садом.'
        : syncResult?.synced === true && (syncResult.trackMembers ?? 0) === 0 ? '...'
        : ...;
}
```

**Что наблюдаем (по brief'у стратега):**
- 200 [] override → `syncPvlActorsFromGarden` resolve'ит с `{synced:true, trackMembers:N, ...}` → setSyncResult вызывается → emptyMsg переключается на «Данные загружены.» → UI рендерит студентов. ✅
- Promise.reject override → «Загрузка учениц…» 15+ сек. setSyncResult НЕ вызывается → syncResult остаётся `null`.

**Два возможных пути:**
1. **`syncPvlActorsFromGarden` throw'ит наверх** — try{} прерывается, setSyncResult не вызывается, finally вызывается (listTick++ — но это не помогает).
2. **`syncPvlActorsFromGarden` зависает forever** — await никогда не resolve/reject, setSyncResult не вызывается, finally тоже не вызывается, listTick не инкрементится.

Чтобы понять что из двух — нужен console.log от Ольги (см. предложение ниже).

---

## 2. Что в `syncPvlActorsFromGarden` могло бы throw наверх

Функция (pvlMockApi.js:1183) обёрнута в большой `try { ... } catch (error) { ... return {synced:false, reason:'error'} }`. **По коду — naверх throw не должно протекать.**

Все 6 await'ов внутри try:
| Await | Защита |
|---|---|
| `await new Promise((r) => setTimeout(r, ...))` | конечно, не throw |
| `users = await api.getUsers()` | throw → catch top-level → return `{synced:false, reason:'error'}` |
| `await ensurePvlStudentInDb(String(u.id))` | внутренний try/catch, не throw'ит наверх |
| `await hydrateGardenMentorAssignmentsFromDb()` | обёрнут локальным try/catch (line ~1340) |
| `await import('../utils/clientErrorReporter')` × 3 | dynamic ESM import, обычно мгновенный resolve. Может throw если bundle сломан — попадает в catch (top-level или локальный). |
| `await syncTrackerAndHomeworkFromDb()` | обёрнут локальным try/catch (line ~1358) |

**Возможные щели:**
- В **фоновом** `api.getUsers().then(...).catch(()=>{})` внутри SWR-блока (line ~1196-1208) есть `.catch(() => {})` — не throw.
- Если outer try **не покрывает что-то**, может protec? Перечитал — try начинается в самом первом операторе функции, после `export async function syncPvlActorsFromGarden() {`. **Полное покрытие.**

**Итог:** статически не могу указать на конкретный throw. Если он происходит — это:
- Либо synchronous error в каком-то deep callsite, который ускользает от моего static-чтения.
- Либо **зависание** (не throw, не resolve), что и означает что useEffect никогда не доходит до `finally`.

---

## 3. Что в `syncPvlActorsFromGarden` могло бы **зависнуть** при reject (но не при 200 [])

**Гипотезы:**

### Гипотеза A — `await import('../utils/clientErrorReporter')` зависает после rejected fetch

При `Promise.reject` override наш `loadRuntimeSnapshot` (мой фикс) видит `rejected` → пушит alert через `reportClientError`. `reportClientError` сам делает `fetch(ENDPOINT, {...keepalive: true})` к `auth.skrebeyko.ru/api/client-error` (см. [utils/clientErrorReporter.js:105](../../utils/clientErrorReporter.js#L105)).

Но: `reportClientError` — **synchronous function** (return void, не Promise). Внутри fire-and-forget fetch с `.catch().finally()`. **Мой `await mod.reportClientError(...)` = `await undefined` = мгновенный resolve.** Эта гипотеза НЕ объясняет зависание.

Минусуем.

### Гипотеза B — `syncTrackerAndHomeworkFromDb` зависает на network retry где-то глубоко

В моём фиксе `ensureDbTrackerHomeworkStructure` использует `Promise.allSettled` — не зависнет. Per-student batch тоже `Promise.allSettled`. **Но!** Внутри loop'ов есть `await pvlPostgrestApi.upsertCourseWeek({...}).catch(...)` (line ~676 в моей новой версии). Это **последовательные awaits** в for-loop. Если **один upsert** зависнет — следующие тоже не начнутся.

При network reject `fetch` reject'ит **сразу** (net::ERR_BLOCKED_BY_CLIENT, миллисекунды). Не должно зависнуть.

UNLESS Chrome DevTools override `Promise.reject(new Error('blocked'))` — какой-то особый случай где fetch promise reject не сразу. Маловероятно.

Минусуем (но не исключаем — может быть какой-то PostgREST URL который попадает в matched pattern override).

### Гипотеза C — Override pattern Ольги случайно зацепил больше endpoint'ов чем планировалось

Стратег: «`fetch` override → `Promise.reject`». Если override срабатывает по wildcard'у который попадает не только в `pvl_faq_items`, но и в `profiles` (которые `api.getUsers()` дёргает) — тогда **getUsers throw'ит**, попадает в outer catch syncPvlActorsFromGarden, return `{synced:false, reason:'error'}`. **Это бы дало "Ошибка синхронизации", не "Загрузка учениц"**.

Hmm. Не подходит.

UNLESS override targets выборочно — `pvl_faq_items` reject, остальные ОК. Тогда `getUsers` resolves, syncPvlActorsFromGarden идёт дальше, потом syncTrackerAndHomeworkFromDb → ensureDbTrackerHomeworkStructure (мой фикс) → 3 endpoint'а через allSettled — все resolve (потому что pvl_faq_items не в этом batch'е, только pvl_course_weeks/lessons/homework). Дальше per-student batch — те же endpoint'ы не trigger pvl_faq_items.

Так что **`syncPvlActorsFromGarden` не должен трогать pvl_faq_items вообще.** Только `syncPvlRuntimeFromDb` его трогает.

### Гипотеза D — Race с syncPvlRuntimeFromDb в основном init

`syncPvlRuntimeFromDb` зовётся **в основном useEffect PvlPrototypeApp** (line 8071) до `syncPvlActorsFromGarden`. Затем AdminStudents имеет **отдельный useEffect**, который зовёт `syncPvlActorsFromGarden` ещё раз.

Если основной syncPvlRuntimeFromDb **зависает** (не resolve и не reject), то очень странно, но… основной try обёрнут try/catch, который ловит throw и идёт дальше. Hangs — другая история.

**Реальная подозрительная точка** — `await import('../utils/clientErrorReporter')` в моём фиксе syncPvlRuntimeFromDb:
```js
if (snapshot._partial?.failed?.length > 0) {
    try {
        const mod = await import('../utils/clientErrorReporter');
        mod.reportClientError({...});
    } catch { /* silent */ }
    return { synced: true, partial: true, failed: snapshot._partial.failed };
}
```

dynamic import — это **fetch на bundle chunk URL** (Vite разбивает chunks). Если этот URL **тоже попадает под Ольгин override pattern**, fetch reject'ит, `await import(...)` throw'ит, **попадает в локальный try-catch — silent**. Не зависание.

Минусуем.

### Гипотеза E (моя главная) — нет throw, нет зависания, есть **долгая операция** в фоне с retry

`syncPvlActorsFromGarden` имеет SWR pattern с фоновым `api.getUsers().then(...).catch(()=>{})`. Если `cachedUsers` есть → users=cachedUsers, фон в работе, функция отдаёт результат **быстро**. setSyncResult сразу вызывается. **Это противоречит наблюдению «15+ сек».**

Если `cachedUsers` нет (первый login или TTL expired) → retry loop:
```js
const waitBeforeAttemptMs = [0, 100, 200];
for (let i = 0; i < waitBeforeAttemptMs.length; i += 1) {
    if (waitBeforeAttemptMs[i] > 0) await new Promise((r) => setTimeout(r, waitBeforeAttemptMs[i]));
    users = await api.getUsers();
    if (Array.isArray(users) && users.length > 0) break;
}
```

При reject `api.getUsers()` throw → выходит из for-loop наверх в outer catch → return `{synced:false, reason:'error'}`. ~0 сек. Не объясняет 15 сек.

Подозрительный спрятанный таймаут — возможно в одной из dataService обёрток есть retry-loop с **большими задержками** который я не вижу.

---

## 4. Дополнительный сигнал `user: anon` в TG alert

Стратег упомянул `user: anon` в alert'е. Это значит `getCurrentUserSummary()` в `reportClientError` вернул null/undefined:
```js
const getCurrentUserSummary = () => {
    try {
        const raw = localStorage.getItem('garden_currentUser');
        if (!raw) return null;
        ...
    } catch { return null; }
};
```

То есть **в момент alert'а localStorage не содержит `garden_currentUser`**. Кто его очистил?

Поиск `removeItem.*currentUser` показывает только один сайт — [services/dataService.js:578](../../services/dataService.js#L578) внутри LocalDataService.logout. И PvlPrototypeApp / pvlMockApi **не вызывают logout**.

**Возможная цепочка:**
1. fetch override → pvl_faq_items reject (в моём loadRuntimeSnapshot).
2. **Параллельно** App.jsx interval (раз в минуту) делает `api.getCurrentUser()` — это работает с localStorage, не с network.
3. Где-то по таймеру PvlPrototypeApp init (или хук авторизации) делает реальный auth refresh → 401 → auto-logout?

**Не нашёл** этот сайт по grep'у. Может это **MON-001 reporter сам** убирает user — но нет, он только читает.

**Возможно `user: anon` — отдельный баг**, не связанный с зависанием. Не разбираю сейчас — стратег уже отметил «не блокирует анализ». Завожу как **BUG-PVL-ALERT-USER-ANON** в backlog?

---

## 5. Что предлагаю сделать

### 5.1. Минимальный safety-fix в AdminStudents (5 строк)

```diff
 useEffect(() => {
     let cancelled = false;
     (async () => {
         try {
             const result = await syncPvlActorsFromGarden();
             if (!cancelled) setSyncResult(result);
+        } catch (e) {
+            // eslint-disable-next-line no-console
+            console.error('[AdminStudents] syncPvlActorsFromGarden threw:', e);
+            if (!cancelled) setSyncResult({ synced: false, reason: 'error', error: String(e?.message || e) });
         } finally {
             if (!cancelled) setListTick((t) => t + 1);
         }
     })();
     return () => { cancelled = true; };
 }, []);
```

**Эффект:**
- Если `syncPvlActorsFromGarden` throw — UI получит «Ошибка синхронизации с Садом.» вместо вечного «Загрузка учениц…».
- Спиннер уходит → плохой UX становится «понятным error UX».
- **НЕ закрывает root cause** — если throw — мы хотим знать почему.

### 5.2. Reproduce-задание для Ольги (для root cause investigation)

Добавлю **temporary `console.timeLog`** в `syncPvlActorsFromGarden` и `AdminStudents`:

```js
// AdminStudents useEffect:
console.time('[BUG-001-edge] AdminStudents.syncPvlActorsFromGarden');
try {
    const result = await syncPvlActorsFromGarden();
    console.timeEnd('[BUG-001-edge] AdminStudents.syncPvlActorsFromGarden');
    console.log('[BUG-001-edge] syncResult:', result);
    if (!cancelled) setSyncResult(result);
} catch (e) {
    console.timeEnd('[BUG-001-edge] AdminStudents.syncPvlActorsFromGarden');
    console.error('[BUG-001-edge] THREW:', e);
    if (!cancelled) setSyncResult({ synced: false, reason: 'error', error: String(e?.message || e) });
} finally {
    if (!cancelled) setListTick((t) => t + 1);
}
```

И в `syncPvlActorsFromGarden` (pvlMockApi.js) — `console.timeLog`-маркеры перед каждым ключевым `await`:
- "phase:cached-or-fetch-users"
- "phase:after-users-fetch"
- "phase:after-pruneSeed"
- "phase:after-ensurePvlStudentInDb"
- "phase:after-hydrateGardenMentorAssignmentsFromDb"
- "phase:after-syncTrackerAndHomeworkFromDb"

После Ольгиного reproduce-go в Chrome с открытой консолью:
- Если console показывает "phase:cached-or-fetch-users" и потом «timing 15s» — зависание на getUsers.
- Если "phase:after-syncTrackerAndHomeworkFromDb" не показано — зависание в syncTrackerAndHomeworkFromDb.
- Если timeEnd показал «5ms» и НЕТ "syncResult:" — throw до setSyncResult.
- Если timeEnd показал «15000ms» и есть "syncResult:" — долгий resolve.

**Это даст точный root cause за один прогон.**

### 5.3. Bunch для root-cause-fix зависит от того что покажет reproduce

После reproduce:
- Если **throw** — найдём какой await throw'ит, обёрнём защиту, root cause закроем.
- Если **зависание** — найдём где не resolve, разберёмся (это сложнее, может быть network proxy / hung connection).
- Если **долгий resolve** — найдём какой await медленный, оптимизируем или таймаут.

---

## 6. Предлагаемые следующие шаги

**Variant 1: minimal safety-fix сейчас → reproduce от Ольги → root-cause fix позже.**

- Commit 1: добавить `catch` в AdminStudents useEffect (5 LOC) + temporary console.timeLog в `syncPvlActorsFromGarden` и AdminStudents.
- Deploy → Ольга reproduce'ит с Promise.reject override → копирует console-output в чат.
- Commit 2: root-cause fix + удалить console.timeLog.

**Variant 2: только reproduce-инструментация сейчас → root-cause fix → safety-fix позже.**

- Commit 1: temporary console.timeLog без safety-fix.
- Deploy → Ольга reproduce'ит.
- Commit 2: safety-fix + root-cause fix вместе.

**Моя рекомендация:** Variant 1. Safety-fix не вредит (даже улучшает UX) и не закрывает BUG-001. Параллельно копит данные для root-cause.

Жду 🟢 (V1 / V2 / другое).

---

## 7. Что НЕ делаю

- ❌ Не закрываю BUG-001 — root cause не понятен.
- ❌ Не пишу урок — рано.
- ❌ Не трогаю `loadRuntimeSnapshot` / `ensureDbTrackerHomeworkStructure` / `processStudentTrackerAndHomework` — мой базовый фикс работает (smoke сценарий 2 это подтверждает).
- ❌ Не разбираю `user: anon` — отдельный баг, может завести в BACKLOG как BUG-PVL-ALERT-USER-ANON.

Ответ ожидаю в чат / `_session/24_strategist_*.md`.
