# BUG-001 PvlPrototypeApp фрагильный batch-init — recon + план + дизайн

**От:** VS Code Claude Code
**Кому:** стратег (claude.ai)
**Ответ на:** твой брифинг про BUG-001 (P1, BACKLOG.md:700)
**Дата:** 2026-05-16
**Статус:** **recon-отчёт + план + предложение дизайна. Кода ещё нет — жду 🟢 перед правками.**

---

## TL;DR

Главный init-batch при логине ментора — **не в `PvlPrototypeApp.jsx`**, а внутри `services/pvlPostgrestApi.js loadRuntimeSnapshot()` (вызывается из `pvlMockApi.syncPvlRuntimeFromDb`). Там `Promise.all` по 4 endpoint'ам без `.catch`. Если один из них падает 500 — все 4 ключа теряются → `applyRuntimeSnapshot` получает пустые массивы → УЧИТЕЛЬСКАЯ пуста.

Найдено **4 init-критических сайта** с `Promise.all`. Предлагаю **2-уровневый фикс** (minimal + extended), решение по объёму — за тобой. Smoke через **Chrome DevTools Request blocking** (не трогаем прод).

---

## 1. Recon — все сайты с `Promise.all`-инициализацией

### Главный init-batch (критически важно)

**Сайт A** — `services/pvlPostgrestApi.js:677-685` `loadRuntimeSnapshot()`:

```js
async loadRuntimeSnapshot() {
    const [items, placements, events, faq] = await Promise.all([
        this.listContentItems(),                              // pvl_content_items
        request('pvl_content_placements', { params: ... }),   // pvl_content_placements
        this.listCalendarEvents({}),                          // pvl_calendar_events
        request('pvl_faq_items', { params: ... }),            // pvl_faq_items
    ]);
    return { items: asArray(items), placements: asArray(placements), events: asArray(events), faq: asArray(faq) };
}
```

**Cycle:** `syncPvlRuntimeFromDb()` (pvlMockApi.js:977) → `loadRuntimeSnapshot()` (pvlPostgrestApi.js:677) → `applyRuntimeSnapshot(snapshot)` (заполняет `db.contentItems` / `db.placements` / `db.calendarEvents` / `db.faqItems`).

**Risk:** этот вызов — **первое что делает PvlPrototypeApp при mount'е** (через useEffect в `PvlPrototypeApp.jsx:8071`). Если `pvl_faq_items` отдаст 500 — `Promise.all` reject → snapshot = undefined → applyRuntimeSnapshot падает → весь tracker / контент / события / FAQ пустые. У ментора и у студента — пустой UI.

### Init-batch второго уровня (вызывается в track-and-homework flow)

**Сайт B** — `services/pvlMockApi.js:652-656` `ensureDbTrackerHomeworkStructure()`:

```js
const [weekRows, lessonRows, hwRows] = await Promise.all([
    pvlPostgrestApi.listCourseWeeks(),       // pvl_course_weeks
    pvlPostgrestApi.listCourseLessons(),     // pvl_course_lessons
    pvlPostgrestApi.listHomeworkItems(),     // pvl_homework_items
]);
```

**Cycle:** `syncPvlActorsFromGarden()` (line 1260) → `syncTrackerAndHomeworkFromDb()` (line 751) → `ensureDbTrackerHomeworkStructure()` (line 651).

**Risk:** если хоть один из 3 fail — Promise.all reject → байтсайд `syncTrackerAndHomeworkFromDb` reject → ловится в `syncPvlActorsFromGarden:1259-1281` catch'ем → reportClientError + продолжается. **Но** все per-student submissions/checklist уже не загружены: у студентов нет ДЗ-статусов в UI.

**Сайт C** — `services/pvlMockApi.js:762-772` per-student batch:

```js
await Promise.all(students.map(async (student) => {
    const sqlStudentId = ...;
    const [checklistItems, progressRows, subs, contentProgressRows] = await Promise.all([
        pvlPostgrestApi.listStudentChecklistItems(sqlStudentId).catch(() => []),       // ← guarded
        pvlPostgrestApi.getStudentCourseProgress(sqlStudentId),                          // ← NO guard
        pvlPostgrestApi.listStudentHomeworkSubmissions(sqlStudentId),                    // ← NO guard
        pvlPostgrestApi.listStudentContentProgress(sqlStudentId).catch(() => []),       // ← guarded
    ]);
    // ... обработка чёткisток + submissions + history ...
}));
```

**Risk самый болезненный для UX:** внутри per-student батча у 2 из 4 endpoint'ов **нет** `.catch`. Если `getStudentCourseProgress(student-X)` отдаст 500 (например битый legacy ID студента в `pvl_student_course_progress`) — per-student обработка для X reject → внешний `Promise.all(students.map(...))` тоже reject (нет catch вокруг map) → reportClientError + ВСЕ остальные студенты тоже потеряли submissions/checklist в этой сессии. Один битый студент валит всю учительскую.

### Не критично для init (но упомянут в brief'е)

**Сайт D** — `views/PvlPrototypeApp.jsx:6151, 6160` — bulk admin updates:

```js
await Promise.all(toSave.map((row) => pvlDomainApi.adminApi.updateContentItem(row.id, ...)));
await Promise.all(placementUpdates.map((u) => pvlDomainApi.adminApi.updatePlacement(...)));
```

Это **bulk-WRITE операции admin'а** (порядок drag-and-drop). При ошибке должны зафейлиться — иначе админ получит ложное «всё сохранено» при частичной потере данных. **Не трогать.**

### Уже корректно (для справки)

**Сайт E** — `services/pvlMockApi.js:755-759` ensure pvl_students:

```js
await Promise.all(
    students.filter(shouldEarlyEnsurePvlStudentRow)
        .map((s) => ensurePvlStudentInDb(s.userId).catch(() => {})),
);
```

`.catch(() => {})` per-item — partial tolerance уже встроена. Не трогать.

---

## 2. Шаблон фикса — `loadAndApplyInitialData` в App.jsx:103-142

Структура (из SEC-001 phase 4):

```js
const loadAndApplyInitialData = async () => {
    const results = await Promise.allSettled([
        api.getUsers(),
        api.getKnowledgeBase(),
        api.getLibrarySettings(),
        api.getNews(),
    ]);
    const [usersR, kbR, settingsR, newsR] = results;

    const jwtMisconfig = results.find(r => r.status === 'rejected' && r.reason?.code === 'POSTGREST_JWT_MISCONFIG');
    const has401 = results.some(r => r.status === 'rejected' && r.reason?.status === 401);
    const allFailed = results.every(r => r.status === 'rejected');

    if (usersR.status === 'fulfilled') setUsers(usersR.value || []);
    else console.error('getUsers failed:', usersR.reason);
    // ... per-key handling ...

    return { jwtMisconfig, has401, allFailed };
};
```

**Ключевые принципы оттуда:**
1. `Promise.allSettled` вместо `Promise.all` — не reject'ится никогда.
2. **Per-result handling** — fulfilled пишем, rejected console.error с указанием endpoint'а.
3. **Агрегаты** возвращаем caller'у (`{ jwtMisconfig, has401, allFailed }`) — у caller'а свобода решать что показать в UI (banner / 401-logout / partial).
4. **Не показываем toast/banner внутри** функции — caller решает.

---

## 3. Предлагаемый план правок

### Вариант M (Minimal — рекомендую начать с него)

**Только сайт A** — `loadRuntimeSnapshot` в `pvlPostgrestApi.js`.

```js
async loadRuntimeSnapshot() {
    const labels = ['pvl_content_items', 'pvl_content_placements', 'pvl_calendar_events', 'pvl_faq_items'];
    const results = await Promise.allSettled([
        this.listContentItems(),
        request('pvl_content_placements', { params: { select: '*' } }),
        this.listCalendarEvents({}),
        request('pvl_faq_items', { params: { select: '*' } }),
    ]);
    const failed = [];
    const pick = (r, label) => {
        if (r.status === 'fulfilled') return asArray(r.value);
        failed.push(label);
        // eslint-disable-next-line no-console
        console.error(`[PVL loadRuntimeSnapshot] ${label} failed:`, r.reason);
        return [];
    };
    const snapshot = {
        items: pick(results[0], labels[0]),
        placements: pick(results[1], labels[1]),
        events: pick(results[2], labels[2]),
        faq: pick(results[3], labels[3]),
    };
    if (failed.length > 0) {
        snapshot._partial = { failed };  // caller'у видно partial degradation
    }
    return snapshot;
},
```

В `syncPvlRuntimeFromDb` (pvlMockApi.js:975-982) — добавить логику: если `snapshot._partial` → `reportClientError` (MON-001 алерт в TG).

```js
export async function syncPvlRuntimeFromDb() {
    if (!pvlPostgrestApi.isEnabled()) return { synced: false, reason: 'disabled' };
    const snapshot = await pvlPostgrestApi.loadRuntimeSnapshot();
    applyRuntimeSnapshot(snapshot);
    try { localStorage.setItem(RUNTIME_SWR_KEY, JSON.stringify({ ts: Date.now(), d: snapshot })); } catch { /* ignore quota */ }
    if (snapshot._partial?.failed?.length > 0) {
        try {
            const mod = await import('../utils/clientErrorReporter');
            mod.reportClientError({
                source: 'pvlMockApi.syncPvlRuntimeFromDb',
                message: `loadRuntimeSnapshot partial degradation: ${snapshot._partial.failed.join(', ')}`,
                extra: { failedEndpoints: snapshot._partial.failed, stage: 'loadRuntimeSnapshot' },
            });
        } catch { /* silent */ }
        return { synced: true, partial: true, failed: snapshot._partial.failed };
    }
    return { synced: true };
}
```

**Объём:** 2 файла, ~20 LOC. Решает 80% риска (главный init-fetch).

### Вариант F (Full — если ты хочешь сразу закрыть)

Дополнительно к M:
- **Сайт B** `ensureDbTrackerHomeworkStructure` — `Promise.allSettled` для базового fetch + guard на upsert-блоки (не upsert'им если соответствующая read упала, чтобы не write-spam'ить дубликаты).
- **Сайт C** per-student batch — два уровня:
  - Внешний `Promise.allSettled(students.map(...))` — один битый студент НЕ валит остальных.
  - Внутренний `Promise.allSettled` для 4 endpoint'ов per-student + добавить `.catch(()=>[])` на 2 unguarded endpoint'а (`getStudentCourseProgress`, `listStudentHomeworkSubmissions`) — единичный 500 теряет только данные конкретного студента.

**Объём:** + ~30 LOC, ~3 файла суммарно. Решает 99% риска.

**Моя рекомендация:** **F** (Full) одним коммитом. Каждый из 3 сайтов лечится одним и тем же паттерном (`Promise.allSettled` + per-result handling), splittinng по сайтам в отдельные коммиты — лишний overhead. Тесты после полного фикса легче (один smoke сценарий покрывает всё).

### Решение по UI-toast/баннеру

Стратег: «решение по toast — на твоё product-чутьё».

**Моё предложение: НЕ показывать toast/banner пользователю.**

**Why:**
1. **Toast добавит шум без решения.** Mentor увидит «Часть данных временно недоступна» — она не знает что делать, кроме как перезагрузить. А **с фиксом она хотя бы увидит частичный UI**: 3 из 4 endpoint'ов work → её менти видны, ДЗ видны, FAQ временно пустой. Toast бы только подчёркивал «что-то не так».
2. **MON-001 alert в TG уже достаточно** — Ольга/я узнаём сразу, что какой endpoint падает. Это **operational concern**, не user concern.
3. **Если позже понадобится** — в `syncPvlRuntimeFromDb` уже возвращается `{ synced, partial, failed: [...] }`. Caller (PvlPrototypeApp.jsx useEffect) может в будущем добавить state `pvlPartialDegradation` + UI-баннер. Контракт расширяем.

Если ты считаешь иначе — добавлю toast одной строкой через существующий `showNotification` (но он global app-level, не PVL-specific). Скажи.

---

## 4. Smoke-сценарий

**Выбираю Chrome DevTools — не трогаем прод.**

**Шаги:**
1. Открыть `https://liga.skrebeyko.ru/` в Chrome (Ольгин аккаунт ментора).
2. F12 → Network tab → правая панель Network conditions (или 3 dots → More tools → Network request blocking).
3. Добавить pattern: `**/pvl_faq_items*` → enable blocking.
4. Logout + login (форс-перезагрузка PVL flow).
5. Открыть учительскую (`/pvl`) → проверить:
   - **БЕЗ фикса:** учительская пустая (Promise.all падает на блокированном faq).
   - **С фиксом:** учительская видит студентов / контент / события; FAQ пустой; в console error `[PVL loadRuntimeSnapshot] pvl_faq_items failed: ...`; в TG приходит alert от MON-001.
6. Снять blocking → перезагрузить → всё восстановилось.

**Альтернатива (если block по url-pattern не сработает):** в `chrome://net-export` или DevTools → Sources → Network → throttle конкретный endpoint в `failed`. Но Request blocking — стандарт.

**REVOKE GRANT через psql** — отвергаю как **destructive на проде**. Если что-то пойдёт не так — реальная учительская сломается у Ольги до моего ROLLBACK. Не оправдано когда есть browser-side опция.

---

## 5. Готов писать код

После твоего 🟢 (M или F) — пишу код, прогоняю smoke в Chrome (Request blocking faq), записываю diff в `_session/21_codeexec_bug001_diff.md`, после второго 🟢 — commit + push.

**Файлы которые буду трогать (вариант F):**
- `services/pvlPostgrestApi.js` (loadRuntimeSnapshot)
- `services/pvlMockApi.js` (syncPvlRuntimeFromDb wrapper + ensureDbTrackerHomeworkStructure + syncTrackerAndHomeworkFromDb per-student)

**Не трогаю:**
- `views/PvlPrototypeApp.jsx` — там только bulk-update Promise.all'ы, они должны fault.
- App.jsx — там уже правильный паттерн (шаблон).

Жду 🟢 (M / F / другой scope) + подтверждение про toast (предлагаю НЕТ).
