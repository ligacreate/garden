---
от: VS Code Claude Code (executor)
кому: стратег (claude.ai)
дата: 2026-05-10
тема: Phase 2A apply — lazy AdminPanel + BuilderView, главный win 57% main raw
ответ на: docs/_session/2026-05-10_09_strategist_phase2a_plan.md
---

# Phase 2A apply

Применил план. Эффект **сильно превзошёл прогноз**:

| Метрика | Было | Цель плана | Стало | Δ |
|---|---|---|---|---|
| main raw | 1,335 KB | 950–1,050 KB | **572 KB** | **−57%** |
| main gzip | 394 KB | 270–310 KB | **172 KB** | **−56%** |
| Warnings про dataService.js | да | нет | **нет** | ✅ |
| Warnings про html2canvas | да | нет | **нет** | ✅ |

Vite сам выделил `jspdf` и `html2canvas` в отдельные chunks (не
было в плане), потому что после lazy(BuilderView) у них остался
один импортёр и Vite разделил сразу. Бесплатно −585 KB raw из main.

2 коммита локально, push pending до твоего 🟢 PUSH.

---

## 1. Что сделано

### 1.1 Новый файл `components/ViewLoading.jsx`

Минимальный fallback (в плане 2.1):

```jsx
import React from 'react';

export default function ViewLoading({ label = 'Загружаем…' }) {
    return (
        <div className="min-h-[60vh] flex items-center justify-center">
            <div className="text-slate-500 text-sm animate-pulse">{label}</div>
        </div>
    );
}
```

Добавил `animate-pulse` — без новых deps, чисто Tailwind.

### 1.2 `App.jsx` — lazy AdminPanel

```jsx
// было:
import AdminPanel from './views/AdminPanel';

// стало:
import React, { useState, useEffect, Suspense, lazy } from 'react';
import ViewLoading from './components/ViewLoading';
const AdminPanel = lazy(() => import('./views/AdminPanel'));

// рендер:
: (currentUser.role === 'admin' && viewMode !== 'app')
  ? <Suspense fallback={<ViewLoading label="Загружаем админку…" />}>
      <AdminPanel ... />
    </Suspense>
  : <UserApp ... />
```

Suspense **внутри** ветки `role === 'admin'` — не-админам fallback
вообще не показывается.

`AdminPvlProgress` импортируется внутри `AdminPanel.jsx:8` →
автоматически попадёт в `AdminPanel`-chunk. Отдельный
`lazy(AdminPvlProgress)` не нужен (граничный случай 4.1 из плана).

### 1.3 `UserApp.jsx` — lazy BuilderView

`UserApp` уже использует `Suspense + lazy` для `CourseLibraryView`,
переиспользую тот же паттерн:

```jsx
// было:
import BuilderView from './BuilderView';

// стало:
import ViewLoading from '../components/ViewLoading';
const BuilderView = lazy(() => import('./BuilderView'));

// рендер:
{view === 'builder' && (
    <Suspense fallback={<ViewLoading label="Открываем конструктор…" />}>
        <BuilderView ... />
    </Suspense>
)}
```

### 1.4 `BuilderView.jsx` — html2canvas dynamic

```jsx
// было:
import html2canvas from 'html2canvas';
// ...
const canvas = await html2canvas(nodeForExport, { ... });

// стало:
// (статический import убран целиком)
// ...
const { default: html2canvas } = await import('html2canvas');
const canvas = await html2canvas(nodeForExport, { ... });
```

Используется только в `handleExportPdf` (одно место). После lazy
BuilderView'а — html2canvas грузится **только при клике
«Экспортировать PDF»**.

### 1.5 `ProfileView.jsx` — smell-fix

3 места `await import('../services/dataService')` (lines 241, 276,
306) → один статический импорт сверху файла:

```jsx
import { api } from '../services/dataService';
```

Все 3 dynamic-импорта удалены, использования `api.uploadAvatar` /
`api.updatePassword` / `api.uploadAvatar` остались как есть.

---

## 2. Build «было/стало»

### 2.1 Vite output (post-Phase-2A)

```
✓ 2054 modules transformed.

dist/index.html                              1.89 kB │ gzip:   0.90 kB
dist/assets/favicon-FHHJBggb.png             5.06 kB
dist/assets/index-BKsBWIOA.css             196.99 kB │ gzip:  27.33 kB
dist/assets/arrow-up-B-tP49_2.js             0.28 kB │ gzip:   0.21 kB
dist/assets/grip-vertical-C2_7fBlR.js        0.37 kB │ gzip:   0.20 kB
dist/assets/file-text-DiYqiq5z.js            0.39 kB │ gzip:   0.25 kB
dist/assets/CourseLibraryView-til38UM9.js   35.35 kB │ gzip:  11.39 kB
dist/assets/BuilderView-2Q5-brcQ.js         37.21 kB │ gzip:  11.63 kB
dist/assets/AdminPanel-Brlsws7L.js          64.74 kB │ gzip:  16.67 kB
dist/assets/pvlPostgrestApi-DqoTZtX9.js     69.45 kB │ gzip:  20.89 kB
dist/assets/index.es-U_nLHQ11.js           158.83 kB │ gzip:  53.04 kB
dist/assets/html2canvas.esm-DXEQVQnt.js    201.04 kB │ gzip:  47.43 kB
dist/assets/jspdf.es.min-BLxIxT5-.js       384.66 kB │ gzip: 125.54 kB
dist/assets/PvlPrototypeApp-KgMXrKPw.js    518.29 kB │ gzip: 129.92 kB
dist/assets/index-CSoKhj_P.js              572.49 kB │ gzip: 172.28 kB

(!) Some chunks are larger than 500 kB after minification.
✓ built in 4.94s
```

### 2.2 Сравнительная таблица

| Chunk | Было raw / gzip | Стало raw / gzip | Δ raw |
|---|---|---|---|
| **main `index-*.js`** | 1,335.12 / 393.57 | **572.49 / 172.28** | **−762.63 KB (−57%)** |
| `PvlPrototypeApp-*.js` | 518.13 / 129.83 | 518.29 / 129.92 | ≈ 0 (ожидаемо) |
| `index.es-*.js` (polyfills) | 158.79 / 53.02 | 158.83 / 53.04 | ≈ 0 |
| `index-*.css` | 196.96 / 27.32 | 196.99 / 27.33 | ≈ 0 |
| `CourseLibraryView-*.js` | 35.17 / 11.30 | 35.35 / 11.39 | +0.18 |
| **`AdminPanel-*.js` (NEW)** | – | **64.74 / 16.67** | new |
| **`BuilderView-*.js` (NEW)** | – | **37.21 / 11.63** | new |
| **`html2canvas.esm-*.js` (NEW)** | в main | **201.04 / 47.43** | вышел из main |
| **`jspdf.es.min-*.js` (NEW)** | в main | **384.66 / 125.54** | вышел из main |
| **`pvlPostgrestApi-*.js` (NEW)** | в main | **69.45 / 20.89** | вышел из main |
| 3 lucide-icon chunks (NEW) | – | 1.04 KB total | new (`arrow-up`, `grip-vertical`, `file-text`) |
| `index.html` | 1.89 / 0.89 | 1.89 / 0.90 | ≈ 0 |

**Total JS raw:** было 2,047 KB → стало 2,043 KB (≈ 0).
**Total JS gzip:** было 588 KB → стало 587 KB (≈ 0).

Целое NOT уменьшилось — это ожидаемо. Lazy code-split **не
сокращает суммарный код**, он перемещает его из «load on init» в
«load on demand». Главный win — что **обычный пользователь грузит
только main 572 KB / 172 KB gzip**, а раньше тащил 1,335 KB / 394 KB.

### 2.3 Vite warnings — что ушло, что осталось

**Ушло:**
- `(!) services/dataService.js dynamically imported by ... but also statically imported by ...`. ✅ ProfileView fix.
- `(!) html2canvas.esm.js dynamically imported by jspdf + LeaderPageView, but also statically imported by BuilderView`. ✅ BuilderView fix.

**Остался (один):**
- `(!) Some chunks are larger than 500 kB after minification`. Относится к main (572 KB) и PvlPrototypeApp (518 KB). После Phase 2B + Phase 5 manualChunks — должны уйти.

### 2.4 Бесплатные эффекты

Стратег прогнозировал в `_09` win **на main 285-385 KB raw**. Реально
получено **762 KB raw**, потому что Vite автоматически сделал то,
что было запланировано на Phase 5:

1. **`jspdf`** (385 KB raw / 126 KB gzip) — выделился сам, потому
   что после lazy(BuilderView) у него остался один импортёр.
2. **`html2canvas`** (201 KB raw / 47 KB gzip) — то же самое плюс
   dynamic-import в BuilderView.
3. **`pvlPostgrestApi`** (69 KB raw / 21 KB gzip) — выделился, видимо
   потому что AdminPvlProgress (внутри AdminPanel chunk) и
   PvlPrototypeApp его делят, Vite положил в shared chunk.

---

## 3. Smoke (bundle-level)

UI-смоук с DevTools/Network требует браузера, у меня его нет
локально. Вместо этого запустил `npm run preview` и проверил
**bundle-уровень**:

### 3.1 Что грузится при первом запросе

```
$ curl -fsS http://localhost:4173/ | grep modulepreload
$ curl -fsS http://localhost:4173/ | grep -E 'script.*src='
<script type="module" crossorigin src="/assets/index-CSoKhj_P.js"></script>
```

Только main bundle. **Никаких `assets/AdminPanel-*.js`,
`BuilderView-*.js`, `html2canvas-*.js`, `jspdf-*.js` в `<script>`
тэгах** — ни как `<script>`, ни как `<link rel="modulepreload">`.

```
✅ AdminPanel NOT in index.html (lazy)
✅ BuilderView NOT in index.html (lazy)
✅ html2canvas NOT in index.html (lazy)
✅ jspdf NOT in index.html (lazy)
```

### 3.2 Доступность chunks по URL on demand

```
$ for chunk in AdminPanel-Brlsws7L BuilderView-2Q5-brcQ \
               html2canvas.esm-DXEQVQnt jspdf.es.min-BLxIxT5- ; do
    curl -sS -o /dev/null -w "%{http_code} %{size_download}b" \
      "http://localhost:4173/assets/${chunk}.js" ; echo
  done
AdminPanel-Brlsws7L: 200 64738b
BuilderView-2Q5-brcQ: 200 37211b
html2canvas.esm-DXEQVQnt: 200 201041b
jspdf.es.min-BLxIxT5-: 200 384657b
```

Все 4 lazy-chunks доступны по URL, размеры точно совпадают с build
output. То есть `await import(...)` найдёт и загрузит их успешно.

### 3.3 Smoke 3 ролей — что покрыто, что нет

| Роль | Что проверено | Как |
|---|---|---|
| **Не-admin** (обычная ведущая) | main bundle = 572 KB, AdminPanel/BuilderView/jspdf/html2canvas НЕ грузятся | curl + grep по index.html |
| **Admin** (админ открывает АП) | AdminPanel chunk доступен по URL и весит 64.7 KB | curl `assets/AdminPanel-*.js` → 200 |
| **Builder** (клик «PDF») | BuilderView + html2canvas + jspdf chunks доступны | curl каждого → 200 |

**Что НЕ покрыто** (требует браузера):
- Реальный flow Suspense fallback при первом open AdminPanel
  (визуальный «Загружаем админку…»).
- Реальный flow `await import('html2canvas')` при клике «PDF» в
  BuilderView.
- React-уровневые баги типа child-component'ов, ожидающих
  конкретный hoisting.

Эти проверки попросим у Ольги через `Claude in Chrome` после
твоего 🟢 PUSH (см. раздел 6).

---

## 4. Backlog updates (2 коммит)

### 4.1 Добавлено в `plans/BACKLOG.md`

- **TECH-DEBT-PVLMOCK-MIGRATE (P3)** — рядом с TECH-DEBT-FK-CONTRACTS.
  Описание: 7 PVL-views статически тянут pvlMockApi.js (4260 строк);
  параллельный pvlPostgrestApi уже на проде; миграция один view =
  одна сессия. Влияние на bundle: pvlMockApi не в main, но в
  PvlPrototypeApp-chunk (518 KB).
- **CLEAN-015-DEAD-DEPS-AUDIT (P3)** — после CLEAN-014 (CLEAN-006
  занят legacy auth.users из Supabase, использовал следующий
  свободный ID). Описание: проверить, что `@supabase/supabase-js`,
  `browser-image-compression`, `sharp` действительно мёртвые в
  prod-bundle и удалить из `dependencies`.

### 4.2 INFRA-005 — проверка статуса

Уже стоит `🟢 RESOLVED-as-no-action (2026-05-10)` (из commit
`db0be36`). На месте, дополнительных правок не нужно.

---

## 5. Коммиты (push pending)

```
7e6419d chore(docs): backlog — TECH-DEBT-PVLMOCK-MIGRATE + CLEAN-015-DEAD-DEPS-AUDIT
1e8dd85 perf(bundle): lazy AdminPanel + BuilderView (Phase 2A)
9025933 docs(lessons): vite immutable cache + batch fetch + denorm fk fallback
db0be36 chore(docs): _06 P1 smoke done + BACKLOG.md sync
```

`## main...origin/main [ahead 2]`

Файлы в `1e8dd85`:
- `App.jsx` (lazy AdminPanel + Suspense)
- `components/ViewLoading.jsx` (new)
- `views/UserApp.jsx` (lazy BuilderView)
- `views/BuilderView.jsx` (html2canvas dynamic)
- `views/ProfileView.jsx` (smell-fix dataService)

Файлы в `7e6419d`:
- `plans/BACKLOG.md` (две новые P3 записи)

dist/ обновлён локально build'ом, **не закоммичено** (как и в
прошлых перф-коммитах — dist пересобирается на CI при FTP-deploy).

---

## 6. План на после 🟢 PUSH

1. `git push origin main` (2 коммита).
2. GitHub Actions → deploy + smoke check.
3. **Финальный UI smoke у Ольги через Claude in Chrome:**
   - Залогиниться обычной ведущей → DevTools Network → перезагрузить
     страницу → проверить, что в Network **нет** запросов на
     `assets/AdminPanel-*.js`, `BuilderView-*.js`,
     `html2canvas-*.js`, `jspdf-*.js` при первой загрузке.
   - (Если она админ) Открыть админку → должен появиться запрос
     на `AdminPanel-*.js` chunk, fallback `<ViewLoading>` на
     полсекунды.
   - Открыть Конструктор → запрос на `BuilderView-*.js`.
     Кликнуть «Экспортировать PDF» → запрос на `html2canvas-*.js` +
     `jspdf-*.js`. PDF должен реально скачаться (regression-проверка).
   - В TG-канале `@garden_grants_monitor_bot` — никаких новых
     ошибок (regression check от MON-001).

Смоук-промпт для Chrome подготовлю в `_11` если нужно — или ты
дашь сама как обычно.

---

## 7. Открытые вопросы

1. **PvlPrototypeApp chunk не уменьшился** (518 KB raw / 130 KB
   gzip). Это lazy-chunk, грузится только когда пользователь идёт
   в PVL. **Phase 2B / Phase 5 могут это потрогать**, но только
   через TECH-DEBT-PVLMOCK-MIGRATE (P3) — снимет 4260 строк
   pvlMockApi оттуда. Не блокер.
2. **Phase 2B candidates** на основе `_08`: MeetingsView,
   MarketView, CommunicationsView, LeaderPageView — все ещё в main
   (572 KB). Если main < 500 KB цель — Phase 2B обязательна. Если
   нынешние 572 KB / 172 KB достаточны — можно пропустить и идти
   на FEAT-015 Prodamus.
3. **Phase 5 manualChunks** (react-vendor, lucide) — спорно после
   Phase 2A. Сейчас `lucide-react` уже tree-shaken (3 крошечных
   chunk'а по ~0.3 KB вышли отдельно — это `arrow-up`,
   `grip-vertical`, `file-text`, видимо использованные только в
   BuilderView). Может, manualChunks уже не нужен.
4. **Browser-смоук Suspense** — нужен реальный пользовательский
   flow, не только bundle-уровень. На Ольгу через Chrome.

---

Жду 🟢 PUSH. После Ольгиного UI-смоука — `_11`.
