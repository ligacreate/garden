# FEAT-016 — apply-отчёт (per-student MD-отчёт + bulk ZIP)

**Адресат:** стратег (claude.ai).
**Автор:** VS Code Claude Code (executor).
**Создано:** 2026-05-09.
**Источник:** план [`2026-05-08_29_codeexec_feat016_plan.md`](2026-05-08_29_codeexec_feat016_plan.md)
+ 🟢 в [`2026-05-08_30_strategist_feat016_apply_and_shop_push.md`](2026-05-08_30_strategist_feat016_apply_and_shop_push.md).

## Что сделано

### Новые файлы

- **[`utils/pvlHomeworkReport.js`](../../utils/pvlHomeworkReport.js)** (~370 строк)
  - `buildStudentMarkdownReport({...})` — главная сборка MD по одной
    студентке × модулю / всем модулям.
  - `safeFileName(text)` — нормализация ФИО (кириллица сохранена,
    запрещённые символы выкинуты).
  - `STATUS_ICONS` / `STATUS_LABELS` для нормализованных статусов
    (`pending_review`, `revision_requested`, `accepted`, `draft`,
    `rejected`, плюс синтетический `not_submitted`).
  - `buildQuestionnaireMap(homeworkItem, contentItemsById)` —
    маппит `qb-<id>` → текст вопроса через `homework_config.questionnaireBlocks`.
    Поддерживает `external_key` в форматах `task-ci-<id>` и `<content_item.id>`.
  - `downloadAsMarkdownFile(filename, content)` — браузерный blob → `<a download>`.
  - `downloadAsZipFile(filename, files)` — **lazy-import** `jszip`
    (не раздувает initial bundle).
  - `groupBySubmissionId(historyRows)` — для bulk-режима.

### Правки

- **[`services/pvlPostgrestApi.js`](../../services/pvlPostgrestApi.js)** —
  добавлен `listHomeworkStatusHistoryBulk(submissionIds, chunkSize=100)`.
  PostgREST `in.(...)` с защитой от 414 URI Too Long через чанки.
  Нормализация `from_status`/`to_status` идентична singleton-методу.
- **[`views/AdminPvlProgress.jsx`](../../views/AdminPvlProgress.jsx)** —
  - imports: `FileText`, `Download`, `Loader2`, `ChevronDown`,
    `useRef`, `api` из dataService, утилит из pvlHomeworkReport.
  - новые inline-компоненты `ReportDownloadButton` (per-row, dropdown
    «Модуль 0 / 1 / … / Все модули») и `BulkExportButton`
    (header, ZIP по `visibleRows`).
  - useEffect для одноразовой загрузки `homeworkItems` /
    `contentItems` / `weeks` / `mentorsById` (через `api.getUsers()`,
    решение **B** по 5.1).
  - 11-я колонка `__actions` (sortable: false) — в thead невидимый
    placeholder, в tbody — кнопка-иконка 📄.
  - между header'ом и таблицей — bulk-кнопка справа + плашка
    `reportError` с кнопкой «скрыть».
  - `useOutsideClick`-helper для закрытия dropdown'ов.
- **[`package.json`](../../package.json)** — `jszip ^3.10.1`.

### Решения по плану (5.x, 6)

| # | Вопрос | Реализовано |
|---|---|---|
| 5.1 | mentor_name в комментариях | **B** — `api.getUsers()` → `Map<id, name>`; fallback на `student.mentor_name` если нет |
| 5.2 | период модуля | min(starts_at) / max(ends_at) по weeks с `module_number === N` |
| 5.3 | cancel button для bulk | **Не делал** (по 🟢) — только индикатор `Готовлю архив… K/N` |
| 5.4 | bulk = ZIP | да |
| 5.6 | sort_order ДЗ | сортировка `module_number ASC, sort_order ASC` |
| 5.7 | control_points / certification_tasks | **исключены** (`item_type === 'homework' && !is_control_point`) — консистентно с phase 25 RPC |
| 6   | bulk ZIP в этот заход | **да**, включён |

### Структура MD-шаблона (как в плане)

- Заголовок: ФИО — Модуль N / Все модули.
- Шапка: курс, ментор, период, дата генерации.
- На модуль — секции по ДЗ в порядке `sort_order`:
  - `## ДЗ {sort_order}: «{title}»`
  - `**Статус:** ✅/⏳/🔄/📝/❌ {label}{` · {score}/{max} баллов` if accepted}`
  - `**Сдано:** {dd.MM.yyyy} · **Принято:** {dd.MM.yyyy}{ · Ревизий: N if > 0}`
  - `### Ответ` — questionnaire по `qb-id ↔ question` или free-form `textContent`.
  - `### Комментарии ментора` — все `mentor_review` из `payload.thread`,
    с именем (через `mentorsById`), датой, опционально вердиктом
    (`принято / на доработку / отклонено`).
- Edge-кейсы:
  - нет submission'а → `**Статус:** ❌ Не сдано`, без блоков «Ответ» / «Комментарии».
  - пустые ответы → `_(пусто)_`.
  - нет mentor_review в треде → секция «Комментарии ментора» опущена.

### Mock-mode

Кнопки скрыты (`pvlPostgrestApi.isEnabled?.()` гард в JSX): без БД
функционал не показывается, ошибки нет.

## Verify

- **`npx vite build`** прошёл без ошибок (3.53s, warnings те же что и
  до правок про chunk-size).
- **Локальный preview** — `.env.local` отсутствует, dev-сервер вернул
  «PVL DB disabled» (нормально для локалки без прод-URL). Ольга 🟢
  выбрала **«запушить и смокать на проде»** — preview-сценариев на
  локалке не выполнялось.

## Smoke-чеклист после push (на проде)

После Cmd+Shift+R на FEAT-017 / Прогресс ПВЛ:

- [ ] В строке любой студентки справа появилась иконка 📄.
- [ ] Клик → выпадающее меню «Модуль 0 / 1 / 2 / 3 / Все модули».
- [ ] «Модуль 1» → скачивается `Имя_Фамилия_Модуль_1_2026-05-09.md`
      → корректный markdown в Obsidian (статусы, ответы, комменты).
- [ ] «Все модули» → один MD с разделами по модулям.
- [ ] Над таблицей справа — кнопка «Скачать архив за модуль…»;
      клик → dropdown по модулям → ZIP с N .md (по `visibleRows`).
- [ ] Edge-кейс: «не сдано» → пометка в MD, без блока «Ответ».
- [ ] Edge-кейс: textContent (free-form) → один блок plain-text.
- [ ] Edge-кейс: revision-цикл → «Ревизий: N» + 2 mentor_review в треде.

Если что-то отвалится — фиксим follow-up коммитом по корневой причине
(не патчим симптомы; правим в утилите / API).

## Коммит

```
feat: FEAT-016 — per-student MD-отчёт + bulk ZIP за модуль

Дашборд «Прогресс ПВЛ»:
- кнопка «📄 Отчёт» в строке студентки → dropdown по модулям
  + «Все модули» → скачивание .md файла.
- кнопка «Скачать архив за модуль…» в Header → dropdown →
  ZIP с N .md файлами по visibleRows (учитывает hidden + state
  фильтры).

Markdown:
- структура по homework_items в порядке module_number, sort_order
- ответы студентки (answersJson или textContent) → plainText
- комментарии менторов из payload.thread (mentor_review)
- статусы с иконками, периоды модулей из pvl_course_weeks
- mentor_name резолвится через api.getUsers() для точности
- control_points / certification_tasks исключены
  (консистентно с phase 25 RPC pvl_admin_progress_summary)

Технически:
- новый utils/pvlHomeworkReport.js (~370 строк)
- batch-метод listHomeworkStatusHistoryBulk в pvlPostgrestApi
- jszip dep, lazy-import (не раздувает initial bundle)

Ольга: «один раз сделали — на всех модулях курса автоматически».
Dropdown подтягивает доступные модули из homework_items.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```
