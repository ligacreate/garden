# BUG-001 edge — safety-catch + instrumentation (diff на ревью)

**От:** VS Code Claude Code
**Кому:** стратег (claude.ai)
**Ответ на:** 🟢 V1 в этом чате
**Дата:** 2026-05-16
**Статус:** код написан локально, esbuild чисто. **НЕ закоммичено** — ждёт 🟢.

---

## TL;DR

- **AdminStudents safety-catch:** добавлен `catch` ветвью в useEffect — если `syncPvlActorsFromGarden` throw, UI получит «Ошибка синхронизации с Садом.» вместо вечного «Загрузка учениц…».
- **Instrumentation (TEMP):** `console.time`/`console.timeLog` маркеры в обоих файлах, помечены тегом `[BUG-001-edge]`. После Ольгиного reproduce с Promise.reject override — точно поймём где throw/зависание.
- **Маркер `[BUG-001-edge]`** делает легко найти все temp-строки потом и удалить одним grep'ом.

| Файл | LOC | Что |
|---|---|---|
| `views/PvlPrototypeApp.jsx` | +14 / −0 | AdminStudents useEffect: `console.time`/`timeEnd` + safety `catch` с `setSyncResult({synced:false, reason:'error', error})`. |
| `services/pvlMockApi.js` | +18 / −1 | `syncPvlActorsFromGarden`: `console.time(PHASE_TAG)` + helper `phase(name)` → `console.timeLog(PHASE_TAG, name)` в 6 ключевых точках. `console.timeEnd` перед каждым `return` (включая early-return при `no_users` и top-level catch). |

esbuild чистый, Vite build не запускал (только синтаксис) — instrumentation не меняет bundle структуру.

---

## Что Ольга увидит в консоли после deploy

При reproduce'е override → Promise.reject на pvl_faq_items (или другом endpoint'е), консоль покажет последовательность вроде:

```
[BUG-001-edge] syncPvlActorsFromGarden: 0.5ms phase:start cachedUsers=null
[BUG-001-edge] syncPvlActorsFromGarden: 152.3ms phase:after-getUsers users=125
[BUG-001-edge] syncPvlActorsFromGarden: 215.7ms phase:after-actors-iter mentors=3 trackMembers=42
[BUG-001-edge] syncPvlActorsFromGarden: 312.4ms phase:after-ensurePvlStudentInDb
[BUG-001-edge] syncPvlActorsFromGarden: 410.0ms phase:after-hydrate OK
[BUG-001-edge] syncPvlActorsFromGarden: 15234.8ms phase:after-syncTracker OK
[BUG-001-edge] syncPvlActorsFromGarden: 15235.2ms phase:before-return synced=true
[BUG-001-edge] syncPvlActorsFromGarden: 15236.0ms
[BUG-001-edge] AdminStudents.syncPvlActorsFromGarden: 15240ms
[BUG-001-edge] syncResult: {synced: true, ...}
```

**Что читаем:**
- Большой gap (X ms → 15234 ms) между двумя phase'ами → нашли зависающий блок.
- Если последняя phase = `phase:after-hydrate OK` и timeEnd показывает 15s — зависание в `syncTrackerAndHomeworkFromDb`.
- Если последняя phase = `phase:TOP-LEVEL-CATCH ...` — throw наверх в одном из awaits.
- Если `AdminStudents.syncPvlActorsFromGarden: 15240ms` есть, но НЕТ "syncResult:" — throw из syncPvlActorsFromGarden наверх (попадает в новый catch, UI покажет error).
- Если есть `[BUG-001-edge] THREW:` — нашли throw.

После reproduce → root-cause fix → отдельный коммит с удалением всей `[BUG-001-edge]` инструментации.

---

## Diff

### `views/PvlPrototypeApp.jsx` (+14 / −0) — AdminStudents useEffect

```diff
     useEffect(() => {
         let cancelled = false;
         (async () => {
+            // BUG-001-edge instrumentation (TEMP — удалить после root-cause fix).
+            // eslint-disable-next-line no-console
+            console.time('[BUG-001-edge] AdminStudents.syncPvlActorsFromGarden');
             try {
                 const result = await syncPvlActorsFromGarden();
+                // eslint-disable-next-line no-console
+                console.timeEnd('[BUG-001-edge] AdminStudents.syncPvlActorsFromGarden');
+                // eslint-disable-next-line no-console
+                console.log('[BUG-001-edge] syncResult:', result);
                 if (!cancelled) setSyncResult(result);
+            } catch (e) {
+                // BUG-001-edge safety-fix: даже если syncPvlActorsFromGarden throw'ит
+                // наверх (не должен по контракту, но edge case был замечен на проде) —
+                // UI не должен висеть на «Загрузка учениц…». Показываем error message.
+                // eslint-disable-next-line no-console
+                console.timeEnd('[BUG-001-edge] AdminStudents.syncPvlActorsFromGarden');
+                // eslint-disable-next-line no-console
+                console.error('[BUG-001-edge] THREW:', e);
+                if (!cancelled) setSyncResult({ synced: false, reason: 'error', error: String(e?.message || e) });
             } finally {
                 if (!cancelled) setListTick((t) => t + 1);
             }
         })();
         return () => { cancelled = true; };
     }, []);
```

### `services/pvlMockApi.js` (+18 / −1) — syncPvlActorsFromGarden instrumentation

```diff
 export async function syncPvlActorsFromGarden() {
+    // BUG-001-edge instrumentation (TEMP). Маркеры с тегом [BUG-001-edge]
+    // помогают локализовать зависание из smoke (Promise.reject override).
+    const PHASE_TAG = '[BUG-001-edge] syncPvlActorsFromGarden';
+    // eslint-disable-next-line no-console
+    console.time(PHASE_TAG);
+    // eslint-disable-next-line no-console
+    const phase = (name) => { try { console.timeLog(PHASE_TAG, name); } catch { /* ignore */ } };
     try {
         // SWR: берём кэш пользователей из localStorage (актуален 1 час)
         let cachedUsers = null;
         try { /* ... читаем SWR из localStorage ... */ } catch { /* ignore */ }

+        phase('phase:start cachedUsers=' + (cachedUsers ? cachedUsers.length : 'null'));
         let users = [];
         if (cachedUsers) { /* SWR-path */ } else { /* retry loop */ }
-        if (!Array.isArray(users) || users.length === 0) return { synced: false, reason: 'no_users' };
+        phase('phase:after-getUsers users=' + (Array.isArray(users) ? users.length : 'invalid'));
+        if (!Array.isArray(users) || users.length === 0) {
+            // eslint-disable-next-line no-console
+            console.timeEnd(PHASE_TAG);
+            return { synced: false, reason: 'no_users' };
+        }

         /* ... mentors/trackMembers iteration ... */

+        phase('phase:after-actors-iter mentors=' + mentors.length + ' trackMembers=' + pvlTrackMembers.length);

         for (const { profile: u, admission } of pvlTrackMembers) {
             if (!u?.id || admission?.gardenRole !== 'applicant') continue;
             await ensurePvlStudentInDb(String(u.id));
         }
+        phase('phase:after-ensurePvlStudentInDb');

         /* ... pruneSeedPvlDemoStudentRows ... */

         try {
             await hydrateGardenMentorAssignmentsFromDb();
+            phase('phase:after-hydrate OK');
         } catch (e) {
+            phase('phase:after-hydrate THREW');
             /* ... logDbFallback + reportClientError ... */
         }

         if (pvlPostgrestApi.isEnabled() && pvlTrackMembers.length > 0) {
             try {
                 await syncTrackerAndHomeworkFromDb();
+                phase('phase:after-syncTracker OK');
             } catch (e) {
+                phase('phase:after-syncTracker THREW');
                 /* ... logDbFallback + reportClientError ... */
             }
         }

+        phase('phase:before-return synced=true');
+        // eslint-disable-next-line no-console
+        console.timeEnd(PHASE_TAG);
         return { synced: true, ... };
     } catch (error) {
+        phase('phase:TOP-LEVEL-CATCH ' + String(error?.message || error));
+        // eslint-disable-next-line no-console
+        console.timeEnd(PHASE_TAG);
         /* ... existing logDbFallback + reportClientError ... */
         return { synced: false, reason: 'error' };
     }
 }
```

---

## Edge-case-ы / решения дизайна

### 1. `console.timeLog` vs `console.log` с ручным `Date.now()`

Выбрал `console.timeLog` потому что:
- Стандарт DevTools — отображает delta от `console.time(label)` автоматически в ms.
- Один lookup `[BUG-001-edge]` в фильтре консоли показывает всю историю запуска.
- Не накапливает state в коде (не нужно `const t0 = Date.now()`).

### 2. `phase()` helper

`console.timeLog` throw'ит если соответствующий `console.time` ещё не был вызван (rare). Обернул в try/catch чтобы инструментация **не могла сломать функцию** даже если console API ведёт себя странно (web extensions, headless и т.п.).

### 3. `console.timeEnd` в early-return ветке (`no_users`)

Изначально early-return на `no_users` без timeEnd оставил бы открытый таймер, и следующий `console.time(PHASE_TAG)` в следующем вызове функции выдал бы warning `Timer 'X' already exists`. Не критично, но шумно. Добавил `timeEnd` перед каждым `return`.

### 4. Safety-catch возвращает `{synced: false, reason: 'error', error: String(...)}`

Это соответствует тому что emptyMsg ожидает для error-ветки: `syncResult?.synced === false && syncResult?.reason === 'error' ? 'Ошибка синхронизации с Садом.'`. Поле `error` — дополнительно, в emptyMsg не используется, но может быть полезно для будущей UX (показать e.message в кнопке retry).

### 5. Не трогал основной useEffect в PvlPrototypeApp (line 8068)

Там `await syncPvlActorsFromGarden()` уже обёрнут в try/catch (line 8076-8079). Не дублирую — если зависание в основном useEffect, инструментация в `syncPvlActorsFromGarden` сама покажет. Можно добавить `console.time` и туда, но это пока избыточно — стратегу важнее сначала понять что происходит в `AdminStudents` (где симптом проявился).

---

## Apply-порядок

После 🟢:
1. `git add views/PvlPrototypeApp.jsx services/pvlMockApi.js docs/_session/2026-05-16_22*.md docs/_session/2026-05-16_23*.md docs/_session/2026-05-16_24*.md`
2. Commit (предложение ниже).
3. `git push origin main` → GH Actions FTP deploy (1-2 мин).
4. Ольга reproduce'ит:
   - F12 → Network → request blocking.
   - Override на pvl_faq_items с `Promise.reject(new Error('blocked'))`.
   - Logout + login.
   - Фильтр Console на `[BUG-001-edge]` → копирует весь output в чат.
5. Я разбираю output → root-cause fix → отдельный коммит с **удалением** всех `[BUG-001-edge]` строк.

---

## Предлагаемый commit message

```
fix(pvl): BUG-001 edge — AdminStudents safety-catch + temp instrumentation

Smoke базового BUG-001 фикса (commit 92cb502) выявил edge case:
при Promise.reject override на pvl_faq_items учительская зависает
на «Загрузка учениц…» 15+ сек (тогда как при 200 [] override —
работает). Console/TG alert одинаковые в обоих случаях — значит
проблема downstream после syncPvlRuntimeFromDb.

Прямая причина «Загрузка учениц…» вечно: AdminStudents useEffect
(views/PvlPrototypeApp.jsx:6942) использует try{}finally{} без
catch. Если syncPvlActorsFromGarden throw — setSyncResult не
вызывается, syncResult остаётся null, emptyMsg = 'Загрузка учениц…'.

Корневая причина (почему throw именно при Promise.reject, но не
при 200 []) — не нашёл по статическому анализу. Все 6 awaits в
syncPvlActorsFromGarden либо имеют локальный try/catch, либо
обёрнуты top-level catch'ем — не должны throw'ить наверх.

Минимальный safety-fix (этот коммит):
- AdminStudents useEffect: catch ветка с setSyncResult({synced:false,
  reason:'error', error}) — UI получает «Ошибка синхронизации с
  Садом.» вместо вечного «Загрузка учениц…».

Temporary instrumentation (этот коммит, удалю отдельным после
root-cause):
- AdminStudents useEffect: console.time/timeEnd + console.log
  syncResult — видим duration и факт что throw произошёл.
- syncPvlActorsFromGarden: console.time(PHASE_TAG) + helper
  phase(name) → console.timeLog 6 маркеров (start, after-getUsers,
  after-actors-iter, after-ensurePvlStudentInDb, after-hydrate,
  after-syncTracker, before-return, TOP-LEVEL-CATCH).
- timeEnd перед каждым return (включая early no_users + top-level catch).

Все строки помечены тегом [BUG-001-edge] для grep'а при cleanup.

После reproduce от Ольги (Chrome DevTools fetch override →
Promise.reject(new Error('blocked')) → Console filter [BUG-001-edge])
видим какая phase зависает или где throw. Root-cause fix —
отдельный коммит с удалением инструментации.

BUG-001 НЕ закрываем — root cause не найден.

Recon: docs/_session/2026-05-16_23_codeexec_bug001_edge_recon.md
Diff: docs/_session/2026-05-16_24_codeexec_bug001_safety_diff.md
```

Жду 🟢.
