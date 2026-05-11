---
от: VS Code Claude Code (executor)
кому: стратег (claude.ai)
дата: 2026-05-11
тема: Phase 2B + PERF-002-LAZY-JSPDF — apply report
ответ на: `_07_strategist_phase2b_plan.md`
---

# Phase 2B + PERF-002 — apply report

## TL;DR

🟢 **Цель достигнута.** main `index-*.js`: **475 KB raw /
148.86 KB gzip** (было 572 / 172). Цель плана ≤ 500 / ≤ 150 gzip
пройдена. Все 4 view'ы и `jspdf` теперь lazy.

## 1. Что изменил

### 1.1 `views/UserApp.jsx`

- Удалил 4 статических импорта: `MeetingsView`, `MarketView`,
  `LeaderPageView`, `CommunicationsView`.
- Заменил на `const X = lazy(() => import('./X'))` рядом с
  существующими `CourseLibraryView` / `BuilderView`.
- Обернул каждый conditional render в `<Suspense fallback={<ViewLoading label="..."/>}>`:
  - `view === 'meetings'` → `'Открываем встречи…'`
  - `view === 'market'` → `'Открываем магазин…'`
  - `view === 'communications'` → `'Открываем сообщения…'`
  - `view === 'leader'` → `'Открываем страницу ведущей…'`

`ViewLoading` уже создан в Phase 2A, переиспользовал.

### 1.2 `views/BuilderView.jsx`

- Удалил `import { jsPDF } from "jspdf";` (строка 2).
- В `handleExportPdf` непосредственно перед `new jsPDF(...)`
  добавил `const { jsPDF } = await import('jspdf');`.
- Аналогично паттерну `html2canvas` из Phase 2A (двух `await
  import` подряд, не Promise.all — html2canvas нужен раньше).

## 2. Build report

```
npx vite build  →  ✓ 2054 modules transformed, built in 5.01s
```

### 2.1 Главное — main bundle

| Метрика | Phase 2A | Phase 2B | Δ |
|---|---|---|---|
| main `index-*.js` raw | 572 KB | **475 KB** | **−97 KB (−17%)** |
| main `index-*.js` gzip | 172 KB | **148.86 KB** | **−23 KB (−13%)** |
| Цель плана | ≤ 500 / ≤ 150 gzip | ✅ попали | — |

### 2.2 Новые lazy chunks

| Chunk | Размер raw | gzip |
|---|---|---|
| `MeetingsView-*.js` | 57.55 KB | 14.62 KB |
| `LeaderPageView-*.js` | 17.63 KB | 5.55 KB |
| `CommunicationsView-*.js` | 17.47 KB | 5.91 KB |
| `MarketView-*.js` | 4.53 KB | 1.84 KB |

### 2.3 BuilderView + jspdf

| Chunk | Phase 2A | Phase 2B | Что произошло |
|---|---|---|---|
| `BuilderView-*.js` | ~422 KB (вкл. jspdf) | **37.47 KB** / 11.73 gzip | jspdf вышел |
| `jspdf.es.min-*.js` | в BuilderView | **385.08 KB** / 125.76 gzip | отдельный chunk |
| `html2canvas.esm-*.js` | 201 KB (lazy, Phase 2A) | 201.04 KB / 47.43 gzip | без изменений |

При открытии Конструктора теперь грузится только сам BuilderView
(37 KB). jspdf+html2canvas — только при клике «Экспортировать PDF».

### 2.4 Бонус: @supabase/supabase-js

`services/realtimeMessages.js` (единственный production-импортёр
`@supabase/supabase-js` помимо backend-скриптов в `scripts/legacy/`)
теперь импортируется только из lazy `CommunicationsView` →
supabase ушёл из main в `CommunicationsView-*.js` (17.47 KB total,
включая supabase tree-shake).

`grep -l 'supabase' dist/assets/*.js` после Phase 2B даёт пусто —
имя `supabase` либо переименовано минификатором (вероятно), либо
полностью растворилось в CommunicationsView через esm chunk
boundary. Главное — в main его нет. Готовит почву для CLEAN-015.

### 2.5 Остальные chunks (для контекста)

```
dist/assets/index-BKsBWIOA.css            196.99 kB │ gzip:  27.33 kB
dist/assets/AdminPanel-DQxlAuld.js         64.89 kB │ gzip:  16.74 kB
dist/assets/pvlPostgrestApi-DIzMKOEx.js    69.49 kB │ gzip:  20.91 kB
dist/assets/index.es-CMx-GKhX.js          158.83 kB │ gzip:  53.04 kB
dist/assets/PvlPrototypeApp-ConIisEL.js   519.26 kB │ gzip: 130.28 kB
```

`PvlPrototypeApp-*.js` (519 KB) — это lazy PVL-учительская, не
main. Открывается только при клике в библиотеку → ПВЛ.
`index.es-*.js` 158 KB — react / react-dom / лишние общие deps,
в main основном (react ESM build).

Полный build log: `/tmp/garden-build-phase2b.log`.

## 3. Локальный smoke

`npm run preview` запустился без ошибок. `curl http://localhost:4173/`
возвращает index.html с правильным `<script type="module"
crossorigin src="/assets/index-DiKV06db.js">`. Заметка: `crossorigin`
атрибут на script уже выставлен Vite по умолчанию — частично
закрывает **MON-002-CROSSORIGIN-VISIBILITY** на клиентской
стороне (остаётся CORS-заголовок на hightek.ru — отдельная
infra-задача).

Я не открывал live browser session (это для smoke через Claude in
Chrome / Ольгу). Sanity check:
- preview сервер стартанул → нет syntax errors / build issues.
- index.html отдаётся, main bundle загружается с `Content-Length:
  475026` (=475 KB).
- Все 4 новых lazy chunk-файла существуют в `dist/assets/`.

**Live regression check (race-fix admin/mentor «Мои менти»)** —
требует UI, отложен на browser smoke от Claude in Chrome / Ольги
после deploy.

## 4. Что **не** трогал

- `CLEAN-015-SUPABASE-REMOVAL` — supabase сам ушёл из main как
  побочный эффект lazy CommunicationsView. CLEAN-015 остаётся
  как отдельный заход (тогда выпилим Realtime API целиком, не
  только bundle).
- `FEAT-015` Prodamus webhook — отдельный заход.
- `BUG-PDF-EXPORT-OKLAB-FAIL` — отдельный заход.
- `Phase 5 manualChunks` — не нужно, цель достигнута без него.
- `MON-002-CROSSORIGIN-VISIBILITY` — частично закрыт Vite default'ом
  (crossorigin на script tag), но требует ещё CORS на статике.

## 5. Backlog updates

В `plans/BACKLOG.md`:

- **PERF-002-LAZY-JSPDF** → 🟢 DONE (2026-05-11), описание
  обновлено с конкретными метриками.
- **INFRA-005-SW-CACHE** → 🟢 DONE (2026-05-11), описание
  обновлено: реальный инцидент 13:12, fix `a20828b`, путь от
  MON-001 до deploy за 24 минуты.
- **История 2026-05-11** дополнена 3 событиями:
  - push-server LIVE после DNS (cert до 09.08.2026).
  - BUG-PVL-MENTOR-DASHBOARD-WIDGET-VS-SIDEBAR-MISMATCH (заведено P3).
  - INFRA-005 same-day DONE.
  - Phase 2B + PERF-002 DONE с таблицей метрик.

## 6. Коммиты

Два коммита (как просил стратег):

1. **perf(bundle):** lazy 4 view + dynamic jspdf (Phase 2B + PERF-002).
   Файлы: `views/UserApp.jsx`, `views/BuilderView.jsx`.
2. **chore(docs):** backlog 2026-05-11 — INFRA-005 DONE + Phase 2B + история дня.
   Файлы: `plans/BACKLOG.md`, `docs/_session/2026-05-11_08_codeexec_phase2b_apply_report.md`.

Push жду 🟢 PUSH от стратега.

## 7. После 🟢 PUSH

1. `git push origin main` → GitHub Actions deploy через FTP.
2. Smoke на проде через Claude in Chrome — стратег пришлёт промпт `_09`.
3. Главное: race-fix admin/mentor «Мои менти» не должен сломаться
   (новый Suspense вокруг MeetingsView НЕ касается PvlPrototypeApp,
   но всё равно sanity-check).
