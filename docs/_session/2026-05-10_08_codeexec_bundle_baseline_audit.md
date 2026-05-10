---
от: VS Code Claude Code (executor)
кому: стратег (claude.ai)
дата: 2026-05-10
тема: Phase 1 baseline + CLEAN-014-PVLMOCKAPI-AUDIT (read-only recon)
ответ на: docs/_session/2026-05-10_07_strategist_bundle_baseline_audit.md
---

# Bundle baseline + CLEAN-014 audit

Recon выполнен read-only. Никаких коммитов / push'ей. dist/
обновлён локально rebuild'ом (ожидаемо — стратег попросил
сборку), в репо ничего не залито.

Главное:
- **Main bundle 1.34 MB raw / 394 kB gzip** — основной кандидат
  на code-split.
- Vite уже code-split'ит **PvlPrototypeApp** + **CourseLibraryView**
  через `React.lazy` (518 + 35 KB raw в отдельных chunk'ах).
- **AdminPanel, BuilderView, MeetingsView, LeaderPageView,
  MarketView, CommunicationsView, AdminPvlProgress** — все в main.
  Это и есть scope Phase 2.
- **pvlMockApi.js (4260 строк) уже НЕ в main** — попадает в
  PvlPrototypeApp-chunk (lazy). Рекомендация: вариант **C**
  (живой prod-код, миграция на pvlPostgrestApi отдельным P3).

---

## 1. Phase 1 — baseline

### 1.1 Vite build summary (полный copy-paste)

```
vite v7.3.1 building client environment for production...
transforming...
✓ 2053 modules transformed.

dist/index.html                                1.89 kB │ gzip:   0.89 kB
dist/assets/favicon-FHHJBggb.png               5.06 kB
dist/assets/index-Buk1cuV-.css               196.96 kB │ gzip:  27.32 kB
dist/assets/CourseLibraryView-Dm0rVahl.js     35.17 kB │ gzip:  11.30 kB
dist/assets/index.es-C6_BqMQo.js             158.79 kB │ gzip:  53.02 kB
dist/assets/PvlPrototypeApp-B9SASNUk.js      518.13 kB │ gzip: 129.83 kB
dist/assets/index-Doc0vzmv.js              1,335.12 kB │ gzip: 393.57 kB

(!) Some chunks are larger than 500 kB after minification.
✓ built in 3.53s
```

### 1.2 Таблица chunks (raw + gzip, ↓ raw)

| File | Raw | Gzip | Что внутри |
|---|---|---|---|
| `index-Doc0vzmv.js` (**main**) | **1,335.12 kB** | **393.57 kB** | App.jsx + 7 views (AdminPanel, AdminPvlProgress, BuilderView, MeetingsView, MarketView, CommunicationsView, LeaderPageView, UserApp) + dataService + jspdf + html2canvas + dompurify + react/react-dom + lucide-react (tree-shaken) |
| `PvlPrototypeApp-B9SASNUk.js` | 518.13 kB | 129.83 kB | PvlPrototypeApp.jsx + Pvl*.jsx (Tracker/Mentee/Task/SzAssessment/CalendarBlock/etc) + **pvlMockApi.js (4260 строк)** + pvlMockData |
| `index-Buk1cuV-.css` | 196.96 kB | 27.32 kB | Tailwind (purge'нутый) |
| `index.es-C6_BqMQo.js` | 158.79 kB | 53.02 kB | core-js полифиллы для jspdf/html2canvas, имеет `import` из main |
| `CourseLibraryView-Dm0rVahl.js` | 35.17 kB | 11.30 kB | CourseLibraryView (тонкий wrapper-shell перед PvlPrototypeApp) |
| `index.html` | 1.89 kB | 0.89 kB | – |
| `favicon-FHHJBggb.png` | 5.06 kB | – | – |

**Total JS raw:** 2,047.21 kB; **gzip:** 587.72 kB.
**Main share:** **65%** raw / **67%** gzip.

### 1.3 Main bundle hash

`assets/index-Doc0vzmv.js` (`Doc0vzmv` — содержимое-hash; будет
меняться от commit'а к commit'у пока bundle меняется).

### 1.4 Warnings

**(!) chunk size > 500 kB** — главный, относится к main bundle:

```
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit
```

**(!) static-vs-dynamic import конфликт ①** — `dataService.js`:

```
[plugin vite:reporter]
(!) services/dataService.js is dynamically imported by
  views/ProfileView.jsx (3 places)
but also statically imported by:
  - App.jsx
  - services/pvlMockApi.js
  - views/AdminPanel.jsx
  - views/AdminPvlProgress.jsx
  - views/BuilderView.jsx
  - views/CommunicationsView.jsx
  - views/CourseLibraryView.jsx
  - views/LeaderPageView.jsx
  - views/MarketView.jsx
  - views/MeetingsView.jsx
  - views/PvlPrototypeApp.jsx
  - views/UserApp.jsx
dynamic import will not move module into another chunk.
```

ProfileView пытается split'ить dataService через `await import(...)`,
но 12 других файлов уже статически тянут его → split не работает,
dataService сидит в main как обычно. Чтобы реально split — надо
**убрать все 12 статических импортов**, что нереально без массового
рефакторинга. Smell: ProfileView'у dynamic imports бесполезны.

**(!) static-vs-dynamic import конфликт ②** — `html2canvas`:

```
(!) node_modules/html2canvas/dist/html2canvas.esm.js is dynamically imported by:
  - node_modules/jspdf/dist/jspdf.es.min.js
  - views/LeaderPageView.jsx
but also statically imported by:
  - views/BuilderView.jsx
dynamic import will not move module into another chunk.
```

Та же проблема: `BuilderView.jsx` тянет html2canvas статически →
LeaderPageView'ский `await import('html2canvas')` бесполезен. Если
BuilderView станет lazy в Phase 2 — html2canvas сразу выходит из
main и будет lazy-loaded на demand.

### 1.5 Что в main bundle — карта

Проверял через grep уникальных RU-строк из исходников по dist/assets/*.js
(минификация не трогает string literals). Результаты:

| Source | Чип в chunk |
|---|---|
| `App.jsx` | main `index-Doc0vzmv.js` (root) |
| `views/UserApp.jsx` (`'Вернуться в сад'`) | main |
| `views/AdminPanel.jsx` (`'Ошибка загрузки товаров'`) | main |
| `views/AdminPvlProgress.jsx` (`'Не удалось загрузить данные.'`) | main |
| `views/BuilderView.jsx` (`'Генерация PDF...'`) | main |
| `views/MeetingsView.jsx` (`'Сделать общее фото'`) | main |
| `views/MarketView.jsx` (`'Написать в Telegram'`) | main |
| `views/CommunicationsView.jsx` (`'Ошибка отправки'`) | main |
| `views/LeaderPageView.jsx` (`'Карточка отзыва скачана'`) | main |
| `views/CourseLibraryView.jsx` | **CourseLibraryView-Dm0rVahl.js** (lazy через `UserApp`) |
| `views/PvlPrototypeApp.jsx` + Pvl*.jsx | **PvlPrototypeApp-B9SASNUk.js** (lazy через `CourseLibraryView`) |

| Heavy dep | Chip в chunk |
|---|---|
| `jsPDF` (8 marker matches), Helvetica (3) | main |
| `html2canvas` (2 matches) | main (статически из BuilderView) |
| `DOMPurify` (1 match) | main |
| `react-dom` | main |
| `lucide-react` | main (но иконки tree-shaken до использованных) |
| `JSZip` | **НЕ в main** — `await import('jszip')` в `utils/pvlHomeworkReport.js:503` ✅ уже lazy |
| `@supabase/supabase-js` | **НЕ в main** — Vite tree-shake; либо нет реального импорта в prod-коде, либо цепочка отрезана |
| `browser-image-compression` | unclear — signature search 0 matches, возможно lazy либо не используется в prod-коде |

### 1.6 Lazy split, который УЖЕ есть

Source-level dynamic imports в проекте (`grep -rn "import(" src`):

```
utils/pvlHomeworkReport.js:503    await import('jszip')                    ✅ работает
views/LeaderPageView.jsx:316       await import('html2canvas')             ✗ не работает (BuilderView static)
views/CourseLibraryView.jsx:19     lazy(() => import('./PvlPrototypeApp')) ✅ работает
views/UserApp.jsx:15               lazy(() => import('./CourseLibraryView')) ✅ работает
views/ProfileView.jsx (×3)         await import('../services/dataService') ✗ не работает (12 static)
```

Шаблон, который работает: **React.lazy + статические импортёры
ниже по дереву.** Шаблон, который не работает: **dynamic import +
параллельные статические импорты в других файлах.**

### 1.7 Кандидаты для Phase 2 (по убыванию импакта)

Только информативно — само Phase 2 не делаю.

1. **AdminPanel + AdminPvlProgress** через `React.lazy` на роуте
   admin. Используется только админом (1-2 человека из 60+
   ведущих). Сэкономит большую часть `jspdf` + связанные deps.
2. **BuilderView через lazy** — открывается эпизодически,
   статически тянет html2canvas. Lazy → html2canvas вылетает из
   main как бесплатный бонус (см. warning 1.4).
3. **LeaderPageView через lazy** — тоже эпизодический.
4. **MeetingsView / MarketView / CommunicationsView** — частые,
   но крупные. Lazy выгоден если admin-обвязка сравнительно
   маленькая.

Имеется отдельный план: [`plans/2026-05-09-bundle-optimization.md`](../../plans/2026-05-09-bundle-optimization.md).
В этой сессии его не открываю — это для Phase 2 захода.

---

## 2. CLEAN-014-PVLMOCKAPI-AUDIT

### 2.1 Импорты `pvlMockApi`

```
$ grep -rn "from.*pvlMockApi\|require.*pvlMockApi" --include="*.js" --include="*.jsx" \
  --exclude-dir=node_modules --exclude-dir=dist
```

| File | Line | Import | Тип |
|---|---|---|---|
| `views/PvlPrototypeApp.jsx` | 79 | `from '../services/pvlMockApi'` (намёрнный список ~10 функций) | prod, статический |
| `views/PvlStudentTrackerView.jsx` | 5 | `import { pvlDomainApi, syncPvlActorsFromGarden } from '../services/pvlMockApi'` | prod, статический |
| `views/PvlCalendarBlock.jsx` | 4 | `import { pvlCohortIdsEquivalent, pvlDomainApi } from '../services/pvlMockApi'` | prod, статический |
| `views/PvlMenteeCardView.jsx` | 3 | `import { pvlDomainApi } from '../services/pvlMockApi'` | prod, статический |
| `views/PvlSzAssessmentFlow.jsx` | 7 | `import { pvlDomainApi } from '../services/pvlMockApi'` | prod, статический |
| `views/PvlTaskDetailView.jsx` | 2 | `import { pvlDomainApi } from '../services/pvlMockApi'` | prod, статический |
| `views/pvlLibraryMaterialShared.jsx` | 3 | `import { pvlDomainApi } from '../services/pvlMockApi.js'` | prod, статический |

**Итого: 7 prod-импортов из 7 PVL-views.** Ноль `if (DEV)`-guards,
ноль `import.meta.env.DEV`-условий, ноль test-файлов. Это **живой
prod-код**.

Что именно используется:
- `pvlDomainApi` — главный фасад API (все 7 файлов).
- `pvlCohortIdsEquivalent` — equality helper (1 файл).
- `syncPvlActorsFromGarden` — синхронизация (1 файл).
- В `PvlPrototypeApp` — массовый именованный импорт (~10 функций).

### 2.2 Где попадает в bundle

Проверял через RU-строковые маркеры из `services/pvlMockApi.js`
(уникальные тексты типа `'Анкета (ответы по полям)'`,
`'Глоссарий курса'`, `'Дедлайн модуля'`, и т.д.) по
`dist/assets/*.js`:

| Marker | main | PvlPrototypeApp chunk | другие |
|---|---|---|---|
| `'Анкета (ответы по полям)'` | 0 | 1 | 0 |
| `'Бонус ментора'` | 0 | 1 | 0 |
| `'Глоссарий курса'` | 0 | 3 | 0 |
| `'Готовые сценарные заготовки'` | 0 | 1 | 0 |
| `'Границы и экологичность ведения'` | 0 | 1 | 0 |
| `'Дедлайн модуля'` | 0 | 1 | 0 |
| `'Доказательная база'` | 0 | 1 | 0 |
| `'Встреча с ментором'` | 0 | 1 | 0 |

**Все 8 маркеров — только в `PvlPrototypeApp-B9SASNUk.js`.** В main
bundle (`index-Doc0vzmv.js`) — ноль.

То есть Vite уже **не** включает pvlMockApi в main. Импортируется
только через PvlPrototypeApp → попадает в lazy-chunk → грузится
**только когда пользователь открывает курс ПВЛ** (через
CourseLibraryView).

### 2.3 Рекомендация — вариант **C**

**Живой prod-импорт, миграция на pvlPostgrestApi уже идёт (FEAT-016 /
FEAT-017 закрыли часть admin views на реальный API), но **не
завершена**.**

Действия:

- **НЕ удалять** — сломает 7 PVL-views.
- **НЕ выпиливать «just because»** — выгода для main bundle = 0
  (pvlMockApi там нет). Выгода для PvlPrototypeApp-chunk —
  частичная: какая-то часть кода в `pvlMockApi.js` уже не
  используется, но без полного аудита по экспортам unclear,
  сколько именно.
- **Завести** `TECH-DEBT-PVLMOCK-MIGRATE` (P3) — постепенная
  миграция callsites в `pvl*.jsx` views на `pvlPostgrestApi`,
  по аналогии с тем, как `AdminPvlProgress` уже использует
  `pvlPostgrestApi.getAdminProgressSummary` (RPC-агрегатор).

Описание тикета (proposed):

> **TECH-DEBT-PVLMOCK-MIGRATE** (P3) — постепенно перевести
> 7 Pvl-views с `pvlDomainApi`/`pvlMockApi` на
> `pvlPostgrestApi` (реальный backend). Pvl-data сейчас лежит
> и в БД (FEAT-016/017 уже на проде), и в `pvlMockApi.js` как
> shim-фасад с in-memory state. Параллельная пара = source of
> truth размывается, плюс runtime код таскает 4260 строк
> mock-логики в lazy chunk. Подход: один view = одна сессия
> миграции, проверять smoke на проде. После того как все 7
> мигрируют — удалить `pvlMockApi.js` + `data/pvlMockData.js` +
> `data/pvl/seed.js` + `data/pvl/localDemoLessons.js`. Связано:
> `BUG-PVL-COHORT-NULL-OVERWRITE` (closed) — там был фрагмент
> такой миграции для `ensurePvlStudentInDb`.

### 2.4 Бонус — попутные находки

- **`@supabase/supabase-js` вообще не попадает в bundle.** Vite
  его tree-shake'нул целиком. Это означает либо **нет ни одного
  `import` из `@supabase`** в `services/dataService.js` или
  где-то ещё (только `package.json`-зависимость, не используется
  в prod коде); либо есть, но цепочка обрывается. Стоит
  проверить — **CLEAN-006-SUPABASE-DEAD-DEP** кандидат: если
  пакет действительно мёртв, удаляется из `dependencies` →
  меньше `node_modules`, чище npm install в CI. Не делаю в этом
  заходе (read-only).
- **`browser-image-compression`** — тоже без следа в chunks. Либо
  lazy, либо мёртв. То же предложение для отдельной проверки.
- **ProfileView dynamic import dataService** — реально не работает
  (warning ①). Это **smell** — кто-то когда-то пытался
  оптимизировать, но не достиг эффекта. Можно убрать `await
  import` обратно на статический, чтобы Vite не выводил warning.
  Не блокер, но красная нота. Не в этом заходе.

---

## 3. Открытые вопросы

1. **`@supabase/supabase-js` мёртв?** Я не делал глубокий grep по
   `from '@supabase'` — нужен в Phase 2 заходе или отдельный
   tiny-recon.
2. **Эффект Phase 2 lazy(AdminPanel) на main bundle** — без
   замера невозможно сказать точно. Но `jspdf` (8 markers в main)
   используется именно в admin-flow (генерация PDF-отчётов). Если
   AdminPanel станет lazy и при этом `jspdf` тоже только
   admin-only — он вылетит из main. Гипотеза: эффект на main =
   100-200 KB raw / 60-100 KB gzip. Проверить надо после
   реального split'а.
3. **`html2canvas` через BuilderView** — ловится автоматически
   при lazy(BuilderView). Тут гипотеза твёрже: html2canvas в main
   только из-за BuilderView static import (warning ② подтверждает).
4. **PvlPrototypeApp 518 KB raw / 130 KB gzip** — крупный
   lazy-chunk. Если хочется его оптимизировать — выпиливание
   pvlMockApi даст некоторую экономию (после миграции на
   pvlPostgrestApi). Это TECH-DEBT-PVLMOCK-MIGRATE, не блокер.

---

## 4. git status (post-recon)

Стратег попросил clean. Не идеально, но не наследил кодом:

```
$ git status --short | head -10
 M .claude/settings.json
 M .claude/settings.local.json
 M CLAUDE.md
 M dist/index.html       ← обновлён rebuild'ом
 M dist/sw.js            ← обновлён rebuild'ом
 ...
 M push-server/README.md
 M push-server/server.mjs
?? README.md
?? dist/.htaccess
?? dist/assets/CourseLibraryView-Dm0rVahl.js   ← новый bundle hash
?? dist/assets/PvlPrototypeApp-B9SASNUk.js     ← новый bundle hash
?? dist/assets/index-Doc0vzmv.js               ← новый main hash
... (66 files changed)
```

`dist/` обновлён локально из-за сборки в задаче 1.1 — это
ожидаемый side-effect задачи. Остальные М/?? были до сессии (не
от меня) — это репо-state, не результат сегодняшнего захода.

**Если хочешь репу строго clean** — `git checkout dist/` восстановит
содержимое с push'а 9025933 (это один из вариантов; альтернатива
— оставить как есть, всё равно `dist/` пересобирается на CI при
каждом push'е).

Сам кодовую базу (services/, views/, utils/, etc) **не трогал**.

---

## 5. Что готово к Phase 2

После твоей оценки `_08`:
- baseline зафиксирован (1.34 MB main / 394 KB gzip).
- кандидаты для lazy ясны (AdminPanel + Admin* первый, потом
  BuilderView для бесплатного html2canvas-выноса).
- pvlMockApi не в main — не трогаем в bundle-фазах.
- TECH-DEBT-PVLMOCK-MIGRATE кладу в backlog ожиданием твоего
  go-ahead.

Жду `_09` с планом Phase 2.
