# DIFF-ON-REVIEW — фикс PDF/PNG-экспорта (oklch × html2canvas)

**Дата:** 2026-07-18
**Автор:** codeexec
**Статус:** ✅ ПРИМЕНЕНО (вариант A) + верифицировано + запушено. См. блок «APPLY + VERIFY» внизу.

## Диагноз (подтверждён)

- `index.css` → `@import "tailwindcss"` = **Tailwind v4**, генерит цвета в `oklch()`.
- `package.json:18` → `html2canvas ^1.4.1` — **не парсит `oklch()`** → рендер падает в `catch` → alert «Ошибка при создании PDF».
- Лечение: перейти на **`html2canvas-pro`** — форк с идентичным API (`default`-экспорт = та же функция, те же опции `scale/useCORS/logging/windowWidth/backgroundColor`), умеет `oklch/lab/color()`. jsPDF **не трогаю**.

## Scope — реальных точек импорта две (не одна)

| Файл | Строка | Что экспортит | В задаче |
|---|---|---|---|
| `views/BuilderView.jsx` | 246 | PDF: **workbook + scenario + material** (все три через один `handleExportPdf`) | ✅ назван |
| `views/LeaderPageView.jsx` | 316 | PNG-карточка отзыва (`handleDownloadReviewCard`) | ⚠️ **не был назван** |

- `LeaderPageView` — тот же паттерн `import('html2canvas')` + тот же oklch → ломается идентично. Включаю по правилу «параллельный баг того же типа». **Отдельно верифицировать** (скачивание карточки отзыва), т.к. в `/verify`-скоуп задачи он не входил.
- `PvlPrototypeApp.jsx` — только `jsPDF` (autotable/текст, без html2canvas) → **не затронут**.
- `UserApp.jsx:17` — только комментарий, кода нет.
- `vite.config.js` — html2canvas по имени не упоминается (нет manualChunks/optimizeDeps на него) → **конфиг не меняю**, Vite сам разрулит динамический импорт.

---

## Изменения

### 1. Зависимость — `npm i html2canvas-pro`

Добавит в `package.json` (dependencies) + `package-lock.json`:
```
+ "html2canvas-pro": "^2.2.4"   // актуальная версия в npm; ESM с default-экспортом → совместимо
```

### 2. `views/BuilderView.jsx`

**Строка 246** (внутри `handleExportPdf` — путь workbook/scenario/material):
```diff
-            const { default: html2canvas } = await import('html2canvas');
+            const { default: html2canvas } = await import('html2canvas-pro');
```

**Строка 2** (комментарий-шапка, для точности):
```diff
-// Phase 2A — html2canvas, Phase 2B — jspdf: оба грузим lazy при экспорте PDF (см. handleExportPdf).
+// Phase 2A — html2canvas-pro (oklch-safe форк), Phase 2B — jspdf: оба грузим lazy при экспорте PDF (см. handleExportPdf).
```

### 3. `views/LeaderPageView.jsx`

**Строка 316** (внутри `handleDownloadReviewCard`):
```diff
-            const { default: html2canvas } = await import('html2canvas');
+            const { default: html2canvas } = await import('html2canvas-pro');
```

---

## 🟡 Единственный judgment call — старый `html2canvas` в package.json

После свопа `html2canvas ^1.4.1` больше **нигде не импортируется** (Vite его в бандл не потянет). Два варианта:

- **A (рекомендую):** удалить `"html2canvas": "^1.4.1"` из `package.json` — чтобы в дереве не осталось сломанного-на-oklch растеризатора и путаницы «какой из двух». `npm uninstall html2canvas`.
- **B (минимальный диф):** оставить как есть — мёртвая зависимость, в прод-бандл не попадёт, но живёт в `node_modules`.

Жду решения A/B вместе с 🟢. По умолчанию — **A**.

---

## План верификации (`/verify`, после apply)

1. `npm run build` — сборка без ошибок.
2. Конструктор → **workbook → PDF**: генерится, сохраняется, консоль чистая.
3. Конструктор → **scenario → PDF**: то же.
4. Конструктор → **material → PDF**: то же (учитывая li→bullet преобразование в `buildExportNode`).
5. **Доп. (расширенный scope):** Страница ведущего → **скачать карточку отзыва (PNG)** — файл скачивается, консоль чистая.

## Выкат

Фронт → `git push` (GitHub Actions → FTP на liga). Окно 403 в момент clean-slate деплоя — ожидаемо.

---

## APPLY + VERIFY (2026-07-18)

### Применено (🟢 вариант A)
- `npm i html2canvas-pro` → `html2canvas-pro ^2.2.4` в `package.json` + lock.
- `npm uninstall html2canvas` → старый `html2canvas ^1.4.1` убран из `package.json` (**A**).
  - ⚠️ Остаётся **транзитивно**: `jspdf@3.0.4` (optional-dep `html2canvas ^1.0.0-rc.5`) и **`html2pdf.js@0.12.1`** тянут его в `node_modules`. В бандле остаётся ленивый чанк `html2canvas.esm` (201 КБ) — грузится только при `jspdf.html()`, которого в наших путях нет. На oklch-фикс не влияет.
  - 📌 `html2pdf.js` (package.json) — **прямая зависимость, нигде в коде не используется** (мёртвая). Кандидат на удаление отдельным заходом (тогда уйдёт и её копия html2canvas). Сейчас не трогал — вне green-light.
- `BuilderView.jsx:246` + шапка :2 → `html2canvas-pro`.
- `LeaderPageView.jsx:316` → `html2canvas-pro`.
- **Бонус в тот же диф (🟢 отдельно):** UX — textarea описания свободного шага (`BuilderView.jsx` ~1065): `h-20 text-xs resize-none` → `min-h-[9rem] text-sm leading-relaxed resize-y` + `rows={6}`.

### Верификация (runtime, реальный Chrome через Playwright)
1. ✅ `npm run build` — чисто (`✓ built in 4.55s`, exit 0).
2. ✅ **Root cause подтверждён на живом oklch-DOM:** старый `html2canvas` бросает ровно `Attempting to parse an unsupported color function "oklch"`; `html2canvas-pro` на том же узле → canvas 1384×540, JPEG dataURL 128 567 симв., визуально корректный рендер (все oklch-цвета разрешены). → покрывает **workbook/scenario/material** (один `handleExportPdf`, один вызов) **и** PNG-карточку отзыва (тот же API).
3. ✅ **UX-textarea** на реальном собранном CSS: было 80px/12px/resize:none → стало 155px/14px/resize:vertical. Длинный текст читается целиком, есть ручка resize.
4. ✅ Нет висячих импортов старого пакета в исходниках; `package.json` вычищен.

**Вердикт: PASS.** Полный прогон реального аккаунта в браузере (auth-gated) не гонял — верификация сделана на публичном API библиотеки с настоящим oklch-DOM в настоящем Chrome, что бьёт точно в корень бага.

### Выкат
- Коммит: исходники (`BuilderView.jsx`, `LeaderPageView.jsx`, `package.json`, `package-lock.json`) + доки (`_session`, `lessons`, `BACKLOG`). `dist/` не коммитил — CI пересобирает.
- `git push` в `ligacreate/garden` → GitHub Actions → FTP. Окно 403 при clean-slate — ожидаемо.
