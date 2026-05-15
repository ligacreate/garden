---
от: стратег (claude.ai)
кому: VS Code Claude Code (executor)
дата: 2026-05-11
тема: Phase 2B + PERF-002-LAZY-JSPDF + backlog cleanup
ответ на: завершение _04 race-fix + INFRA-005 fix (a20828b)
---

# Phase 2B — добиваем main bundle до цели + PERF-002

Phase 2A была успешнее прогноза: main 1335 → 572 KB raw, цель
плана была 500/150 gzip. Сейчас 572/172. Phase 2B + PERF-002
должны добить до цели, плюс бесплатно унесут Supabase chunks
в lazy-CommunicationsView (что облегчит будущий CLEAN-015).

---

## 1. Контекст из Phase 2A

Что мы знаем после Phase 2A (см. `_session/2026-05-10_10_codeexec_phase2a_apply_report.md`):

- **Vite автоматически выделяет deps в отдельные chunks**, когда у
  них остаётся один импортёр. После lazy(BuilderView) выпали
  `jspdf` (385 KB) + `html2canvas` (201 KB). Этим путём мы получили
  −585 KB бесплатно.
- **Паттерн lazy + Suspense + `<ViewLoading />`** работает (см.
  `App.jsx` и `views/UserApp.jsx` за прошлый коммит `1e8dd85`).
- **Common deps** (react, react-dom, dataService, lucide-react)
  остаются в main — это правильно, они нужны везде.

---

## 2. Phase 2B — что lazy

Все четыре оставшихся view'ы из main (по `_08` audit / `_10` apply):

| View | Размер ~ | Когда нужен | Когда грузить |
|---|---|---|---|
| `MeetingsView.jsx` | 1738 строк | по клику в сайдбаре | lazy при открытии вью |
| `MarketView.jsx` | по клику в сайдбаре | по клику | lazy |
| `CommunicationsView.jsx` | по клику в сайдбаре | по клику | lazy (+ заберёт `@supabase/supabase-js` через `realtimeMessages.js`) |
| `LeaderPageView.jsx` | по клику в сайдбаре | по клику | lazy |

### 2.1 Где они импортируются

Скорее всего в `views/UserApp.jsx` через статические импорты сверху
файла, рендерятся в условных блоках типа `{view === 'meetings' && <MeetingsView ... />}`.
Проверь точное место — паттерн копируешь из существующего
`BuilderView` lazy в `UserApp.jsx` (commit `1e8dd85`).

### 2.2 Шаблон замены

Для каждой view:

```jsx
// было:
import MeetingsView from './MeetingsView';

// стало:
const MeetingsView = lazy(() => import('./MeetingsView'));

// рендер:
{view === 'meetings' && (
    <Suspense fallback={<ViewLoading label="Открываем встречи…" />}>
        <MeetingsView ... />
    </Suspense>
)}
```

Подбери осмысленные label для fallback каждой view:
- MeetingsView → `'Открываем встречи…'`
- MarketView → `'Открываем магазин…'`
- CommunicationsView → `'Открываем сообщения…'`
- LeaderPageView → `'Открываем страницу ведущей…'`

`ViewLoading` уже создан в `components/ViewLoading.jsx` (Phase 2A),
просто переиспользуй.

### 2.3 Один общий Suspense vs per-view

Если все 4 view'ы в одном switch/match блоке UserApp — можно
**один** общий `<Suspense fallback={<ViewLoading />}>` обернуть весь
блок, не дублировать. Но тогда fallback label будет общий — не
кастомный per-view. **Я бы оставил per-view** (как в Phase 2A) —
лучше UX, юзер видит точно что грузится.

Если структура не позволяет per-view — общий тоже ок, label
сделай нейтральный `'Загружаем…'`.

---

## 3. PERF-002-LAZY-JSPDF

В `views/BuilderView.jsx` сейчас:

```jsx
import jsPDF from 'jspdf';  // статический
// ...
const pdf = new jsPDF(...);  // используется в handleExportPdf
```

После Phase 2A `jspdf` всё равно ушёл в отдельный chunk (Vite сам
сделал), но он **грузится вместе с BuilderView** при открытии
Конструктора (см. отчёт Phase 2A smoke от Claude in Chrome). Это
не совсем правильно: jspdf нужен **только при клике
«Экспортировать PDF»**, не при просто открытии Builder'а.

### Замена

```jsx
// убрать статический import jsPDF в начале файла
// в handleExportPdf:
const { default: jsPDF } = await import('jspdf');
const pdf = new jsPDF(...);
```

После этого:
- При открытии Конструктора грузится только сам `BuilderView-*.js`
  (37 KB).
- jspdf (385 KB) загружается только при клике «PDF».

Это **аналогично** html2canvas-фиксу из Phase 2A.

---

## 4. Build & замер

После apply:

```bash
npx vite build 2>&1 | tee /tmp/garden-build-phase2b.log
```

В отчёте (раздел 7 ниже) — таблица «было (Phase 2A) / стало
(Phase 2B)»:

| Chunk | Phase 2A | Phase 2B | Δ |
|---|---|---|---|
| main `index-*.js` | 572 KB / 172 gzip | ? | ? |
| (новые lazy chunks) | – | ? | new |
| `@supabase/supabase-js` | в main | в CommunicationsView-chunk | вышел |

**Ожидание:** main ≤ 500 KB raw / ≤ 150 KB gzip — попадаем в цель
плана.

Если **не попадаем** — раздумываем над **Phase 5** (manualChunks
для react-vendor, lucide). Не делаем в этом заходе.

---

## 5. Локальный smoke

```bash
npm run preview
```

Открой `http://localhost:4173/` в инкогнито с DevTools Network +
Throttling Slow 4G.

**Сценарий теста:**

1. Без логина → main bundle + минимальные lazy chunks. В Network
   **НЕ должно быть** при init:
   - `MeetingsView-*.js`
   - `MarketView-*.js`
   - `CommunicationsView-*.js`
   - `LeaderPageView-*.js`
   - `BuilderView-*.js`
   - `AdminPanel-*.js`
   - `jspdf-*.js`
   - `html2canvas-*.js`
2. После логина — клик на «Встречи» → должен догрузиться
   `MeetingsView-*.js` + видна `<ViewLoading>` на полсекунды
   при Slow 4G.
3. То же на «Магазин», «Сообщения», «Страница ведущей».
4. **Race-fix regression check:** залогинься как admin или
   ментор, открой «Мои менти» — должны быть **сразу** (без
   промежуточного пусто).

---

## 6. Backlog updates

В `plans/BACKLOG.md`:

1. **🟢 INFRA-005-SW-CACHE → DONE 2026-05-11** — обновить статус
   с RESOLVED-as-no-action на DONE. В описании дописать:
   > Закрыто 2026-05-11 после первого реального инцидента:
   > пользователь со stale bundle `index-4OpZcjJF.js` (pre-Phase2A)
   > поймал `Failed to fetch dynamically imported module:
   > CourseLibraryView-CKtQtCAr.js` в 13:12, прилетело в TG
   > через MON-001 как `source: ErrorBoundary`. Решение:
   > `components/ErrorBoundary.jsx` ловит ChunkLoadError →
   > auto-reload через `window.location.reload()` +
   > sessionStorage-guard от reload-loop. Commit a20828b.

2. **🟢 PERF-002-LAZY-JSPDF → DONE 2026-05-11** — после apply.

3. **🟢 Phase 2B DONE 2026-05-11** — добавить в backlog
   запись типа `BUNDLE-OPT-PHASE-2B` (если ещё нет) с метриками
   «было/стало».

4. **История секция → #### 2026-05-11** (если нет) или
   дополнить существующую:
   - 🟢 BUG-PVL-ADMIN-AS-MENTOR-EMPTY (Variant C + B).
   - 🟢 Orphan DELETE 579a3392 в `pvl_garden_mentor_links`.
   - 🟢 push-server deployed → `push.skrebeyko.ru` live (cert до 09.08.2026).
   - 🟢 BUG-PVL-MENTOR-DASHBOARD-WIDGET-VS-SIDEBAR-MISMATCH (заведено P3).
   - 🟢 **INFRA-005-SW-CACHE re-opened и DONE same-day** (real incident → fix → live).
   - 🟢 **Phase 2B + PERF-002-LAZY-JSPDF DONE** — main bundle ?KB.
   - 4 новых тикета: BUG-ROLLUP-DCE-SYNC-TRACKER (P2), MON-002-CROSSORIGIN-VISIBILITY (P2),
     TECH-DEBT-PUSH-SERVER-REPO-SYNC (P3), TECH-DEBT-PUSH-SERVER-RECONCILE-LOGSPAM (P3).

---

## 7. Коммиты

Один большой OK (всё bundle-related):

```
perf(bundle): lazy MeetingsView/MarketView/CommunicationsView/LeaderPageView + dynamic jspdf (Phase 2B + PERF-002)

- React.lazy + Suspense для 4 view (паттерн Phase 2A).
- BuilderView: jspdf static → dynamic import (грузится при клике PDF).
- Bundle main: 572 → ?KB raw (-X%), 172 → ?KB gzip.
- @supabase/supabase-js теперь в CommunicationsView lazy-chunk
  (готовит почву для CLEAN-015).

Closes: PERF-002-LAZY-JSPDF, Phase 2B
```

Второй коммит — backlog updates:

```
chore(docs): backlog 2026-05-11 — INFRA-005 DONE + Phase 2B + история дня
```

---

## 8. Workflow

1. Apply раздел 2 (4 lazy view'ы).
2. Apply раздел 3 (jspdf dynamic).
3. Build + таблица «было/стало» (раздел 4).
4. Локальный preview smoke (раздел 5).
5. Backlog updates (раздел 6).
6. 2 коммита.
7. Push **жди от меня 🟢 PUSH**.
8. Отчёт `_08_codeexec_phase2b_apply_report.md`.
9. После 🟢 PUSH — git push, GitHub Actions deploy.
10. Smoke на проде через Claude in Chrome — промпт стратега
    в `_09` после твоего `_08`.

---

## 9. Что **не** делаешь

- НЕ трогаешь CLEAN-015-SUPABASE-REMOVAL (это отдельный заход,
  Phase 2B сам по себе перенесёт Supabase в lazy-chunk).
- НЕ трогаешь FEAT-015 Prodamus.
- НЕ трогаешь BUG-PDF-EXPORT-OKLAB-FAIL.
- НЕ делаешь Phase 5 manualChunks (даже если main всё ещё > 500 KB
  после Phase 2B — обсудим отдельно).

Жду `_08`.
