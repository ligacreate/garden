# BUG-PVL-ADMIN-HW-HTML-RAW-RENDER — recon отчёт

**От:** codeexec (VS Code)
**Кому:** Ольга → стратегу
**Дата:** 2026-05-20 поздний вечер
**В ответ на:** [_90](2026-05-20_90_strategist_pvl_hw_html_render_recon.md)
**Статус:** Read-only, ничего не правил/не коммитил/не пушил/не апдейтил БД.

---

## TL;DR

Главный prompt ДЗ хранится в `pvl_content_items.homework_config->>'prompt'`
(JSONB), сохраняется через **RichEditor** (с DOMPurify-санитайзером) и
рендерится у студентки через `dangerouslySetInnerHTML` —
этот pipeline **OK**. Данные в БД сейчас чистые.

Но в файлах `pvlChecklistShared.jsx` и `pvlQuestionnaireShared.jsx`
есть **7 мест**, где админ-введённые поля (`item.prompt`, `b.question`,
`b.label`, `questionnaireDescription`) рендерятся через React
text-node `{value}` (без `dangerouslySetInnerHTML` и без plain-text
конверсии). Если админ вставит туда HTML-теги — React автоэкранирует
`<` → `&lt;` и студентка увидит **`<p>`, `<strong>` как литерал**.

Это **точно** соответствует скриншоту в брифе.

---

## 1. Save-path

### Где админ редактирует
- `views/PvlPrototypeApp.jsx:4733` — `<RichEditor ... value={hw.prompt}>`
  внутри LessonHomeworkEditor (видна когда `lessonKind === 'homework'`).
- `views/PvlPrototypeApp.jsx:6629` — тот же `RichEditor` через
  `lessonHomework` пропсу в draft (создание нового материала).
- Аналогично [PvlPrototypeApp.jsx:5617](../views/PvlPrototypeApp.jsx#L5617)
  — edit-форма.

### Endpoint и таблица
- API: `pvlPostgrestApi.updateContentItem(contentId, payload)`
  ([services/pvlPostgrestApi.js:215](../services/pvlPostgrestApi.js#L215))
  → `PATCH /pvl_content_items?id=eq.<uuid>`
- Таблица: **`pvl_content_items`** (PostgreSQL), колонка **`homework_config`** (jsonb).
- Mapping JS→DB: `homework_config: item.lessonHomework`
  ([services/pvlMockApi.js:413](../services/pvlMockApi.js#L413))
- Mapping DB→JS: `lessonHomework: row.homework_config`
  ([services/pvlMockApi.js:456](../services/pvlMockApi.js#L456))

### Sanitize при save
- `normalizeLessonHomework(editForm.lessonHomework)` запускается в
  payload-builder ([PvlPrototypeApp.jsx:5005](../views/PvlPrototypeApp.jsx#L5005)).
- Внутри: `prompt: sanitizeHomeworkAnswerHtml(String(src.prompt || ''))`
  ([PvlPrototypeApp.jsx:4613](../views/PvlPrototypeApp.jsx#L4613)) →
  `stripMsOfficeHtmlNoise` + DOMPurify ([utils/pvlHomeworkAnswerRichText.js:31](../utils/pvlHomeworkAnswerRichText.js#L31)).
- Главное поле `prompt` идёт через тот же pipeline, что и
  `BUG-HOMEWORK-PASTE-MSO` fix (commit `90e0987`).

### НО: побочные поля анкеты/чек-листа НЕ проходят отдельный sanitize
- `questionnaireBlocks[i].question` — `String(...).trim()` без DOMPurify
  ([PvlPrototypeApp.jsx:4798-4807](../views/PvlPrototypeApp.jsx#L4798)) —
  просто читается из `<input>`-текста.
- `checklistSections[i].items[j].prompt` — то же самое
  (определяется в DEFAULT_REFLEX_CHECKLIST_SECTIONS и в админ-edit).
- `questionnaireDescription` — `<textarea>`, голый текст.

Это **источник заражения**: если админ вставит HTML-разметку
(например, скопировав «вопрос» из своих заметок в Notion/Word/
обычного текстового редактора, где она хранится **как plain text c
HTML-тегами внутри**), теги попадают в эти поля как plain string.

## 2. Render-path

### Главный prompt (OK)
- `views/PvlTaskDetailView.jsx:468-510` — `TaskDescription`:
  - tracker: `dangerouslySetInnerHTML={{ __html: normalizeMaterialHtml(...) }}`
    ([PvlTaskDetailView.jsx:485](../views/PvlTaskDetailView.jsx#L485))
  - default: `dangerouslySetInnerHTML={{ __html: sanitizeHomeworkAnswerHtml(...) }}`
    ([PvlTaskDetailView.jsx:503](../views/PvlTaskDetailView.jsx#L503))
- `views/pvlLibraryMaterialShared.jsx:619-623` —
  `dangerouslySetInnerHTML={{ __html: normalizeMaterialHtml(selectedItem.lessonHomework.prompt) }}`.

Тут HTML рендерится правильно (через DOMPurify-санитайз внутри
`normalizeMaterialHtml`/`sanitizeHomeworkAnswerHtml`).

### Внутренние поля анкеты/чек-листа (BUG)

| # | File:line | Поле | Способ рендера | Будет с HTML |
|---|---|---|---|---|
| 1 | [pvlChecklistShared.jsx:16](../views/pvlChecklistShared.jsx#L16) | `item.prompt` (заполнение чек-листа) | `<span>{item.prompt}</span>` | литерал `<p>` |
| 2 | [pvlChecklistShared.jsx:45](../views/pvlChecklistShared.jsx#L45) | `item.prompt` (readonly) | `<span>{item.prompt}</span>` | литерал `<p>` |
| 3 | [pvlQuestionnaireShared.jsx:19](../views/pvlQuestionnaireShared.jsx#L19) | `questionnaireDescription` | `<p>{questionnaireDescription}</p>` (whitespace-pre-wrap) | литерал `<p>` |
| 4 | [pvlQuestionnaireShared.jsx:28](../views/pvlQuestionnaireShared.jsx#L28) | `b.question` (заполнение анкеты) | `{b.question}` | литерал `<p>` |
| 5 | [pvlQuestionnaireShared.jsx:63](../views/pvlQuestionnaireShared.jsx#L63) | `b.label` (short_text legacy) | `{b.label}` | литерал |
| 6 | [pvlQuestionnaireShared.jsx:81](../views/pvlQuestionnaireShared.jsx#L81) | `b.label` (long_text legacy) | `{b.label}` | литерал |
| 7 | [pvlQuestionnaireShared.jsx:191](../views/pvlQuestionnaireShared.jsx#L191) | `questionnaireDescription` (readonly) | `{questionnaireDescription}` | литерал |
| 8 | [pvlQuestionnaireShared.jsx:202](../views/pvlQuestionnaireShared.jsx#L202) | `b.question` (readonly) | `{b.question}` | литерал |
| 9 | [pvlQuestionnaireShared.jsx:233](../views/pvlQuestionnaireShared.jsx#L233) | `b.label` (legacy readonly) | `{b.label}` | литерал |

React text-node автоматически экранирует `<` → `&lt;` → браузер
показывает `&lt;p&gt;` как **видимый текст** `<p>`. Это ровно то, что
в скриншоте.

## 3. Rich-text editor

- Один редактор: `components/RichEditor.jsx` (516 LOC, кастомный
  contentEditable + DOMPurify-style allowlist).
- `getOutput`: возвращает `editorRef.current.innerHTML` (HTML).
- `paste`: `clipboardData.getData('text/html')` → `sanitizeIncomingHtml`
  (whitelist + style→semantic conversion). Если HTML пустой —
  `clipboardData.getData('text/plain')` → пробует Markdown (`marked`)
  → `plainTextToStructuredHtml` (escapeHtml + структурирование).
- Используется в **6 контекстах** (новости, материалы библиотеки,
  сценарии лиги, главный prompt ДЗ, ответ менти, комментарии ментора).
- В админ-форме ДЗ **только** главный `prompt` идёт через RichEditor.
  Поля `b.question`, `item.prompt`, `questionnaireDescription` —
  **обычные `<input>` / `<textarea>`** ([PvlPrototypeApp.jsx:4798-4807](../views/PvlPrototypeApp.jsx#L4798)).

Связь с `BUG-HOMEWORK-PASTE-MSO`/`commit 90e0987`/`lesson 2026-05-04`:
- Тот fix покрыл `stripMsOfficeHtmlNoise` + DOMPurify для **HTML-полей**
  через RichEditor.
- **Не покрывает** plain `<input>` / `<textarea>` поля админ-формы,
  где админ может ввести/вставить HTML руками — это **другой path**.

## 4. Данные в БД

`SELECT id, title, length(homework_config->>'prompt')…`
([полная команда — fingerprint в задаче](#))
по 7 строкам `pvl_content_items` с непустым `homework_config`:

| id (head) | title | obsolete-фактор | `<pre>` start | `&lt;` |
|---|---|---|---|---|
| `316effbd` | «Дизайн и архитектура встречи» (2026-05-20 13:11) | clean `<p><strong>` | f | f |
| `f4817b38` | «Безопасное пространство» (2026-05-18) | wrapped in `<pre>...</pre><br>` | **t** | f |
| `74a43721` | «Из чего состоит практика» (2026-05-18) | clean `<p><b>` | f | f |
| `a1bb1513`, `5454a038`, `93f0e5b5` | (Рефлексия / Ведущая / Научные основы) | пустой prompt | — | — |
| `8c3468cc` | «Чек-лист ДЗ к уроку…Научные основы…» | пустой prompt, 14 q-блоков, чистые questions | — | — |

Главное:
- **Сейчас в БД prompt'ы либо чистые `<p>...`, либо пустые** (после
  Obsidian-workaround'а админа).
- **Один реликт**: `f4817b38` имеет `<pre>...plain text...</pre>` —
  это попадает в branch `normalizeMaterialHtml` для `<pre>`-разметки
  ([pvlLibraryMaterialShared.jsx:152-161](../views/pvlLibraryMaterialShared.jsx#L152)),
  рендерится как `pvl-doc-verbatim` (whitespace-pre). Для **этого**
  prompt'а — без бага, но это маркер: ранее туда **уезжал** plain
  text вместо HTML.
- Все 14 `qa_pair` вопросов в `8c3468cc` сейчас — чистые
  («Дата», «Ведущая», «Тема встречи», …), **без HTML-тегов**.
- Не нашёл ни одной записи с `<a-z` в `b.question`, `item.prompt`
  или в `questionnaireDescription` — **админ уже всё «починила»**
  через Obsidian.

Запросы (read-only, без UPDATE):
```sql
-- Все hw prompt'ы (короткий вид):
SELECT id, title, updated_at::date, length(homework_config->>'prompt') AS plen,
       (homework_config->>'prompt') ~ '^<pre' AS starts_pre,
       (homework_config->>'prompt') ~ '&lt;' AS has_escaped_lt
  FROM pvl_content_items
 WHERE homework_config IS NOT NULL
 ORDER BY updated_at DESC;

-- Тегированные questions/items (на момент recon — 0 rows):
SELECT id, title, substring(b->>'question', 1, 200)
  FROM pvl_content_items, jsonb_array_elements(homework_config->'questionnaireBlocks') b
 WHERE (b->>'question') ~ '<[a-z]';
```

## 5. Гипотеза причины (ranged)

### A. **Главная (P0)** — текст-render полей анкеты/чек-листа
Админ вставляет содержимое (с HTML-тегами в clipboard как **plain
text**, не как `text/html`) в одно из 9 уязвимых полей. React
рендерит как text-node → литерал `<p>`. **Это объясняет скриншот
1:1.**

Pre-условие: clipboard источника отдаёт **только** `text/plain` с
HTML-сырьём (Obsidian preview, открытый `.md` файл в текстовом
просмотрщике, «view source» в браузере, экспорт Telegram-канала и
т.п.).

Status в БД: **обнулено** Obsidian-workaround'ом, но дыра в коде
осталась — повторится при следующей вставке.

### B. **Гипотеза `<pre>`-wrap (P2)** — артефакт RichEditor
`f4817b38` хранит `<pre>...plain text...</pre><br>` — это путь
**сохранения**, не render-баг. Скорее всего: админ сделала Ctrl+A →
Ctrl+C в редакторе кода/Markdown preview, paste в RichEditor,
RichEditor пометил блок как `<pre>` (или `marked.parse` вернул `<pre>`
для кодоподобного контента в `tryMarkdownClipboardToHtml`).
Не даёт ровно бага скриншота, но косвенно подтверждает «вставка из
сырого источника» как источник.

### C. **Гипотеза двойной экранизации (P3)** — отвергнуто
Если бы в БД были `&lt;p&gt;`, `normalizeMaterialHtml` через
`escapeHtml` сделал бы `&amp;lt;p&amp;gt;`, и **браузер показал бы
`&lt;p&gt;`** (с амперсандом), а не `<p>`. Не наш случай.

## 6. Место fix'a (короткий список приоритетов)

### P0 — закрыть дыру рендера в анкете/чек-листе
Везде, где сейчас `{x.prompt}` / `{b.question}` / `{b.label}` /
`{questionnaireDescription}` — три опции:

**Опция 1 (минимум)**: text-only fallback —
оставить React text-node, но **в save-pipeline** прогонять эти поля
через `homeworkAnswerPlainText` (strip-tags, см.
[utils/pvlHomeworkAnswerRichText.js:37](../utils/pvlHomeworkAnswerRichText.js#L37)).
Минусы: ломает существующие чистые `<input>`-значения, требует
backfill (но в БД сейчас всё чистое, backfill пустой).

**Опция 2 (рекомендованная)**: HTML-аware render —
заменить `{x.prompt}` → `<span dangerouslySetInnerHTML={{ __html:
sanitizeHomeworkAnswerHtml(x.prompt) }} />` во всех 9 точках. Тогда
HTML рендерится корректно (как в главном prompt'е), и админ может
осознанно использовать `<strong>` / `<em>` в вопросах. DOMPurify
уже подключён.

**Опция 3 (макс)**: апгрейд админ-формы — заменить `<input>` для
`b.question` и `item.prompt` на `<RichEditor variant="student">`
(минимальная панель — bold/italic). Это закрывает баг **в корне**:
данные хранятся как корректный HTML, render через DOMPurify.
Дороже, но логично.

### P1 — `<pre>`-санитайз
В `RichEditor.handlePaste` / `sanitizeIncomingHtml` добавить
**unwrap `<pre>` → `<p>` per-line** для случаев, когда `<pre>`
оборачивает обычный текст (определять по отсутствию явных
литералов `<` или по контенту). Это закроет регресс
`f4817b38`-типа.

### P0 file:function для P0
- [views/pvlChecklistShared.jsx](../views/pvlChecklistShared.jsx) →
  `ChecklistFieldsEditor` (line 16), `ChecklistAnswersReadonly` (line 45)
- [views/pvlQuestionnaireShared.jsx](../views/pvlQuestionnaireShared.jsx) →
  `QuestionnaireFieldsEditor` (lines 19, 28, 63, 81),
  `QuestionnaireAnswersReadonly` (lines 191, 202, 233)

## 7. Effort estimate

- **Опция 2 (P0)** — заменить 9 text-node на dangerouslySetInnerHTML
  с `sanitizeHomeworkAnswerHtml`: **~20 мин кода + 10 мин smoke**.
  Без миграции, без backfill, обратной совместимостью.
- **Опция 1** — добавить strip-tags в save-pipeline: **~30 мин** +
  риск (нужно сначала проверить, что в БД точно нет ожидаемых HTML
  в этих полях; сейчас — 0 строк, безопасно).
- **Опция 3** — RichEditor для коротких полей: **~2 часа** (UI
  адаптация под inline-режим, проверка height-clipping в карточках).
- **P1 (`<pre>`-unwrap)** — **~30 мин**.

Рекомендация: **Опция 2 как hotfix** (20 мин, нулевой риск), потом
отдельным тикетом P2 рассмотреть Опцию 3 для админ UX.

## 8. Open questions для стратега

1. **Какую опцию выбираем для P0?** Если Опцию 2 — админ может
   использовать `<strong>` в вопросах анкеты (это feature или bug?).
2. **Заводим ли отдельный тикет `BUG-PVL-WHITESPACE-CORRUPTION` и
   `BUG-PVL-SLOW-MATERIALS-LOAD` параллельно** (как в брифе) — да?
   Если да — могу заодно сам в backlog добавить (read-only текущий
   recon → завтра отдельным batch).
3. **Связь с уроком `2026-05-04-dompurify-keep-content-leaks-style-text`**
   — нужно ли продлевать тот lesson (расширить scope на не-RichEditor
   поля админ-формы) или завести новый lesson после fix'а?
4. **`f4817b38` (P1, `<pre>`-wrap)** — чинить вместе или отдельным
   PR? Сейчас prompt этого ДЗ всё-таки **читаем** студенткой (через
   verbatim-divs), просто без форматирования. Не критично.

## 9. Что НЕ сделано (как и просил бриф)

- Никаких UPDATE/DELETE в БД.
- Никаких правок в коде.
- Главное `316effbd` `prompt` не публикую целиком — только preview
  до 200 символов в таблицах (есть 10 шагов, чистая HTML).
- Не пушил, не комитил, не апплаил.
