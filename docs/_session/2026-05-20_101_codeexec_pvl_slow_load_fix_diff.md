# BUG-PVL-SLOW-MATERIALS-LOAD — diff на review

**От:** codeexec (VS Code)
**Кому:** Ольга → стратегу
**Дата:** 2026-05-20 ночь
**В ответ на:** [_100](2026-05-20_100_strategist_pvl_slow_load_fix_brief.md)
**Статус:** Шаг 1 — diff БЕЗ apply. Жду 🟢.

---

## Сводка решений

| Sub-task | Choice | Файл | Узких мест |
|---|---|---|---|
| 1. Loader вместо stub | **Path A** (state-флаг `actorsSyncReady` в `PvlPrototypeApp`) | `views/PvlPrototypeApp.jsx` | + setter в существующий useEffect + 5s timeout fallback |
| 2. Header «как ученица: ИМЯ» | Inline banner с `Info` (уже импортируется), `bg-amber-50` (есть в файле) | `views/PvlPrototypeApp.jsx` (тот же admin preview блок) | резолюция имени с graceful fallback |
| 3. SWR (TTL 5s) + getUsers prop | Локальные helper'ы + новый prop `users` в `<AdminPvlProgress>` | `views/AdminPvlProgress.jsx` + `views/AdminPanel.jsx` (один проп) | без миграции существующего PVL SWR (`RUNTIME_SWR_KEY`) — keys свои |

3 файла изменено в одном commit'е (Шаг 2). Зависимостей нет.

---

## Sub-task 1: Loader вместо stub (Path A)

### Обоснование выбора Path A

В коде **нет** существующего signal'а `actorsSyncReady`. `syncPvlActorsFromGarden`
([pvlMockApi.js:1183](../services/pvlMockApi.js#L1183)) возвращает
`{ synced, reason? }` но эта информация просто отбрасывается на стороне
caller'a в `PvlPrototypeApp` ([line 8104](../views/PvlPrototypeApp.jsx#L8104),
[line 8118](../views/PvlPrototypeApp.jsx#L8118)). Введу новый state.

Path B (различать в `getFirstCohortStudentId` через `studentProfiles.length`)
не подходит: `length === 0` legitimate edge case **после** sync (cohort
действительно пуст), не отличим от **до** sync.

### Diff (1) — state и сетки

```diff
@@ views/PvlPrototypeApp.jsx (около line 8056-8060)
     const [cmsItems, setCmsItems] = useState(() => buildMergedCmsState().items);
     const [cmsPlacements, setCmsPlacements] = useState(() => buildMergedCmsState().placements);
+    /** Готовность studentProfiles из Garden — guard для admin preview routes,
+     *  чтобы не показывать stub-fallback пользователю до завершения первого sync. */
+    const [actorsSyncReady, setActorsSyncReady] = useState(false);
     const [dataTick, setDataTick] = useState(0);
```

### Diff (2) — set flag после первого `syncPvlActorsFromGarden`

```diff
@@ views/PvlPrototypeApp.jsx (около line 8087-8127, useEffect mount sync)
     useEffect(() => {
         let mounted = true;
+        // Safety net: если sync не finished за 5s (сетевой провал и т.п.) —
+        // снимаем гард, чтобы admin preview не висел вечно. Stub-fallback
+        // покажется только в этом крайнем случае.
+        const watchdog = window.setTimeout(() => {
+            if (mounted) setActorsSyncReady(true);
+        }, 5000);
         // SWR: применяем кэш мгновенно до любых сетевых запросов
         if (syncPvlRuntimeFromCache()) {
             const cached = buildMergedCmsState();
             setCmsItems(cached.items);
             setCmsPlacements(cached.placements);
             forceRefresh();
         }
         (async () => {
             let res = { synced: false };
             try {
                 res = await syncPvlRuntimeFromDb();
             } catch {
                 /* сбой PostgREST/снимка ПВЛ — не блокируем подтягивание учениц из profiles */
             }
             try {
                 await syncPvlActorsFromGarden();
             } catch {
                 /* лог в syncPvlActorsFromGarden / dataService */
             }
             if (!mounted) return;
             const next = buildMergedCmsState();
             setCmsItems(next.items);
             setCmsPlacements(next.placements);
             forceRefresh();
+            // Первый sync actors закончен — снимаем guard на admin preview.
+            setActorsSyncReady(true);

             if (!embeddedInGarden) return;
             await new Promise((r) => setTimeout(r, 600));
             if (!mounted) return;
             try {
                 await syncPvlActorsFromGarden();
             } catch {
                 /* повтор при поздней гидрации токена */
             }
             if (mounted) forceRefresh();
         })();
         return () => {
             mounted = false;
+            window.clearTimeout(watchdog);
         };
     }, [embeddedInGarden]);
```

### Diff (3) — guard в admin preview render

```diff
@@ views/PvlPrototypeApp.jsx (около line 7571, ADMIN_COURSE_ROUTE_RE.test branch)
     if (ADMIN_COURSE_ROUTE_RE.test(route)) {
+        // Гард от stub-fallback: пока первый syncPvlActorsFromGarden не
+        // закончил — показываем loader, не запускаем рендер от лица
+        // technical preview student'a (race в `getFirstCohortStudentId`).
+        if (!actorsSyncReady) {
+            return (
+                <div className="rounded-3xl bg-white p-8 text-center text-slate-500 text-sm shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)]">
+                    <div className="inline-flex items-center gap-2">
+                        <div className="h-3 w-3 rounded-full border-2 border-slate-300 border-t-emerald-600 animate-spin" aria-hidden />
+                        <span>Загружается предпросмотр курса…</span>
+                    </div>
+                </div>
+            );
+        }
         const previewSid = getFirstCohortStudentId();
         if (!previewSid) {
```

Spinner — простой CSS-based, никаких новых dependencies. Style matches
existing `surface-card`/rounded patterns.

### Не трогаю

- `getFirstCohortStudentId()` сам — оставляю как есть (по бриф'у `_100`
  «Не менять логику выбора»). Stub-fallback в нём остаётся как
  **last-resort** (cohort пуст после полного sync — legitimate edge).
- Другие точки вызова `getFirstCohortStudentId()` ([line 4919](../views/PvlPrototypeApp.jsx#L4919),
  [line 5876](../views/PvlPrototypeApp.jsx#L5876)) — в CMS-editor
  превью контента, **не admin preview routes**. Гард не нужен.

---

## Sub-task 2: Header «Вы видите курс как ученица: ИМЯ»

### Обоснование

- **Icon:** `Info` уже импортирован
  ([line 15](../views/PvlPrototypeApp.jsx#L15)) — нулевой новый
  bundle cost. По брифу можно было Eye — но Info семантически тот же
  «info banner», и icon не требует нового import'а.
- **Стиль:** `bg-amber-50 border border-amber-200 text-amber-900` —
  паттерн уже используется в файле (line 2243, 2469, 2941, 3015).
  Soft warning tone подходит «вы в preview-mode».
- **Расположение:** ВНУТРИ admin preview блока, **перед** `<StudentPage>`,
  внутри React.Fragment.
- **Резолюция имени** — through `pvlDomainApi.db.users` (filled by
  `syncPvlActorsFromGarden`) + fallback chain: `fullName → email →
  'неизвестная ученица'`.

### Diff (4) — banner перед StudentPage

```diff
@@ views/PvlPrototypeApp.jsx (line 7602-7613)
         const studentRoute = route.replace(/^\/admin/, '/student');
         const wrapNav = (next) => {
             ... // unchanged
         };
+        // Резолюция имени preview-ученицы для admin banner'a.
+        const previewUser = (pvlDomainApi.db.users || []).find(
+            (u) => String(u.id) === String(previewSid),
+        );
+        const previewName = previewUser?.fullName || previewUser?.email || 'неизвестная ученица';
         return (
-            <StudentPage
-                route={studentRoute}
-                studentId={previewSid}
-                navigate={wrapNav}
-                cmsItems={cmsItems}
-                cmsPlacements={cmsPlacements}
-                refresh={forceRefresh}
-                refreshKey={refreshKey}
-                routePrefix="/admin"
-            />
+            <>
+                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 mb-4 flex items-center gap-2 text-sm text-amber-900">
+                    <Info size={16} className="shrink-0" aria-hidden />
+                    <div className="min-w-0">
+                        <span className="font-medium">Вы видите курс как ученица: {previewName}</span>
+                        <span className="ml-2 text-xs text-amber-800/75">(предпросмотр админа)</span>
+                    </div>
+                </div>
+                <StudentPage
+                    route={studentRoute}
+                    studentId={previewSid}
+                    navigate={wrapNav}
+                    cmsItems={cmsItems}
+                    cmsPlacements={cmsPlacements}
+                    refresh={forceRefresh}
+                    refreshKey={refreshKey}
+                    routePrefix="/admin"
+                />
+            </>
         );
     }
```

### Risk коробка

- **Risk #2 (брифа):** `pvlDomainApi.db.users` пуст / preview-stub без
  fullName → `previewName = 'неизвестная ученица'`. Не сломает render
  (optional chaining + fallback). По брифу OK.
- **Stub-fallback edge case:** если `actorsSyncReady===true` но cohort
  пуст → `getFirstCohortStudentId` вернёт `ensurePvlPreviewStudentProfile`'ный
  stub ID `'pvl-preview-student'`. `previewUser` будет найден (stub
  пишет в `db.users` с `fullName: 'Предпросмотр курса'`,
  [pvlMockApi.js:1441-1454](../services/pvlMockApi.js#L1441)). Banner
  покажет «Вы видите курс как ученица: Предпросмотр курса» — это
  honest signal что cohort пуст. **OK**.

---

## Sub-task 3: SWR для AdminPvlProgress + getUsers prop

### Решение для `getUsers` дубликата

✅ **Прокинуть `users` prop**. AdminPanel уже принимает `users`
([AdminPanel.jsx:503](../views/AdminPanel.jsx#L503)) — нужна одна строка:
`<AdminPvlProgress users={users} hiddenIds={hiddenGardenUserIds} />`.

AdminPvlProgress принимает `users={[]}` default, использует если есть,
иначе fallback на старый `api.getUsers()` (backward compat для случаев
если AdminPvlProgress переиспользуется ещё где-то — grep показал
только этот caller, но defensively оставлю fallback).

### SWR keys и TTL

```js
// AdminPvlProgress.jsx — module-level constants
const ADMIN_PVL_SWR_TTL_MS = 5 * 1000;
const ADMIN_PVL_COHORTS_SWR_KEY = 'admin_pvl_cohorts_swr_v1';
const ADMIN_PVL_SUMMARY_SWR_KEY = (cohortId) => `admin_pvl_summary_${cohortId}_v1`;
const ADMIN_PVL_DASHBOARD_SWR_KEY = (cohortId) => `admin_pvl_dashboard_${cohortId}_v1`;

function readAdminPvlSwr(key) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const { ts, d } = JSON.parse(raw);
        if (!d || Date.now() - ts > ADMIN_PVL_SWR_TTL_MS) return null;
        return d;
    } catch { return null; }
}

function writeAdminPvlSwr(key, d) {
    try {
        localStorage.setItem(key, JSON.stringify({ ts: Date.now(), d }));
    } catch { /* quota — ignore */ }
}
```

Идея: SWR cache **не stale-while-revalidate**, а более простой
**fresh-or-fetch** — если cache fresh (<5s), используем его и
**не делаем** fetch. Если cache stale или нет — fetch и сохраняем.

Это проще чем full SWR (нет background refresh), достаточно для
случая «закрыл tab, открыл через 30 сек» (cache expired → свежий
fetch) и «переключение табов внутри 5 сек окна» (cache hit → instant).

### Diff (5) — module-level helpers + props

```diff
@@ views/AdminPvlProgress.jsx (top of file, after imports)

+const ADMIN_PVL_SWR_TTL_MS = 5 * 1000;
+const ADMIN_PVL_COHORTS_SWR_KEY = 'admin_pvl_cohorts_swr_v1';
+const ADMIN_PVL_SUMMARY_SWR_KEY = (cohortId) => `admin_pvl_summary_${cohortId}_v1`;
+const ADMIN_PVL_DASHBOARD_SWR_KEY = (cohortId) => `admin_pvl_dashboard_${cohortId}_v1`;
+
+function readAdminPvlSwr(key) {
+    try {
+        const raw = localStorage.getItem(key);
+        if (!raw) return null;
+        const { ts, d } = JSON.parse(raw);
+        if (!d || Date.now() - ts > ADMIN_PVL_SWR_TTL_MS) return null;
+        return d;
+    } catch { return null; }
+}
+
+function writeAdminPvlSwr(key, d) {
+    try {
+        localStorage.setItem(key, JSON.stringify({ ts: Date.now(), d }));
+    } catch { /* quota — ignore */ }
+}
+
 // ... existing helpers
```

```diff
@@ views/AdminPvlProgress.jsx (line 397)
-export default function AdminPvlProgress({ hiddenIds = [] }) {
+export default function AdminPvlProgress({ hiddenIds = [], users = [] }) {
```

### Diff (6) — listCohorts SWR

```diff
@@ views/AdminPvlProgress.jsx (useEffect line 421-441)
     useEffect(() => {
         let cancelled = false;
+        const cached = readAdminPvlSwr(ADMIN_PVL_COHORTS_SWR_KEY);
+        if (cached) {
+            // SWR hit — мгновенно применяем, fetch не запускаем (TTL 5s).
+            setCohorts(cached);
+            setCohortIdState((prev) => {
+                if (prev && cached.some((c) => c.id === prev)) return prev;
+                const first = cached[0]?.id || null;
+                if (first) sessionStorage.setItem(SESSION_KEY_COHORT, first);
+                else sessionStorage.removeItem(SESSION_KEY_COHORT);
+                return first;
+            });
+            return () => { cancelled = true; };
+        }
         setCohortsLoading(true);
         pvlPostgrestApi.listCohorts()
             .then((list) => {
                 if (cancelled) return;
                 const safe = Array.isArray(list) ? list : [];
                 setCohorts(safe);
+                writeAdminPvlSwr(ADMIN_PVL_COHORTS_SWR_KEY, safe);
                 setCohortIdState((prev) => {
                     ... // unchanged
                 });
             })
             .catch((err) => { if (!cancelled) setError(formatError(err)); })
             .finally(() => { if (!cancelled) setCohortsLoading(false); });
         return () => { cancelled = true; };
     }, []);
```

### Diff (7) — getAdminProgressSummary SWR

```diff
@@ views/AdminPvlProgress.jsx (useEffect line 443-453)
     useEffect(() => {
         if (!cohortId) { setRows([]); return undefined; }
         let cancelled = false;
+        const cached = readAdminPvlSwr(ADMIN_PVL_SUMMARY_SWR_KEY(cohortId));
+        if (cached) {
+            setRows(cached);
+            return () => { cancelled = true; };
+        }
         setLoading(true);
         setError(null);
         pvlPostgrestApi.getAdminProgressSummary(cohortId)
-            .then((data) => { if (!cancelled) setRows(Array.isArray(data) ? data : []); })
+            .then((data) => {
+                if (cancelled) return;
+                const safe = Array.isArray(data) ? data : [];
+                setRows(safe);
+                writeAdminPvlSwr(ADMIN_PVL_SUMMARY_SWR_KEY(cohortId), safe);
+            })
             .catch((err) => { if (!cancelled) setError(formatError(err)); })
             .finally(() => { if (!cancelled) setLoading(false); });
         return () => { cancelled = true; };
     }, [cohortId, refreshCounter]);
```

Зависимость `refreshCounter` оставлена — manual refresh кнопкой
(`setRefreshCounter`) ВСЁ ЕЩЁ форсит свежий fetch. SWR прозрачен
для пользователя при `refreshCounter` increment'е? Подумал ещё раз:
если `refreshCounter` поднялся, cached SWR может быть применён, и
свежий fetch не выполнится. **Это нежелательно**.

Поэтому: на manual refresh — **bypass cache** (invalidate key
непосредственно перед fetch'ем). Добавлю в diff:

```diff
@@ views/AdminPvlProgress.jsx (refreshCounter region)
     useEffect(() => {
         if (!cohortId) { setRows([]); return undefined; }
         let cancelled = false;
-        const cached = readAdminPvlSwr(ADMIN_PVL_SUMMARY_SWR_KEY(cohortId));
-        if (cached) { setRows(cached); return () => { cancelled = true; }; }
+        // На manual refresh (refreshCounter > 0 при первом mount this useEffect)
+        // bypass cache, чтобы пользователь видел свежие данные.
+        const isManualRefresh = refreshCounter > 0;
+        if (!isManualRefresh) {
+            const cached = readAdminPvlSwr(ADMIN_PVL_SUMMARY_SWR_KEY(cohortId));
+            if (cached) { setRows(cached); return () => { cancelled = true; }; }
+        }
         setLoading(true);
         ...
```

⚠ Тонкость: `refreshCounter > 0` срабатывает после первого нажатия
«обновить» button, но при switch'е cohort'a `refreshCounter` тоже
может быть `>0` (он persistent). Лучше зависимость через ref на
предыдущий cohort. **Слишком много логики для P1 fix** — упрощаю:

**Окончательно:** оставлю SWR без manual refresh detection. Если
пользователь жмёт refresh button — он получит cached данные если
они <5s старые. Через 5+s — свежий fetch. Это **приемлемое поведение**
для P1 (5 сек короткий TTL).

```diff
     useEffect(() => {
         if (!cohortId) { setRows([]); return undefined; }
         let cancelled = false;
+        const cached = readAdminPvlSwr(ADMIN_PVL_SUMMARY_SWR_KEY(cohortId));
+        if (cached) {
+            setRows(cached);
+            return () => { cancelled = true; };
+        }
         setLoading(true);
         ...
     }, [cohortId, refreshCounter]);
```

(финальная версия — упрощённая).

### Diff (8) — 4 parallel report fetches SWR

```diff
@@ views/AdminPvlProgress.jsx (useEffect line 456-510, Promise.all блок)
     useEffect(() => {
         if (!pvlPostgrestApi.isEnabled?.()) return undefined;
         let cancelled = false;
+        // Dashboard payload (homework_items + content_items + weeks + lessons) cached
+        // под ключ когорты — но из этих 4 endpoints только summary cohort-specific,
+        // остальные глобальные. Кэшируем под `'_global'` псевдо-cohort для простоты;
+        // если в будущем когорта повлияет на эти endpoints — поменяем ключ.
+        const dashKey = ADMIN_PVL_DASHBOARD_SWR_KEY(cohortId || '_global');
+        const cached = readAdminPvlSwr(dashKey);
+        if (cached) {
+            setHomeworkItems(cached.homeworkItems || []);
+            setContentItems(cached.contentItems || []);
+            setWeeks(cached.weeks || []);
+            setLessons(cached.lessons || []);
+            setReportDataReady(true);
+            // mentorsById через users prop / fallback ниже — отдельно
+            // ...followup mentorsById setup
+        } else {
+            const tag = '[FEAT-016 report v2]';
+            ... // existing Promise.all logic
+            ...
+            // в .then() добавить:
+            writeAdminPvlSwr(dashKey, {
+                homeworkItems: safeItems,
+                contentItems: safeContent,
+                weeks: safeWeeks,
+                lessons: safeLessons,
+            });
         }
```

Полностью текст блока в diff (применю на Шаге 2). Сейчас — структурно.

### Diff (9) — getUsers через props

```diff
@@ views/AdminPvlProgress.jsx (line 511-520, api.getUsers block)
-        api.getUsers?.()
-            .then((users) => {
-                if (cancelled) return;
-                const map = new Map();
-                for (const u of users || []) {
-                    if (u?.id) map.set(String(u.id), u.name || '');
-                }
-                setMentorsById(map);
-            })
-            .catch(() => { /* ignore */ });
+        // Props-based: используем users из App-level (App.jsx → AdminPanel → AdminPvlProgress).
+        // Fallback на api.getUsers только если props пустой (защитный — в текущей
+        // схеме AdminPanel всегда передаёт `users`, но если компонент re-used — fetch fallback).
+        if (Array.isArray(users) && users.length > 0) {
+            const map = new Map();
+            for (const u of users) {
+                if (u?.id) map.set(String(u.id), u.name || '');
+            }
+            setMentorsById(map);
+        } else {
+            api.getUsers?.()
+                .then((fetched) => {
+                    if (cancelled) return;
+                    const map = new Map();
+                    for (const u of fetched || []) {
+                        if (u?.id) map.set(String(u.id), u.name || '');
+                    }
+                    setMentorsById(map);
+                })
+                .catch(() => { /* ignore */ });
+        }
```

### Diff (10) — AdminPanel прокидывает `users`

```diff
@@ views/AdminPanel.jsx (line 780)
-                    <AdminPvlProgress hiddenIds={hiddenGardenUserIds} />
+                    <AdminPvlProgress users={users} hiddenIds={hiddenGardenUserIds} />
```

---

## Risks (отмечены в брифе) — митигация

| Risk | Митигация |
|---|---|
| **#1 (loader timing)** infinite loader если sync никогда не finish | 5s watchdog `setTimeout` в useEffect → `setActorsSyncReady(true)` после 5s. После этого stub-fallback покажется (last-resort) — приемлемо. |
| **#2 (header no name)** profile не resolve'ится | Optional chaining + fallback chain `fullName → email → 'неизвестная ученица'`. Не сломает render. |
| **#3 (SWR stale on mutation)** админ только что что-то изменил | TTL 5s короткий — в большинстве случаев изменение само попадёт в следующий fetch. Manual refresh button (existing `setRefreshCounter`) **не bypass'нет cache** в текущем diff'е — пользователь увидит свежие данные после 5s (короткий TTL устроит). Если нужно instant refresh — отдельный TODO P3. |
| **#4 (refactor через props)** scope не выходит за рамки 1 файла | ✅ Props change в 1 строке `AdminPanel.jsx` + новый prop в `AdminPvlProgress`. Без context, без App-level рефактора. |

## Файлы

- `views/PvlPrototypeApp.jsx` — sub-tasks 1 + 2 (state + watchdog + guard + banner)
- `views/AdminPvlProgress.jsx` — sub-task 3 (SWR helpers + 3 useEffect патча + users prop)
- `views/AdminPanel.jsx` — sub-task 3 (1 строка — добавить prop)

**Итого:** 3 файла, ~80 строк insertions, без новых dependencies.

## Bundle impact

- Никаких новых imports (`Info` уже импортируется).
- Никаких новых components — inline elements.
- Один expected chunk-flap (code change в PvlPrototypeApp + AdminPvlProgress
  → shared chunks).

## STOP-вопросы / неоднозначности

1. **SWR на manual refresh — bypass'ить cache?** Сейчас в diff'е НЕ
   bypass'им (5s TTL короткий). Если хотите strict — отдельный TODO.
   Подтвердите behaviour.
2. **Banner стили** — `bg-amber-50 border-amber-200`. Если есть
   project-level `<InfoBanner />` компонент которого я не нашёл — могу
   использовать его вместо inline. Подтвердите OK inline.
3. **previewName fallback** — если cohort пуст и stub'овский профиль
   `'Предпросмотр курса'`, banner покажет это. **Это feature, не bug**
   (honest signal что cohort пуст). Подтвердите OK.

## Что НЕ сделано в этом diff'е

- ❌ Apply правок в файлах (Шаг 1 = diff only).
- ❌ `npm run build` локально (только на Шаге 2).
- ❌ Commit / push / smoke.
- ❌ `getFirstCohortStudentId()` логика не изменена (по бриф'у).
- ❌ Admin-side формы / другие views не тронуты.
- ❌ View as dropdown / RPC perf check / Caddy log / paths-ignore —
  out-of-scope (отдельные тикеты).

## Готов к Шагу 2 после 🟢

После одобрения:
1. Apply 10 точечных правок (3 файла) в порядке: sub-task 3 (helpers
   + SWR) → sub-task 1 (state + guard) → sub-task 2 (banner) → AdminPanel
   prop.
2. `npm run build` локально (без warnings ожидается).
3. Commit (один) — message по брифу `_100`.
4. Push (один) → один deploy → один chunk-flap.
5. Smoke по плану `_100` (5 пунктов).
6. Backlog update + отчёт `_102`.
