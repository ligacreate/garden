# Урок: `Promise.all` в init-batch'ах фрагилен — один битый endpoint валит всё. `Promise.allSettled` с per-result handling — правильный паттерн.

**Дата:** 2026-05-16
**Контекст:** BUG-001 PvlPrototypeApp фрагильный batch-init (BACKLOG.md:700). Закрыт коммитами `92cb502` (base fix) + `0f8158b` (defense-in-depth safety-catch + temp instrumentation) + чистка после reproduce.

## Симптом

После открытия PostgREST наружу 2026-05-03 при логине ментора учительская ПВЛ показывала пустой UI — «Список менти пуст», хотя в БД у ментора были назначенные ученицы. Симптом плавал: иногда вылезал на специфических пользователях (с битым legacy TEXT-id в `pvl_student_questions`), иногда вообще не воспроизводился.

## Корневая причина

В трёх местах PVL-кода `Promise.all` параллельно дёргал N endpoint'ов одного init-батча. Если хоть один endpoint возвращал 500/network error — `Promise.all` reject'ил **всю цепочку**, downstream-код получал пустые массивы или throw, и UI оказывался пуст.

Три критических сайта:

| Файл | Что делал | Что валило |
|---|---|---|
| `services/pvlPostgrestApi.js:677` `loadRuntimeSnapshot` | 4 endpoint'а (items/placements/events/faq) | Один битый endpoint → все 4 потеряны → tracker/контент/FAQ пустые. |
| `services/pvlMockApi.js:652` `ensureDbTrackerHomeworkStructure` | 3 endpoint'а (weeks/lessons/homework) | Один битый → upsert'ы недель/уроков работали с пустыми map'ами → write-spam дубликатов в БД. |
| `services/pvlMockApi.js:762-772` per-student batch | 4 endpoint'а × N студентов | Один битый студент (например getStudentCourseProgress 500) → ВСЯ обработка остальных студентов отваливалась. Самый болезненный для UX. |

В двух подсайтах из 4 endpoint'ов per-student уже было `.catch(() => [])` (`listStudentChecklistItems`, `listStudentContentProgress`), но в `getStudentCourseProgress` и `listStudentHomeworkSubmissions` — не было. Один битый раз — учительская пуста у ментора.

## Почему так получилось

- **`Promise.all` — дефолтный idiom**, многие пишут его автоматически когда нужно «дёрнуть N запросов параллельно». Семантика «либо все, либо никто» — естественна для бизнес-write'ов (атомарность важна), но **противоестественна для init-read'ов**, где partial data лучше чем no data.
- **Гетерогенный набор endpoint'ов в одном batch'е.** Например `loadRuntimeSnapshot` тащил Content (важно для tracker) + FAQ (некритично, ладно если пусто). Один битый FAQ валил критичный Content. Это аргумент за per-endpoint resilience.
- **Не было системы алёртов на silent fail PVL-fetch'ей.** MON-001 ловит `window.onerror`, но скрытые reject'ы внутри `await Promise.all` — `unhandledrejection`, который реактивная цепочка ловит на верху и логирует только в console. Stratreg видел проблему **только после жалобы Ольги на пустую учительскую**.
- **Один работающий шаблон уже был в коде** — `loadAndApplyInitialData` в `App.jsx:103` (фаза 4 SEC-001 закрытия) использовал `Promise.allSettled` с per-result handling. Но PVL-слой не подхватил этот паттерн и продолжал жить на `Promise.all`.

## Как починили

### Шаг 1 — `Promise.allSettled` + per-result handling (commit `92cb502`)

Заменил `Promise.all` на `Promise.allSettled` во всех трёх сайтах + `.catch(() => [])` на отсутствующих guard'ах + per-student outer try/catch:

**Контракт `_partial.failed: string[]`** между API-слоем и app-слоем — caller видит partial degradation и шлёт alert в MON-001 (TG-канал @garden_grants_monitor_bot):

```js
// services/pvlPostgrestApi.js loadRuntimeSnapshot
const results = await Promise.allSettled([...4 endpoint'а]);
const failed = [];
const pick = (r, i) => {
    if (r.status === 'fulfilled') return asArray(r.value);
    failed.push(labels[i]);
    console.error(`[PVL loadRuntimeSnapshot] ${labels[i]} failed:`, r.reason);
    return [];
};
const snapshot = { items: pick(results[0], 0), ..., faq: pick(results[3], 3) };
if (failed.length > 0) snapshot._partial = { failed };
return snapshot;
```

```js
// services/pvlMockApi.js syncPvlRuntimeFromDb
if (snapshot._partial?.failed?.length > 0) {
    const mod = await import('../utils/clientErrorReporter');
    mod.reportClientError({
        source: 'pvlMockApi.syncPvlRuntimeFromDb',
        message: `loadRuntimeSnapshot partial degradation: ${snapshot._partial.failed.join(', ')}`,
        extra: { failedEndpoints: snapshot._partial.failed, stage: 'loadRuntimeSnapshot' },
    });
    return { synced: true, partial: true, failed: snapshot._partial.failed };
}
```

**Per-student loop** теперь вынесен в `processStudentTrackerAndHomework(student)` + outer try/catch:

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
    // MON-001 alert: per-student partial degradation
}
```

UI пользователя не меняется — partial degradation идёт в `console.error` + MON-001 alert (TG). Контракт `{ partial, failed }` остался расширяемым для будущего UI-баннера (toast=НЕТ согласовано — добавил бы шум без решения).

### Шаг 2 — `try/finally` без `catch` в React useEffect (commit `0f8158b`)

Smoke от Claude in Chrome выявил edge case: при Promise.reject override на pvl_faq_items учительская зависала на «Загрузка учениц…» 15+ сек. Прямая причина:

```jsx
// views/PvlPrototypeApp.jsx:6942 AdminStudents useEffect (ДО фикса)
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
```

**Если `syncPvlActorsFromGarden` throw — `setSyncResult` НЕ вызывается, `syncResult` остаётся `null`** → emptyMsg = «Загрузка учениц…» висит вечно. `finally` не помогает (он инкрементит listTick, но не управляет loading state).

Defense-in-depth fix — explicit `catch` ветка:
```jsx
try {
    const result = await syncPvlActorsFromGarden();
    if (!cancelled) setSyncResult(result);
} catch (e) {
    console.error('[AdminStudents] syncPvlActorsFromGarden threw:', e);
    if (!cancelled) setSyncResult({ synced: false, reason: 'error', error: String(e?.message || e) });
} finally {
    if (!cancelled) setListTick((t) => t + 1);
}
```

`syncPvlActorsFromGarden` имеет собственный top-level try/catch и **не должна throw'ить наверх по контракту**. Но React useEffect получает promise через async-IIFE — никакой защиты Error Boundary, никакого Suspense. Если контракт когда-нибудь нарушится — UI зависнет навсегда.

### Шаг 3 — root cause edge case оказался false alarm (reproduce-data)

После deploy базового фикса + safety-catch + temp instrumentation Ольга reproduce'ила Promise.reject override и скопировала `[BUG-001-edge]` console-output. Результат:
```
phase:start cachedUsers=null
phase:after-getUsers users=N
phase:after-actors-iter mentors=M trackMembers=K
phase:after-ensurePvlStudentInDb
phase:after-hydrate OK
phase:before-return synced=true
syncResult: {synced: true, ...}
```

**Все 5 фаз прошли успешно, TOP-LEVEL-CATCH не сработал, UI не завис.** Базовый фикс (`Promise.allSettled`) **уже работал правильно** с Promise.reject. Предыдущий smoke от Claude in Chrome, который показал 15-секундное зависание, был замутнён `logout+login` циклом во время fetch-override — затоптал JWT-состояние, не реальное зависание partial degradation.

**Урок про smoke-методику:** при отладке partial degradation **не делай logout+login во время активного fetch override** — auth-state мутится, артефакты не воспроизводимы. Лучше блокировать через DevTools Network UI без рестарта сессии.

## Что проверить в будущем

- **Любой `Promise.all([...])` в init-cycle** — кандидат на `Promise.allSettled`. Особенно если endpoint'ы независимы (например loadRuntimeSnapshot: items/placements/events/faq — каждый сам по себе ценен).
- **Любой per-collection map() с inner Promise.all** — два уровня риска: внешний (один битый item валит весь loop) и внутренний (один битый endpoint валит обработку item'а). Лечится двумя слоями `allSettled` или outer try/catch + inner `allSettled`.
- **Любой `try {} finally {}` без `catch` в React useEffect** — ловушка для loading state. Если внутри throw происходит, `setLoading(false)` в `finally` сработает, но **специфичный success-state не установится** (если он в `try` после await). Always explicit catch + setError({...}) для UI.
- **Если в коде уже есть успешный шаблон** (как `loadAndApplyInitialData` в App.jsx) — **скопируй его 1:1** в новые места, не изобретай заново. Параллельные init-batch'ы — повторяющаяся проблема.
- **Каждый новый batch-fetch с `Promise.allSettled`** должен либо: (а) возвращать `_partial.failed` метку caller'у, либо (б) сам отправлять alert в MON-001. Silent fail партиал-дегредации = visible пустой UI без диагностики.
- **При write-цикле с partial-tolerant read** (как `ensureDbTrackerHomeworkStructure`) — добавь guard'ы: если базовый read упал, **не пиши upsert'ы** (риск write-spam дубликатов когда мы не знаем что в БД). Сохрани последний валидный sqlMap state (не перезаписывай пустой Map'ой при rejected re-read).

## Smoke-методика (для будущих partial-degradation тестов)

**Используй Chrome DevTools Network Request blocking UI**, не fetch override через console:
1. F12 → Network → 3-dots menu → More tools → Network request blocking.
2. Добавь pattern (например `**/pvl_faq_items*`) → Enable blocking.
3. **Не делай logout/login во время активного blocking** — auth-state мутится.
4. Reload страницы (Ctrl+R), без logout.
5. Снять blocking → Reload → проверить recovery.

Если нужно специфически вызвать reject (а не browser ERR_BLOCKED): override через console — но **сразу после** override делай только reload, не logout. Иначе любая diagnostic нарисует фантомы.

## Связанные уроки

- (нет прямых, но `Promise.all → allSettled` паттерн ранее применялся в фазе 4 SEC-001 — см. `App.jsx:103` `loadAndApplyInitialData`).

## Связанные коммиты

- `92cb502` (base fix — Promise.allSettled во всех 3 сайтах).
- `0f8158b` (defense-in-depth safety-catch в AdminStudents + temp instrumentation для root-cause).
- (этот коммит) — чистка инструментации + закрытие BUG-001.
