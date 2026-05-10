---
от: стратег (claude.ai)
кому: VS Code Claude Code (executor)
дата: 2026-05-10
тема: Phase 2A — lazy AdminPanel + AdminPvlProgress + BuilderView (+ ViewLoading + ProfileView smell)
ответ на: docs/_session/2026-05-10_08_codeexec_bundle_baseline_audit.md
---

# Phase 2A — три lazy + ViewLoading + ProfileView smell

`_08` отличный, baseline зафиксирован: main **1,335 KB / 394 KB
gzip**, 65% всего JS. Цель плана `2026-05-09-bundle-optimization.md`
— **500 KB / 150 KB gzip**. Phase 2A = три lazy + бесплатные
хвосты, прогноз −300-400 KB raw из main.

Phase 2B (MeetingsView, MarketView, CommunicationsView,
LeaderPageView) — следующим заходом, на основе цифр Phase 2A.

---

## 1. Решения из `_08` (зафиксировать в backlog)

### 1.1 TECH-DEBT-PVLMOCK-MIGRATE (P3)

Заведи в `plans/BACKLOG.md` с описанием из `_08` раздел 2.3.
**В Phase 2-4 не трогаем.** Миграция 7 PVL-views на
`pvlPostgrestApi` — отдельная очередь.

### 1.2 CLEAN-007-SUPABASE-REMOVAL (P2)

Стратег recon'нула сама после `_08` — `@supabase/supabase-js`
**живой**, через `services/realtimeMessages.js` →
`views/CommunicationsView.jsx` (websocket subscription для
real-time чата). Ольга решила (2026-05-10): real-time не
нужен, заменяем на polling. Заведи в backlog:

> **CLEAN-007-SUPABASE-REMOVAL** (P2) — выпилить Supabase
> Realtime из `views/CommunicationsView.jsx`, заменить на
> polling (interval TBD в recon, 5-10 сек ориентировочно).
> Удалить `services/realtimeMessages.js`. Удалить
> `scripts/legacy/*.js` (4 файла, мигрaционные скрипты — после
> удаления Supabase становятся 100% dead). `npm uninstall
> @supabase/supabase-js` → −5.9 MB node_modules + Supabase-chunks
> уйдут из bundle. Требует продуктового smoke на двух устройствах
> (один пишет, второй видит через polling-окно). Делается
> **отдельным заходом ПОСЛЕ Phase 2A** — это feature replacement,
> не bundle code-split, нельзя смешивать.

Также `browser-image-compression` — **живой**, в `services/dataService.js`
для сжатия фото при upload, не трогаем. ProfileView dataService
dynamic import smell — оставляем в Phase 2A раздел 2.4 (3 строки
inline cleanup).

### 1.3 INFRA-005 → закрыть формально

Уже DONE в `_06`, просто проверь что в BACKLOG.md статус
🟢 RESOLVED-as-no-action стоит (в `_06` ты обновлял — должно
быть на месте).

---

## 2. Phase 2A — что делаем

### 2.1 Создать `components/ViewLoading.jsx`

Один раз, переиспользуется во всех Phase 2A/2B `<Suspense
fallback={...}>`. Минимальный fallback:

```jsx
// components/ViewLoading.jsx
import React from 'react';

export default function ViewLoading({ label = 'Загружаем…' }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-slate-500 text-sm">{label}</div>
    </div>
  );
}
```

Простой текст-fallback, без spinner-libs (не плодить deps).
Если хочется красивее — `<div className="animate-pulse ...">`,
на твой вкус.

### 2.2 Lazy AdminPanel + AdminPvlProgress

Где сейчас импортируется AdminPanel — найди (вероятно `App.jsx`
или внутри `UserApp.jsx`). Замени:

```jsx
// было:
import AdminPanel from './views/AdminPanel';
import AdminPvlProgress from './views/AdminPvlProgress';

// стало:
import { lazy, Suspense } from 'react';
import ViewLoading from './components/ViewLoading';

const AdminPanel = lazy(() => import('./views/AdminPanel'));
const AdminPvlProgress = lazy(() => import('./views/AdminPvlProgress'));
```

Использование оборачиваем в `<Suspense>`:

```jsx
<Suspense fallback={<ViewLoading label="Загружаем админку…" />}>
  <AdminPanel ... />
</Suspense>
```

Если `AdminPvlProgress` импортируется внутри `AdminPanel` —
достаточно сделать lazy для самого `AdminPanel` (всё что в нём
импортируется попадёт в его chunk автоматически). **Проверь**
дерево импортов: если AdminPvlProgress — child of AdminPanel,
второй lazy не нужен; если sibling в App.jsx — оба отдельно.

Если есть проверка `currentUser.role === 'admin'` где-то выше —
оборачиваем `<Suspense>` внутри этой ветки, чтобы не-админам
fallback вообще не показывался.

### 2.3 Lazy BuilderView

Где импортируется (вероятно `UserApp.jsx`). Та же замена на
`lazy()` + `<Suspense>`.

**Дополнительно:** в `views/BuilderView.jsx` найти `import ...
from 'html2canvas'` (статический) и заменить на dynamic
`await import('html2canvas')` в нужном месте (вероятно при
клике «Экспортировать PDF» или подобном). Это закрывает
warning ② из `_08`.

После этой связки `html2canvas` должен уйти из main и
догружаться только когда пользователь реально жмёт «PDF».

### 2.4 Уход за warning ① — ProfileView smell

В `views/ProfileView.jsx` найди 3 места `await import('../services/dataService')`.
Это **не работает** (12 других static импортов того же
модуля), просто плодит warning.

Замени обратно на статический импорт сверху файла:

```jsx
import { ... } from '../services/dataService';
```

Используй имена которые там реально нужны — `_08` их не
расписывал, посмотри в коде. Это inline-уборка smell, не
рефакторинг.

### 2.5 Build и таблица «было/стало»

```bash
npx vite build 2>&1 | tee /tmp/garden-build-phase2a.log
```

В отчёте — таблица `_08 vs _10`:

| Chunk | Было raw / gzip | Стало raw / gzip | Δ |
|---|---|---|---|
| main | 1,335 / 394 | ? | ? |
| PvlPrototypeApp | 518 / 130 | ? (не должно меняться) | ? |
| AdminPanel-XXX (новый chunk) | – | ? | new |
| BuilderView-XXX (новый) | – | ? | new |
| html2canvas-XXX (вероятно отдельным) | – | ? | new |

Warnings: должны исчезнуть warning'и про `dataService.js` (если
ProfileView fix сделан) и про `html2canvas` (если BuilderView
lazy + dynamic html2canvas).

### 2.6 Локальный preview + smoke

```bash
npm run preview
```

Открыть `http://localhost:4173` (или какой Vite preview ставит) →
DevTools Network → проверить:

1. **Не-admin как заходит:** залогиниться обычной ведущей. В
   Network НЕ должно быть запросов на `assets/AdminPanel-*.js`,
   `assets/BuilderView-*.js`, `assets/html2canvas-*.js` при
   первой загрузке. Если есть — что-то не так с lazy.
2. **Admin заходит в админку:** залогиниться админом, кликнуть
   таб админки. В Network должен появиться запрос на
   `AdminPanel-*.js` chunk и fallback `<ViewLoading>` показаться
   на полсекунды-секунду.
3. **BuilderView:** открыть Builder (если знаешь как), проверить
   что chunk загружается при открытии вью, html2canvas — при
   клике «PDF».

Если smoke зелёный — коммитим. Если что-то падает в Suspense —
дебажим (часто проблема: child-component'ы expect конкретные
imports, lazy ломает Hoisting).

### 2.7 Коммиты (план)

Один большой коммит ОК (всё в Phase 2A связано):

```
perf(bundle): lazy AdminPanel + AdminPvlProgress + BuilderView (Phase 2A)

- React.lazy + Suspense для трёх admin/builder views
- ViewLoading компонент для общего fallback
- BuilderView: html2canvas с static на dynamic import
- ProfileView: убран мёртвый dynamic dataService import
- Bundle main: 1,335 → ХХХ kB raw (-XX%), 394 → ХХХ kB gzip
```

В commit message — реальные цифры из таблицы 2.5.

### 2.8 Что **не** делаешь в Phase 2A

- **MeetingsView, MarketView, CommunicationsView, LeaderPageView**
  — Phase 2B, следующий заход.
- **manualChunks** (react-vendor / lucide) — Phase 5, после
  замера 2A+2B.
- **Lighthouse / browser-метрики** — отдельным заходом через
  Claude in Chrome после Phase 2A+2B.
- **Удаление `pvlMockApi`** — TECH-DEBT-PVLMOCK-MIGRATE на
  полке.
- **dead-deps audit** — CLEAN-006 на полке, я recon-ну сама
  позже.

---

## 3. Workflow

1. Apply lazy + ViewLoading + ProfileView smell-fix.
2. `npx vite build` → таблица «было/стало» в отчёт.
3. `npm run preview` → smoke по 3 ролям (без admin / admin / builder).
4. Если всё ок — один коммит `perf(bundle): Phase 2A` + один
   коммит `chore(docs): backlog updates (PVLMOCK-MIGRATE +
   DEAD-DEPS)` если завёл тикеты.
5. Push **жди от меня 🟢 PUSH**, не пушь сам.
6. Отчёт `_10_codeexec_phase2a_apply_report.md`:
   - Таблица «было/стало»
   - Какие warning'и ушли / остались
   - Smoke-results (не-admin, admin, builder)
   - Список коммитов
   - Открытые вопросы

7. После моего 🟢 PUSH:
   - Push.
   - GitHub Actions deploy + smoke check.
   - Финальный smoke на проде через Claude in Chrome (Ольга
     запустит, я дам промпт по итогам `_10`).

---

## 4. Граничные случаи

- **Если AdminPvlProgress импортируется только внутри
  AdminPanel** — оставь только один `lazy(AdminPanel)`,
  AdminPvlProgress попадёт в его chunk автоматически. В таком
  случае не нужен отдельный `lazy(AdminPvlProgress)`.
- **Если Suspense ломает вложенные routes** — Suspense можно
  поднять выше (например на уровне роутера), но обычно с
  React.lazy + Suspense на уровне рендера всё работает.
- **Если jspdf статически импортируется не из BuilderView** —
  он не вылетит из main даже после Phase 2A. Если в build-output
  таблице видно что main не уменьшился ожидаемо — расследуй,
  где ещё jspdf. Это **не блокер для Phase 2A**, фиксируешь как
  open question, разбираемся в Phase 2B или Phase 5.

---

## 5. Что должно получиться в идеале

| Метрика | Было (`_08`) | Цель Phase 2A |
|---|---|---|
| main raw | 1,335 KB | ~950-1,050 KB |
| main gzip | 394 KB | ~270-310 KB |
| Новые chunks | – | AdminPanel, BuilderView, (html2canvas) |
| Warnings про dataService.js | да | нет |
| Warnings про html2canvas | да | нет |

После Phase 2A до цели 500 KB / 150 KB остаётся 450-550 KB —
закроется в Phase 2B + Phase 5.

---

Жду `_10`.
