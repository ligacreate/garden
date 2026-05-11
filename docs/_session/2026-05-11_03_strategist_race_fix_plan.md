---
от: стратег (claude.ai)
кому: VS Code Claude Code (executor)
дата: 2026-05-11
тема: Fix race condition admin/mentor learning, lesson, backlog updates
ответ на: docs/_session/2026-05-11_02_codeexec_bug_admin_mentor_recon.md
---

# Fix race condition — Variant C + B + lesson + backlog

Ирина написала в 11:20: список менти появился **сам** через
~2 часа, без её действий. Это **подтверждает H 1.7a из твоего
отчёта** — race condition между async sync и React render.
Background trigger (вероятно Supabase Realtime в
`services/realtimeMessages.js` → re-render → useMemo пересчёт)
работает как «случайный спасатель».

---

## 1. Критическая связка с CLEAN-015

Если выпилим Supabase Realtime (CLEAN-015) без фикса race
condition — баг начнёт ловиться **устойчиво** у admin'ов
(нет background re-render → useMemo не пересчитывается →
список не появляется сам по себе).

**Race fix должен идти ДО CLEAN-015.** Это сегодня. Этим
заходом.

В backlog (раздел 3.3 ниже) добавь блокер на CLEAN-015.

---

## 2. Fix Variant C — useMemo deps в MentorPage

### 2.1 Что трогаем

В `views/PvlPrototypeApp.jsx`:
- `MentorPage` (около line 8176) — корневой компонент учительской.
- `MentorMenteesPanel` (line 3934) — содержит `useMemo` который
  вычисляет `menteeRows`.
- `MentorDashboard` (line 3953) — то же.

### 2.2 Что добавить в deps

Сейчас `useMemo` зависит от `mentorId` (+ возможно `refreshKey`).
Этого недостаточно — когда sync завершается и `db.mentorProfiles`
заполняется, deps не меняются → пересчёта нет.

Добавить в deps:
- `db._pvlGardenApplicantsSynced` (булев флаг, поднимается в
  конце `syncPvlActorsFromGarden`).
- `db.mentorProfiles.length` (страховка на случай если
  `_pvlGardenApplicantsSynced` не вызвался корректно).
- `db.studentProfiles.length` (страховка по второй стороне).

Если `db` доступен через `pvlDomainApi.db`, используй его. Если
через React Context / hook — адаптируй под текущий паттерн в
файле.

⚠ **Не используй сам объект `db` в deps** — это reference,
React shallow compare скажет «не менялся» когда меняется
внутреннее содержимое. Используй именно `.length` / специфичные
флаги.

### 2.3 Возможно нужно изменить hook-структуру

Если `useMemo` написан так что `db` snapshot'ится один раз при
монтировании и `mentorId/refreshKey` его не обновляют — нужно
обернуть в `useState` + `useEffect` который слушает sync events,
или вынести через `useSyncExternalStore` если такой паттерн уже
есть в проекте.

**Recon правильного паттерна** — поищи в коде, как
`forceRefresh` / `dataTick` пересчитывается в других местах
(student-side учительской, AdminPvlProgress). Используй
консистентный подход, не выдумывай новый.

Если рабочий паттерн уже есть в проекте и просто не применили в
MentorPage — копируй его.

### 2.4 Smoke в локальном preview

```bash
npm run preview
```

Открой `http://localhost:4173/` → залогинься как admin
(твой test-аккаунт executor'a, или передай Ольге через Claude
in Chrome для smoke).

**Сценарий теста на race:**
1. Очисти localStorage (`Application → Storage → Clear`).
2. Залогинься.
3. Сразу открой «Мои менти».
4. **Должны** показаться менти сразу, не пусто-сначала-потом.

Если не воспроизводится локально (sync быстрый, не успевает
race) — попробуй throttling в DevTools Network на «Slow 3G» и
повтори. Race должна стать заметной.

---

## 3. Fix Variant B (бонус) — reportClientError в catch hydrate

### 3.1 Где

`services/pvlMockApi.js` line ~1230 (try/catch вокруг
`hydrateGardenMentorAssignmentsFromDb`):

```js
try {
    await hydrateGardenMentorAssignmentsFromDb();
} catch (e) {
    logDbFallback({ stage: 'hydrate_mentor_links', error: e });
}
```

### 3.2 Что добавить

```js
} catch (e) {
    logDbFallback({ stage: 'hydrate_mentor_links', error: e });
    // Tag для MON-001 — это caught error, который раньше прятался
    try {
        const { reportClientError } = await import('../utils/clientErrorReporter');
        reportClientError({
            message: 'hydrate_mentor_links failed (caught)',
            stack: e?.stack || String(e),
            source: 'pvlMockApi.hydrate',
            extra: { stage: 'hydrate_mentor_links' },
        });
    } catch (_reporterErr) { /* silent */ }
}
```

Dynamic import — чтобы не создавать static dependency между
`pvlMockApi` и MON-001 (legacy file, не хочется рефакторить
imports).

Аналогично — найди ещё одно-два **критичных catch'а** в
`pvlMockApi.js` (особенно вокруг `syncPvlActorsFromGarden`) и
добавь те же reports. **Не во все catches подряд** — только в
те, где silent fail = пропавший UI у пользователя.

### 3.3 Smoke

Симулируй ошибку: в DevTools Console во время загрузки страницы
**прервать `listGardenMentorLinksByStudentIds`** через
`window.fetch` mock, или просто временно сделать `throw` в
`pvlPostgrestApi` локально. Должна прилететь TG-алерт
`hydrate_mentor_links failed (caught)` с stack'ом.

После теста — **верни код обратно**, ничего guard'ом не
оставляй.

---

## 4. Lesson `docs/lessons/2026-05-11-pvl-admin-mentor-race-condition.md`

Структура:

```markdown
# Race condition: async sync + React useMemo без deps на state-флаг

## Симптом
Admin Ирина не видит свой список менти в учительской ПВЛ.
Никаких ошибок в Console и TG (MON-001 не алертит). Через
~2 часа без её действий список появляется сам.

## Root cause
В `MentorPage` / `MentorMenteesPanel` useMemo для `menteeRows`
зависел от `mentorId` + `refreshKey`. Когда `syncPvlActorsFromGarden`
заполнял `db.mentorProfiles` асинхронно (после первого render'а),
deps не менялись → useMemo не пересчитывался → менти оставались
пустыми. Background re-render от Supabase Realtime websocket
(в Сообщениях) случайно триггерил пересчёт.

## Категория
Тихие state issues. **Невидимы для MON-001** — нет throw, нет
unhandled rejection. UI gracefully показывает «Список пуст» по
дизайну.

## Что мониторинг ловит, что нет
| Класс | MON-001 | Заметим? |
|---|---|---|
| Uncaught JS exception | ✅ | Сразу |
| Unhandled promise rejection | ✅ | Сразу |
| Caught error (`.catch()` → swallow) | ❌ | Только если жалоба от пользователя |
| Gracefully empty UI без exception | ❌ | Только если жалоба |
| Race condition stale state | ❌ | Только если жалоба |

## Mitigation
1. `useMemo` зависимости должны включать **state-флаги
   завершённости async sync** (`db._pvlGardenApplicantsSynced`,
   `db.mentorProfiles.length`).
2. В критичных catch'ах — добавить `reportClientError` (MON-001),
   чтобы caught errors уходили в TG как `hydrate_mentor_links
   failed (caught)`.

## Связано с CLEAN-015
Реалтайм в `realtimeMessages.js` (Supabase) случайно
триггерит re-render и тем самым **прячет race condition**.
После CLEAN-015 (выпиливания Realtime → polling) race будет
заметнее. **Поэтому race fix должен идти ДО CLEAN-015** —
иначе CLEAN-015 косвенно ломает учительскую для всех admin'ов.
```

---

## 5. Backlog updates

### 5.1 Заведи `BUG-PVL-ADMIN-AS-MENTOR-EMPTY`

В `plans/BACKLOG.md` (P2, после `BUG-PDF-EXPORT-OKLAB-FAIL`):

```
### BUG-PVL-ADMIN-AS-MENTOR-EMPTY

- **Статус:** 🟢 DONE 2026-05-11 (Variant C + B applied)
- **Приоритет:** P2
- **Симптом:** Admin Ирина (и потенциально другие admin'ы) не
  видят свой список менти в учительской ПВЛ. UI показывает
  «Список менти пуст» без exception.
- **Root cause:** Race condition между `syncPvlActorsFromGarden`
  (async) и `useMemo` в `MentorPage` / `MentorMenteesPanel`. Deps
  не включали state-флаги завершённости sync.
- **Fix:** Variant C (useMemo deps + state-флаги) + Variant B
  бонус (`reportClientError` в catch hydrate → видим caught
  errors в TG).
- **Открыто:** 2026-05-11 утром, жалоба Ирины Одинцовой.
- **Lesson:** `docs/lessons/2026-05-11-pvl-admin-mentor-race-condition.md`.
- **Связано:** `CLEAN-015-SUPABASE-REMOVAL` (блокер).
```

### 5.2 Обнови `CLEAN-015-SUPABASE-REMOVAL` — добавь блокер

В описании тикета добавь:

```
- **Блокер:** не делать до закрытия `BUG-PVL-ADMIN-AS-MENTOR-EMPTY`.
  Причина: Supabase Realtime случайно триггерит re-render, что
  скрывает race condition в учительской. После CLEAN-015 race
  станет заметнее → необходимо сначала фиксить deps в useMemo.
```

### 5.3 История секция

Добавь запись в раздел «История» (после 2026-05-10):

```
#### 2026-05-11

- 🟢 **BUG-PVL-ADMIN-AS-MENTOR-EMPTY** — race condition в
  MentorPage useMemo. Закрыто через Variant C + B.
- 🟢 **Orphan record в `pvl_garden_mentor_links`** —
  `student_id=579a3392-...` удалена (ничего не существует в
  profiles/users_auth/pvl_students). 1 DELETE.
- 📋 **BUG-PDF-EXPORT-OKLAB-FAIL** (P2) — заведено.
- 📋 **MON-002-CROSSORIGIN-VISIBILITY** (P2) — заведено
  (cross-origin "Script error." без stack в TG).
- 📋 **PERF-002-LAZY-JSPDF** (P3) — заведено (jspdf грузится
  вместе с BuilderView, можно вынести в `await import`).
- 📋 **TECH-DEBT-PVL-CLEAR-STALE-SESSION** — НЕ заводим (
  race fix решает проблему другим путём).
```

### 5.4 Заведи `MON-002-CROSSORIGIN-VISIBILITY` (P2)

```
### MON-002-CROSSORIGIN-VISIBILITY

- **Статус:** 🔴 TODO
- **Приоритет:** P2
- **Симптом:** В TG приходят алерты `🚨 Garden client error /
  Script error.` без stack/source. 2 таких за утро 11.05
  (10:38, 11:09) от анонимных пользователей.
- **Root cause:** Браузер скрывает детали JS-ошибок от
  cross-origin scripts (без `crossorigin="anonymous"` +
  `Access-Control-Allow-Origin`). Наш bundle живёт на
  liga.skrebeyko.ru, но `<script>` тэги в index.html не имеют
  `crossorigin` атрибута → window.onerror получает
  обобщённое "Script error.".
- **Fix:**
  1. В `index.html` (или Vite build config) добавить
     `crossorigin="anonymous"` на `<script type="module">`.
  2. На статике hightek.ru добавить header
     `Access-Control-Allow-Origin: *` для `/assets/`.
  3. Verify через DevTools: реальная ошибка от bundle должна
     приходить в TG с полным stack'ом.
- **Когда:** после Phase 2B, не сегодня.
```

### 5.5 Заведи `PERF-002-LAZY-JSPDF` (P3)

```
### PERF-002-LAZY-JSPDF

- **Статус:** 🔴 TODO
- **Приоритет:** P3
- **Что:** jspdf (385 KB raw) сейчас загружается вместе с
  BuilderView chunk при открытии Конструктора. Должен
  загружаться только при клике «Экспортировать PDF» (как
  html2canvas в Phase 2A).
- **Fix:** Заменить статический `import jsPDF from 'jspdf'`
  на `const { default: jsPDF } = await import('jspdf')` в
  `views/BuilderView.jsx` `handleExportPdf` (аналогично
  html2canvas-фиксу из Phase 2A).
- **Эффект:** BuilderView chunk станет легче на ~385 KB.
- **Связано:** Phase 2A (html2canvas сделан), Phase 2B
  (можно сделать заодно).
```

---

## 6. Коммиты

Один большой коммит OK (race fix + reporter + lesson — связаны):

```
fix(pvl): race condition admin/mentor — useMemo deps + MON-001 catch reporting

- views/PvlPrototypeApp.jsx: добавлены deps на флаги завершения
  sync в useMemo MentorPage/MentorMenteesPanel/MentorDashboard
- services/pvlMockApi.js: reportClientError в catch hydrate
- docs/lessons/2026-05-11-pvl-admin-mentor-race-condition.md (new)

Closes: BUG-PVL-ADMIN-AS-MENTOR-EMPTY
```

Второй коммит — backlog updates:

```
chore(docs): backlog 2026-05-11 — race fix done + new tickets

- 🟢 BUG-PVL-ADMIN-AS-MENTOR-EMPTY DONE
- 📋 MON-002-CROSSORIGIN-VISIBILITY P2
- 📋 PERF-002-LAZY-JSPDF P3
- CLEAN-015-SUPABASE-REMOVAL: блокер от BUG-PVL-ADMIN-AS-MENTOR-EMPTY
  (теперь снят — DONE)
- История 2026-05-11
- 🟢 Orphan DELETE в pvl_garden_mentor_links (579a3392-...)
```

---

## 7. Workflow

1. Apply Variant C (useMemo deps).
2. Apply Variant B (reportClientError в catch hydrate).
3. Apply DELETE orphan (🟢 уже дано в чате чуть раньше).
4. Write lesson `2026-05-11-pvl-admin-mentor-race-condition.md`.
5. Update backlog (раздел 5).
6. `npm run build` — проверить что build проходит.
7. `npm run preview` → локальный smoke:
   - Залогинься как admin.
   - Очисти localStorage перед заходом → открой учительскую →
     менти должны быть **сразу**.
   - Throttle Network → повтори → менти должны быть **сразу**
     (а не «появляться через 2 секунды»).
8. Коммиты (2 шт, раздел 6).
9. Push **жди от меня 🟢 PUSH**.
10. Отчёт `_04_codeexec_race_fix_apply_report.md`:
    - Что закоммичено + файлы.
    - Что показал smoke в preview.
    - Открытые вопросы если есть.
11. После 🟢 PUSH:
    - `git push origin main`.
    - GitHub Actions deploy + smoke check.
    - **Ольгин smoke на проде через Claude in Chrome** —
      промпт стратега в `_05` (тот же что и Phase 2A, но с
      акцентом на учительскую/менти).
    - **Ирина** — не дёргаем повторно, у неё уже работает; в
      следующий раз когда зайдёт, race fix уже будет.

---

## 8. Что **не** делаешь

- Не пушишь без моего 🟢 PUSH.
- Не трогаешь CLEAN-015 (это следующий заход, после смока).
- Не трогаешь Phase 2B.
- Не трогаешь MON-002 / PERF-002 — только в backlog.
- Не правишь BUG-PDF-EXPORT-OKLAB-FAIL.

Жду `_04`.
