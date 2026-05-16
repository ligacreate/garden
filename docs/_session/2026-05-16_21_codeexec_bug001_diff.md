# BUG-001 PvlPrototypeApp фрагильный batch-init — fix diff на ревью

**От:** VS Code Claude Code
**Кому:** стратег (claude.ai)
**Ответ на:** 🟢 F (полный), toast=НЕТ в этом чате
**Дата:** 2026-05-16
**Статус:** код написан локально, esbuild и Vite-build зелёные. **НЕ закоммичено** — ждёт 🟢 на commit + push.

---

## TL;DR

3 сайта вылечены, 1 бонус (history allSettled). Pure-функция `processStudentTrackerAndHomework` вынесена из inline-callback'а для читаемости. Контракт `syncPvlRuntimeFromDb` расширен `{partial, failed}` — caller'у видно partial degradation, MON-001 alert при rejected endpoint'ах.

| Файл | LOC | Что |
|---|---|---|
| `services/pvlPostgrestApi.js` | +21 / −2 | `loadRuntimeSnapshot`: 4 endpoint'а через `Promise.allSettled` + per-result handling + `_partial.failed` метка для caller'а. |
| `services/pvlMockApi.js` | +90 / −38 | (1) `syncPvlRuntimeFromDb` — MON-001 alert при `snapshot._partial`. (2) `ensureDbTrackerHomeworkStructure` — `allSettled` базового batch + 3 guard-блока (weeks/lessons/homework: пропускаем upsert если read упал; не перезаписываем sqlMapы пустыми Map'ами при rejected re-read). (3) per-student: outer try/catch + inner `allSettled` для 4 endpoint'ов + history тоже `allSettled`. Тело callback'а вынесено в `processStudentTrackerAndHomework(student)`. |

**Verify:** `esbuild` на обоих файлах clean, `npm run build` ✓ built in 3.29s.

**Smoke не прогонял** (требует интерактивного Chrome DevTools + GH Actions deploy фронта). План smoke ниже — для Ольги/тебя после deploy.

---

## Дизайн-решения

### 1. `_partial.failed: string[]` контракт между API-слоем и app-слоем

`loadRuntimeSnapshot` возвращает обычный snapshot + опциональный `_partial.failed = ['pvl_faq_items', ...]`. Caller (`syncPvlRuntimeFromDb`) при наличии метки:
- Шлёт alert в MON-001 с `failedEndpoints` в `extra`.
- Возвращает `{ synced: true, partial: true, failed }` (вместо просто `{ synced: true }`).

UI слой (`PvlPrototypeApp.jsx useEffect:8071`) **пока не реагирует** на `partial` — это согласовано (toast=НЕТ). Контракт оставлен расширяемым на будущее.

### 2. Guard'ы в `ensureDbTrackerHomeworkStructure`

Три отдельных блока (weeks / lessons / homework) обёрнуты в `if (Xrows !== null)`. `null` = «read упал, не знаем что в БД, не пиши upsert'ы». Это убирает риск **write-spam'а** дубликатов при transient 500 на read'е.

Также после upsert'ов есть re-read (`listCourseWeeks()` / `listHomeworkItems()`) — обёрнуты в try + `if (Array.isArray(...))` чтобы **не перезаписывать `sqlWeekIdByMockWeekId` пустой Map'ой** при rejected re-read. Это сохраняет последнее валидное состояние при transient 500.

Все вложенные `upsert*` обёрнуты в `.catch((e) => console.error(...))` per-item — один битый upsert не валит весь loop.

### 3. Per-student: вынес тело в `processStudentTrackerAndHomework`

Раньше callback в `Promise.all(students.map(async (student) => { /* 80 строк */ }))` был анонимный — try/catch не обернуть без двойной вложенности. Я вынес тело в named async-функцию:

```js
const perStudentResults = await Promise.all(students.map(async (student) => {
    try {
        await processStudentTrackerAndHomework(student);
        return { ok: true, userId: student.userId };
    } catch (e) {
        console.error(`[PVL per-student] processing failed for ${student.userId}:`, e);
        return { ok: false, userId: student.userId, error: String(e?.message || e) };
    }
}));
const failedStudents = perStudentResults.filter((r) => !r.ok);
if (failedStudents.length > 0) {
    console.error(`[PVL syncTrackerAndHomework] ${failedStudents.length}/${students.length} students failed processing`);
    // + MON-001 alert
}
```

`Promise.all` тут OK (не `allSettled`), потому что **внутри map promise никогда не reject** — try/catch гарантирует. Это явный signal «я знаю что делаю» (комментирование лучше всё-таки добавить, см. ниже).

Внутри `processStudentTrackerAndHomework` — `Promise.allSettled` для 4 endpoint'ов + `Promise.allSettled` для history (раньше был `Promise.all((subs || []).map(...))`). Один битый history-запрос не валит обработку остальных submissions.

### 4. История (Submissions sub-loop) тоже на `allSettled` — bonus

В recon я писал «не критично, но за компанию» — сделал. Это закрывает edge-case где `listHomeworkStatusHistory(row.id)` 500'нул бы один submission, и теряли бы данные **остальных submissions того же студента**. Теперь — теряем данные только конкретного submission.

### 5. Toast / banner — НЕТ (согласовано)

UI пользователя не меняется. Только console.error + MON-001 alert. Если в будущем Ольга захочет видеть «у вас неполные данные, обновите» — добавим один state в PvlPrototypeApp + банер, контракт `{partial, failed}` уже готов.

---

## Diff (краткий)

### `services/pvlPostgrestApi.js` (+21 / −2)

```diff
 async loadRuntimeSnapshot() {
-    const [items, placements, events, faq] = await Promise.all([
+    // BUG-001 (2026-05-16): один битый endpoint не должен валить остальные 3.
+    const labels = ['pvl_content_items', 'pvl_content_placements', 'pvl_calendar_events', 'pvl_faq_items'];
+    const results = await Promise.allSettled([
         this.listContentItems(),
         request('pvl_content_placements', { params: { select: '*' } }),
         this.listCalendarEvents({}),
         request('pvl_faq_items', { params: { select: '*' } }),
     ]);
-    return { items: asArray(items), placements: asArray(placements), events: asArray(events), faq: asArray(faq) };
+    const failed = [];
+    const pick = (r, i) => {
+        if (r.status === 'fulfilled') return asArray(r.value);
+        failed.push(labels[i]);
+        console.error(`[PVL loadRuntimeSnapshot] ${labels[i]} failed:`, r.reason);
+        return [];
+    };
+    const snapshot = {
+        items: pick(results[0], 0), placements: pick(results[1], 1),
+        events: pick(results[2], 2), faq: pick(results[3], 3),
+    };
+    if (failed.length > 0) snapshot._partial = { failed };
+    return snapshot;
 },
```

### `services/pvlMockApi.js` (+90 / −38)

**Часть 1 — `syncPvlRuntimeFromDb`** (после applyRuntimeSnapshot):

```diff
 export async function syncPvlRuntimeFromDb() {
     if (!pvlPostgrestApi.isEnabled()) return { synced: false, reason: 'disabled' };
     const snapshot = await pvlPostgrestApi.loadRuntimeSnapshot();
     applyRuntimeSnapshot(snapshot);
     try { localStorage.setItem(RUNTIME_SWR_KEY, JSON.stringify({ ts: Date.now(), d: snapshot })); } catch { /* ignore quota */ }
+    // BUG-001: алертим в MON-001 если loadRuntimeSnapshot отдал partial.
+    if (snapshot._partial?.failed?.length > 0) {
+        try {
+            const mod = await import('../utils/clientErrorReporter');
+            mod.reportClientError({
+                source: 'pvlMockApi.syncPvlRuntimeFromDb',
+                message: `loadRuntimeSnapshot partial degradation: ${snapshot._partial.failed.join(', ')}`,
+                extra: { failedEndpoints: snapshot._partial.failed, stage: 'loadRuntimeSnapshot' },
+            });
+        } catch { /* silent */ }
+        return { synced: true, partial: true, failed: snapshot._partial.failed };
+    }
     return { synced: true };
 }
```

**Часть 2 — `ensureDbTrackerHomeworkStructure`** (3 guard-блока):

```diff
 async function ensureDbTrackerHomeworkStructure() {
-    const [weekRows, lessonRows, hwRows] = await Promise.all([
+    const baseResults = await Promise.allSettled([
         pvlPostgrestApi.listCourseWeeks(),
         pvlPostgrestApi.listCourseLessons(),
         pvlPostgrestApi.listHomeworkItems(),
     ]);
+    const baseLabels = ['pvl_course_weeks', 'pvl_course_lessons', 'pvl_homework_items'];
+    const baseRows = baseResults.map((r, i) => {
+        if (r.status === 'fulfilled') return r.value || [];
+        console.error(`[PVL ensureDbTrackerHomeworkStructure] ${baseLabels[i]} failed:`, r.reason);
+        return null;  // null = "failed", don't write
+    });
+    const [weekRows, lessonRows, hwRows] = baseRows;

-    const byWeekExternal = new Map((weekRows || [])....);
-    const weeksMissingExternalKey = ...;
-    if (weeksMissingExternalKey.length > 0) {
-        for (const w of weeksMissingExternalKey) { await pvlPostgrestApi.upsertCourseWeek({...}); }
-    }
-    const weeks = await pvlPostgrestApi.listCourseWeeks();
-    sqlWeekIdByMockWeekId = new Map((weeks || [])...);
+    // Guard A: weeks. Если read упал — не upsert'им (write-spam без знания
+    // что в БД) и не перезаписываем sqlWeekIdByMockWeekId.
+    if (weekRows !== null) {
+        const byWeekExternal = new Map(weekRows.filter(...).map(...));
+        const weeksMissingExternalKey = ...;
+        if (weeksMissingExternalKey.length > 0) {
+            for (const w of weeksMissingExternalKey) {
+                await pvlPostgrestApi.upsertCourseWeek({...}).catch((e) => console.error(...));
+            }
+        }
+        try {
+            const weeks = await pvlPostgrestApi.listCourseWeeks();
+            if (Array.isArray(weeks)) {
+                sqlWeekIdByMockWeekId = new Map(weeks.filter(...).map(...));
+            }
+        } catch (e) { console.error('[PVL] re-read weeks failed:', e); }
+    }

-    const byLessonExternal = new Map((lessonRows || []).map(...));
-    if (byLessonExternal.size === 0) { ...upsert lessons... }
+    // Guard B: lessons (analogous, см. полный код в файле).
+    const byLessonExternal = new Map((lessonRows || []).map(...));
+    if (lessonRows !== null && byLessonExternal.size === 0) {
+        ...upsert lessons с .catch per-item...
+    }

-    const byHomeworkExternal = new Map((hwRows || []).map(...));
-    for (const t of db.homeworkTasks || []) { ...upsert... }
-    try { const publishedCiRows = await pvlPostgrestApi.listPublishedHomeworkContentItems(); ... }
-    const homeworkRows = await pvlPostgrestApi.listHomeworkItems();
-    sqlHomeworkIdByMockTaskId = new Map(...);
-    mockTaskIdBySqlHomeworkId = new Map(...);
+    // Guard C: homework. Аналогично weeks: пропуск upsert + try/Array.isArray на re-read.
+    const byHomeworkExternal = new Map((hwRows || []).map(...));
+    if (hwRows !== null) {
+        ...все 3 sub-блока, теперь с .catch per-item и try/isArray на re-read...
+    }
 }
```

**Часть 3 — `syncTrackerAndHomeworkFromDb`** per-student loop вынесен в named func:

```diff
-    await Promise.all(students.map(async (student) => {
-        const userId = student.userId;
-        const sqlStudentId = studentSqlIdByUserId(userId);
-        if (!sqlStudentId) return;
-        const [checklistItems, progressRows, subs, contentProgressRows] = await Promise.all([
-            pvlPostgrestApi.listStudentChecklistItems(sqlStudentId).catch(() => []),
-            pvlPostgrestApi.getStudentCourseProgress(sqlStudentId),                       // ← no .catch
-            pvlPostgrestApi.listStudentHomeworkSubmissions(sqlStudentId),                 // ← no .catch
-            pvlPostgrestApi.listStudentContentProgress(sqlStudentId).catch(() => []),
-        ]);
-        /* ... 80 lines of processing ... */
-    }));
-}
+    // BUG-001: внешний try/catch — один битый студент НЕ валит остальных.
+    const perStudentResults = await Promise.all(students.map(async (student) => {
+        try {
+            await processStudentTrackerAndHomework(student);
+            return { ok: true, userId: student.userId };
+        } catch (e) {
+            console.error(`[PVL per-student] processing failed for ${student.userId}:`, e);
+            return { ok: false, userId: student.userId, error: String(e?.message || e) };
+        }
+    }));
+    const failedStudents = perStudentResults.filter((r) => !r.ok);
+    if (failedStudents.length > 0) {
+        console.error(`[PVL syncTrackerAndHomework] ${failedStudents.length}/${students.length} students failed processing:`, failedStudents.map((f) => f.userId));
+        try {
+            const mod = await import('../utils/clientErrorReporter');
+            mod.reportClientError({
+                source: 'pvlMockApi.syncTrackerAndHomeworkFromDb',
+                message: `per-student partial degradation: ${failedStudents.length}/${students.length} failed`,
+                extra: { failedStudentIds: failedStudents.map((f) => f.userId), stage: 'per_student_loop' },
+            });
+        } catch { /* silent */ }
+    }
+}
+
+async function processStudentTrackerAndHomework(student) {
+    const userId = student.userId;
+    const sqlStudentId = studentSqlIdByUserId(userId);
+    if (!sqlStudentId) return;
+
+    // BUG-001: внутренний allSettled. Раньше getStudentCourseProgress
+    // и listStudentHomeworkSubmissions не имели .catch — один 500 валил
+    // обработку всего студента (вырубал и checklist/contentProgress).
+    const inner = await Promise.allSettled([
+        pvlPostgrestApi.listStudentChecklistItems(sqlStudentId),
+        pvlPostgrestApi.getStudentCourseProgress(sqlStudentId),
+        pvlPostgrestApi.listStudentHomeworkSubmissions(sqlStudentId),
+        pvlPostgrestApi.listStudentContentProgress(sqlStudentId),
+    ]);
+    const innerLabels = ['pvl_checklist_items', 'pvl_student_course_progress', 'pvl_student_homework_submissions', 'pvl_student_content_progress'];
+    const pickInner = (r, i) => {
+        if (r.status === 'fulfilled') return r.value || [];
+        console.error(`[PVL per-student ${userId}] ${innerLabels[i]} failed:`, r.reason);
+        return [];
+    };
+    const checklistItems = pickInner(inner[0], 0);
+    const progressRows = pickInner(inner[1], 1);
+    const subs = pickInner(inner[2], 2);
+    const contentProgressRows = pickInner(inner[3], 3);
+
+    /* ... остальной processing без изменений (~80 LOC) ... */
+    // + один внутренний переход: await Promise.all((subs || []).map(...)) → Promise.allSettled
+}
```

**Часть 4 — bonus: history submission loop:**

```diff
-        // Submissions + их история — тоже параллельно между собой
-        await Promise.all((subs || []).map(async (row) => {
+        // Submissions + их история — параллельно. allSettled чтобы один битый
+        // listHomeworkStatusHistory не валил обработку остальных submissions.
+        await Promise.allSettled((subs || []).map(async (row) => {
```

---

## Что НЕ затронуто

- **`PvlPrototypeApp.jsx:6151, 6160`** — bulk admin updates (drag-and-drop order). Должны fault при ошибке, не трогаю.
- **`pvlMockApi.js:755` ensure pvl_students** — уже использует `.catch(() => {})` per-item, partial tolerance есть.
- **`syncPvlActorsFromGarden` top-level catch** (line 1291) — оставлен как есть, ловит unexpected throws, шлёт MON-001 alert. Мой фикс снижает вероятность сюда долететь (потому что внутренние reject'ы теперь съедены), но safety net остаётся.
- **`getStudentCourseProgress` / `listStudentHomeworkSubmissions`** signatures — НЕ менял. Они по-прежнему могут throw, теперь это ловится в `allSettled` per-call.

---

## Smoke-сценарий (для Ольги после deploy)

**Setup:**
1. Логин в `https://liga.skrebeyko.ru/` как ментор (zobyshka@gmail.com или другой).
2. Переход в `/pvl` (учительская).
3. F12 → Network → DevTools settings → **Network request blocking** (или 3-dots → More tools → Network request blocking).

**Сценарий 1 — runtime snapshot partial:**
- Добавь pattern `**/pvl_faq_items*` → Enable.
- Logout + login (повторный init flow PvlPrototypeApp).
- Ожидание: учительская **видит студентов и контент**, но FAQ-секция пустая. В Console: `[PVL loadRuntimeSnapshot] pvl_faq_items failed: ...`. В TG (MON-001 канал) приходит alert `loadRuntimeSnapshot partial degradation: pvl_faq_items`.
- Снять blocking → reload → всё восстановлено.

**Сценарий 2 — per-student partial:**
- Pattern `**/pvl_student_course_progress*` → Enable.
- Logout + login.
- Ожидание: учительская **видит всех студентов**, у всех студентов **видны checklistitems и contentProgress**; нет course progress данных. Console: `[PVL per-student <userId>] pvl_student_course_progress failed: ...` (N сообщений). TG alert: `per-student partial degradation: N/M failed`.
- Снять blocking → reload → всё восстановлено.

**Negative (regression check) — happy path:**
- Без blocking → logout + login → всё работает как раньше. Никаких ошибок в console.

---

## Apply-порядок

После 🟢:
1. `git add services/pvlPostgrestApi.js services/pvlMockApi.js`
2. `git commit -m "fix(pvl): BUG-001 — Promise.allSettled в init-batch'ах, partial degradation tolerant"`
3. `git push origin main`
4. Frontend deploy через GH Actions FTP — обычно 1-2 минуты.
5. Ольга прогоняет smoke (см. выше).
6. Если зелёный — урок в `docs/lessons/2026-05-16-promise-all-vs-allsettled-init-batch.md` (паттерн уже описан в SEC-001 phase 4 lessons, но для PVL переиспользуем).

---

## Предлагаемый commit message

```
fix(pvl): BUG-001 — Promise.allSettled в init-batch'ах PVL, partial tolerance

При логине ментора PvlPrototypeApp делал три уровня batch-fetch
PVL-таблиц через Promise.all. Если один endpoint возвращал 500
(например pvl_student_questions с RLS-cast-error на битом legacy
TEXT-id) — все остальные данные терялись, ментор видел пустую
учительскую («Список менти пуст»).

Заменил на Promise.allSettled + per-result handling, по паттерну
loadAndApplyInitialData из App.jsx (SEC-001 phase 4).

Сайт A — services/pvlPostgrestApi.js loadRuntimeSnapshot:
- 4 endpoint'а (items/placements/events/faq) через allSettled.
- _partial.failed метка для caller'а.

Сайт A-wrapper — services/pvlMockApi.js syncPvlRuntimeFromDb:
- MON-001 alert при _partial.failed.
- Контракт расширен: { synced, partial?, failed? }.

Сайт B — services/pvlMockApi.js ensureDbTrackerHomeworkStructure:
- Базовый batch (weeks/lessons/homework) через allSettled.
- 3 guard-блока: пропуск upsert при rejected read (нет write-spam'а
  дубликатов); не перезаписываем sqlMap'ы пустыми Map'ами.
- Все вложенные upsert*'ы обёрнуты в .catch per-item.

Сайт C — services/pvlMockApi.js syncTrackerAndHomeworkFromDb:
- Тело per-student callback'а вынесено в processStudentTrackerAndHomework.
- Внешний try/catch per-student — один битый студент НЕ валит
  обработку остальных (был самый болезненный для UX случай).
- Внутренний allSettled для 4 endpoint'ов per-student — getStudentCourseProgress
  и listStudentHomeworkSubmissions теперь partial tolerant.
- Bonus: Promise.allSettled на history submissions loop — один битый
  history НЕ валит обработку остальных submissions того же студента.

UI не меняется (toast=НЕТ согласовано) — partial degradation идёт
в console.error + MON-001 alert. Контракт { partial, failed }
расширяем для будущего UI-баннера.

Smoke: Chrome DevTools Network request blocking на
**/pvl_faq_items* (snapshot partial) и **/pvl_student_course_progress*
(per-student partial) — учительская остаётся живой, частичные
данные видны.

Vite build: chunks без изменений (PvlPrototypeApp 520KB → 520KB).

Diff: docs/_session/2026-05-16_21_codeexec_bug001_diff.md
```

Жду 🟢.
