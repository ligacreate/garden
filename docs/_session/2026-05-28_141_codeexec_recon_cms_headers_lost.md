# Recon — заголовки в ПВЛ-материалах не рендерятся как заголовки

**Дата:** 2026-05-28
**Тип:** recon, read-only, без apply
**Симптом:** В библиотеке курса ПВЛ материал «Драматургия встречи — динамика, ритм, разнообразие» содержит строки, которые должны быть заголовками («Принцип первый. Динамика», «Принцип второй...»), но рендерятся как обычный текст. Жалоба админа: ни через file upload, ни через ручной ввод в редакторе.

---

## 1. Как хранится контент

### Схема [database/pvl/migrations/002_pvl_runtime_content.sql:6-46](database/pvl/migrations/002_pvl_runtime_content.sql#L6-L46)

```sql
CREATE TABLE pvl_content_items (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  short_description TEXT,
  body_html TEXT,            ← поле с телом материала
  content_type TEXT NOT NULL DEFAULT 'text',  -- video|text|pdf|checklist|template|link|audio|fileBundle
  target_section TEXT NOT NULL,
  ...
)
```

- **Формат хранения только один: HTML в `body_html`.** Нет полей `body_markdown`, `body_plain`, нет дискриминатора формата.
- Маппинг runtime ↔ db: `body_html` ↔ `fullDescription` (см. [services/pvlMockApi.js:390](services/pvlMockApi.js#L390) и [services/pvlMockApi.js:430](services/pvlMockApi.js#L430)).
- Размещение в библиотеке — через `pvl_content_placements` (target_section=`library`, target_role=...).

### Sample row для «Драматургия встречи»

В кодовой базе материала **нет в seed/моках** — он живёт только в БД (создан админом). Для проверки реального содержимого нужен SQL:

```sql
SELECT id, title, content_type,
       length(body_html) AS body_len,
       substring(body_html FROM 1 FOR 800) AS body_head
FROM pvl_content_items
WHERE title ILIKE '%драматург%';
```

И, до кучи, узнать какие теги реально лежат:

```sql
SELECT title,
       regexp_matches(body_html, '<(h[1-6]|p|div|strong|b)([^>]*)>', 'g') AS tags
FROM pvl_content_items
WHERE title ILIKE '%драматург%';
```

---

## 2. Как рендерится на frontend

### Цепочка (роль участницы/админа в курсе ПВЛ)

1. **Маршрут**: `/student/library` → `LibraryPage` ([views/PvlPrototypeApp.jsx:1508](views/PvlPrototypeApp.jsx#L1508)) → выбор материала.
2. **Компонент тела**: `PvlLibraryMaterialBody` ([views/pvlLibraryMaterialShared.jsx:359](views/pvlLibraryMaterialShared.jsx#L359)).
3. **Санитайзер**: `normalizeMaterialHtml(fullDescription)` ([views/pvlLibraryMaterialShared.jsx:149-167](views/pvlLibraryMaterialShared.jsx#L149-L167)).
4. **Стили тела**: класс `pvlMaterialBodyClass` ([views/pvlMaterialBodyStyles.js:12-13](views/pvlMaterialBodyStyles.js#L12-L13)).

### Что делает `normalizeMaterialHtml`

```
raw = body_html
if содержит <pre> → распаковать, escape, обернуть <div class="pvl-doc-verbatim">
elif содержит хоть один HTML-тег → DOMPurify.sanitize(raw, PVL_MATERIAL_HTML_PURIFY)
else (plain text) → escape, заменить \n на <br/>, обернуть <div class="pvl-doc-verbatim">
```

`PVL_MATERIAL_HTML_PURIFY` ([views/pvlLibraryMaterialShared.jsx:144-147](views/pvlLibraryMaterialShared.jsx#L144-L147)) добавляет таблицы, списки, blockquote и т. п. в whitelist. **`h1`–`h6` идут через default-whitelist DOMPurify — пропускаются.** Атрибуты `style`, `class`, `id` НЕ запрещены в опциях, но и не добавлены — значит DOMPurify (default-whitelist) их сохранит, кроме небезопасных.

### Стили `pvlMaterialBodyClass`

Ключевая (потенциально проблемная) часть:

```
[&>h1]:mt-6 [&>h1]:mb-3 [&>h1]:text-xl [&>h1]:font-semibold ...
[&>h2]:mt-5 [&>h2]:mb-2.5 [&>h2]:text-lg [&>h2]:font-semibold ...
[&>h3]:mt-4 [&>h3]:mb-2 [&>h3]:text-base [&>h3]:font-semibold ...
[&>h4]:mt-3 [&>h4]:mb-1.5 [&>h4]:text-base [&>h4]:font-semibold ...
[&>p]:mb-3 [&>p]:leading-relaxed
[&>ul]:my-3 [&>ul]:list-disc ...
```

⚠️ Все селекторы для заголовков, абзацев и списков — **только прямые дети `&>`** контейнера. Любая вложенность (`<div><h2>…</h2></div>`) → стили **не сработают** → визуально heading = plain text.

Никакого Markdown-парсера в рендеринге нет: если в `body_html` лежит plain-текст `## Принцип первый`, он покажется как `## Принцип первый`, escape-нутый и обёрнутый в `pvl-doc-verbatim`.

---

## 3. Как сохраняется через upload / manual editor

### A. File upload (`handleImportContentDocument`)

[views/PvlPrototypeApp.jsx:6138-6169](views/PvlPrototypeApp.jsx#L6138-L6169)

- Принимаются только `.md`, `.markdown`, `.txt`.
- Парсер: `parseImportedPvlDocWithFileName` → `parsePvlImportedMarkdownDoc` ([utils/pvlMarkdownImport.js:81](utils/pvlMarkdownImport.js#L81)).
- Результат HTML кладётся в `draft.fullDescriptionHtml`, оттуда — в `body_html` при сохранении.

⚠️ **Важная деталь**: `parsePvlImportedMarkdownDoc` ([utils/pvlMarkdownImport.js:86-134](utils/pvlMarkdownImport.js#L86-L134)) ищет **первый ATX-heading любого уровня** (`#{1,6}`) и:
- использует его как **title** материала,
- **удаляет** эту строку из тела перед прогоном через `marked`.

Так что если файл начинается с `## Принцип первый. Динамика` (без `#` сверху), первый «Принцип» уходит в title и **исчезает из тела как heading**.

`markdownToPvlHtml` использует `marked.parse(src, { gfm: true, breaks: true })`. `breaks: true` → каждая одиночная `\n` становится `<br>`, что меняет интерпретацию параграфов.

### B. Ручной редактор (`RichEditor`)

[components/RichEditor.jsx](components/RichEditor.jsx) — собственный `contentEditable`-редактор.

- Кнопки H2/H3 есть: [components/RichEditor.jsx:440-441](components/RichEditor.jsx#L440-L441) — через `document.execCommand('formatBlock', false, '<h2>')` (deprecated API, поведение по браузерам разное).
- В редакторе стили `[&_h2]:text-2xl [&_h2]:font-display ...` — здесь любая вложенность, поэтому **внутри редактора визуально heading выглядит корректно**.
- При вставке (paste) `sanitizeIncomingHtml` ([components/RichEditor.jsx:34-169](components/RichEditor.jsx#L34-L169)) умеет конвертировать styled `<div style="font-size:24px">` → `<h2>` (см. `styleToSemantic`), но это работает только на пасте/инициализации, не на исходном тексте, написанном вручную.
- `useEffect` ([components/RichEditor.jsx:197-202](components/RichEditor.jsx#L197-L202)) перерисовывает `innerHTML` при каждом изменении `value` извне — здесь есть риск перезаписи у уже отредактированного контента, но `skipExternalSyncRef` это гасит.
- Сохранение в parent: `onInput` отдаёт raw innerHTML, `onBlur` — sanitized. Если пользователь жмёт «Сохранить» без потери фокуса — родителю мог уйти raw HTML (но это не должно ломать `<h2>` теги — они уже там).

После RichEditor значение `editForm.fullDescriptionHtml` уходит в `pvlDomainApi.adminApi.updateContentItem({..., fullDescription, description, ...})` ([views/PvlPrototypeApp.jsx:5042-5083](views/PvlPrototypeApp.jsx#L5042-L5083)) и сохраняется как `body_html`.

---

## 4. Где теряется heading-форматирование — гипотезы

### H1 (наиболее вероятная) — markdown-файл не содержит heading-разметки

Если Ольга экспортирует материал из Notion/Google Docs/Word **в .md** обычным способом, заголовки в исходнике **часто сохраняются НЕ как `##`**, а как:
- абзац с `**Принцип первый. Динамика**` (bold через markdown), или
- просто строка с большим шрифтом, без heading-markup.

`marked.parse` отдаст `<p><strong>Принцип первый. Динамика</strong></p>` или `<p>Принцип первый. Динамика</p>` — **нет `<h2>`**, рендер их не подсветит.

**Проверка:** открыть исходный .md в текстовом редакторе и посмотреть, есть ли там `##` перед строкой «Принцип первый».

### H2 — первый `##` в .md съедается в `title`

[utils/pvlMarkdownImport.js:86-114](utils/pvlMarkdownImport.js#L86-L114): `parsePvlImportedMarkdownDoc` берёт **первый ATX-heading любого уровня** и удаляет его из тела. Если в файле нет H1 (`#`), а первый `## Принцип первый. Динамика` стоит сверху — он уйдёт в title, остальные «Принципы» останутся как `<h2>`.

Симптом тогда: первый принцип отсутствует совсем (не «как обычный текст», а нет вообще). Не идеально совпадает с жалобой, но возможно для частных случаев.

### H3 — стили `pvlMaterialBodyClass` срабатывают только на прямых детях

[views/pvlMaterialBodyStyles.js:13](views/pvlMaterialBodyStyles.js#L13): селекторы `[&>h1]…[&>h6]`, `[&>p]`, `[&>ul]`, `[&>ol]`. Если HTML из `marked` или из `RichEditor` пришёл с обёртками (`<div>`, секция от paste из Word, fragment от Notion), heading окажется не прямым потомком — стили не применятся, h2 будет выглядеть как голый bold-текст браузерного default.

**Это сценарий, который объясняет и upload-ввод, и ручной (если RichEditor вкладывает h2 в div).** Стоит проверить DevTools-ом: смотрим DOM рендера материала — h2 является прямым ребёнком `div.text-sm.text-slate-700...` или внутри какого-то wrapper'а.

### H4 — кнопка H2 в RichEditor работает непредсказуемо на пустой строке

`document.execCommand('formatBlock')` deprecated и может не сработать, если курсор не в блочном элементе. Пользователь видит, что нажал H2 — но визуально (в редакторе!) ничего не поменялось → впечатление «не получается».

Дополнительно: после `formatBlock` Chrome иногда оборачивает heading в `<div>`. На предыдущем сохранении это даёт ту же H3-проблему (вложенный h2 → стили не цепляются).

### Сводно по правдоподобию

1. **H1 + H3** — комбинированно. Источник теряет `##`, и даже когда heading доходит как `<h2>`, селекторы `&>` не цепляются на вложенные узлы. Это объясняет оба пути: и upload, и ручной.
2. **H2** — частный пограничный случай, может усугублять конкретный файл «Драматургии».
3. **H4** — UX-проблема ручного ввода.

---

## 5. Предложение fix (точечно, после ревью стратегом)

Без apply. На решение — Ольге/стратегу.

### Fix-1 (точечный, минимальный риск) — расширить стили `pvlMaterialBodyClass`

В [views/pvlMaterialBodyStyles.js:13](views/pvlMaterialBodyStyles.js#L13) заменить **для h1–h6, p, ul, ol** селекторы `[&>hN]` на `[&_hN]` (любой уровень вложенности). Это починит H3 и H4-обёртку как сторонний эффект.

Риск: стили будут применяться и внутри table/blockquote/etc — могут возникнуть лишние отступы в редких случаях. Маленький патч.

### Fix-2 (UX upload) — не выкидывать heading из тела

В `parsePvlImportedMarkdownDoc` ([utils/pvlMarkdownImport.js:109-134](utils/pvlMarkdownImport.js#L109-L134)): брать title из YAML/имени файла; первый ATX-heading НЕ удалять из тела, только использовать как fallback для title если YAML/имя пустые. Тогда `## Принцип первый. Динамика` никогда не «исчезнет», даже без H1 сверху.

### Fix-3 (импорт из Word/Notion) — добавить heuristic для «жирных строк-заголовков»

Если параграф состоит **только** из `<strong>...</strong>` и текст короткий (≤120 симв) — конвертить в `<h2>`. Логика подобна `styleToSemantic` в RichEditor ([components/RichEditor.jsx:79-89](components/RichEditor.jsx#L79-L89)), но для случая когда стиль/класс уже потерян.

Применять в `markdownToPvlHtml` после `marked.parse`. Или, чище, добавить хелпер `promoteBoldOnlyParagraphsToHeadings(html)` и вызывать его и в `markdownToPvlHtml`, и в `sanitizeIncomingHtml` RichEditor'а.

### Fix-4 (RichEditor UX) — markdown-shortcut для headings

Перехватывать в `onInput`: если строка начинается с `## ` + пробел/Enter — конвертить в `<h2>` через `formatBlock`. Снимает зависимость от deprecated кнопки.

### Fix-5 (отчёт админу) — preview после импорта

Хорошо бы в `handleImportContentDocument` ([views/PvlPrototypeApp.jsx:6138](views/PvlPrototypeApp.jsx#L6138)) показывать админу прямо: «обнаружено N заголовков, M параграфов» — чтобы он сразу видел, что markdown распарсился не так, как ожидал.

---

## Что НЕ делал

- Не трогал БД (нет миграций, нет SELECT).
- Не правил frontend/backend.
- Не апплил гипотезы — это только recon.

## Что нужно от стратега для финального fix

1. Дать SQL-запрос выполнить на проде, чтобы посмотреть реальный `body_html` для «Драматургии» — это окончательно зафиксирует H1 vs H3.
2. Запросить у Ольги исходный .md файл для воспроизведения — окончательно подтвердить H1 (или опровергнуть, если в исходнике реально `## ...`).
3. Выбрать масштаб fix: только Fix-1 (точечный), или Fix-1 + Fix-2 + Fix-3 (комплексный).
