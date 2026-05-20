# BUG-PVL-ADMIN-HW-HTML-RAW-RENDER — diff на review

**От:** codeexec (VS Code)
**Кому:** Ольга → стратегу
**Дата:** 2026-05-20 поздний вечер
**В ответ на:** [_92](2026-05-20_92_strategist_pvl_hw_html_render_fix_brief.md)
**Статус:** Шаг 1 — diff БЕЗ apply. Жду 🟢.

---

## 1. Выбор санитайзера

**Выбран:** `sanitizeHomeworkAnswerHtml`
(из [utils/pvlHomeworkAnswerRichText.js:31](../utils/pvlHomeworkAnswerRichText.js#L31)).

**Почему:**
1. Уже импортируется в оба целевых файла
   ([pvlChecklistShared.jsx:4](../views/pvlChecklistShared.jsx#L4),
   [pvlQuestionnaireShared.jsx:4](../views/pvlQuestionnaireShared.jsx#L4)) —
   нулевой added import.
2. Уже **используется в этих же файлах** для рендера ответов
   студентки/ментора:
   - [pvlChecklistShared.jsx:50](../views/pvlChecklistShared.jsx#L50)
   - [pvlQuestionnaireShared.jsx:54, 171, 207, 224, 238](../views/pvlQuestionnaireShared.jsx#L54)
   - Консистентность с working baseline.
3. `normalizeMaterialHtml` имеет лишнюю спец-логику для `<pre>`-unwrap
   ([pvlLibraryMaterialShared.jsx:152-161](../views/pvlLibraryMaterialShared.jsx#L152)) —
   ненужна для коротких inline-полей. Хуже того, **может ухудшить
   ситуацию**: если plain-text label начнётся с `<pre>` (Office paste
   артефакт), normalizeMaterialHtml сделает verbatim-escape всего
   контента (см. _91 hypothesis B).

**Проверка whitelist** ([pvlHomeworkAnswerRichText.js:17-26](../utils/pvlHomeworkAnswerRichText.js#L17)):
```js
ALLOWED_TAGS: [
    'p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u', 's',
    'a', 'img', 'blockquote', 'pre', 'code',
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'div', 'span',
],
ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'colspan', 'rowspan'],
```

| Нужный тег | Включён | Note |
|---|---|---|
| `<strong>` | ✅ |  |
| `<em>` | ✅ |  |
| `<p>` | ✅ |  |
| `<br>` | ✅ |  |
| `<a>` | ✅ | + `href`/`target`/`rel` атрибуты |

Все 5 inline-тегов из бриф'а покрыты. Bonus: также `<b>`, `<i>`, `<u>`,
`<s>`, lists, headings — но это уже широкий whitelist, не плохо.

**STOP-условия (стр 159-161 брифа): не сработали.** Готов к diff'у.

---

## 2. Diff по 9 точкам

Узкий scope: только render-точки, admin-side не трогаю, БД не правлю.

Паттерн правки — три варианта в зависимости от текущей структуры:
- **Variant A (чистый text-node)**: добавить `dangerouslySetInnerHTML`
  на тот же wrapper (`<span>` / `<p>` / `<div>`).
- **Variant B (text + sibling JSX, типа `*` для required)**: обернуть
  text-часть в новый `<span dangerouslySetInnerHTML />`, sibling JSX
  оставить.
- **Variant C (text + JSX-fallback на `||`)**: разделить через
  тернарник — text → `<span dangerouslySetInnerHTML />`, fallback —
  JSX как было.

### 2.1. `views/pvlChecklistShared.jsx` (2 точки, Variant A)

#### Точка 1 — line 16, `ChecklistFieldsEditor` (студентка заполняет):

```diff
@@ -13,7 +13,10 @@
                     <div className="space-y-4">
                         {(sec.items || []).map((item) => (
                             <div key={item.id} className="block">
-                                <span className="text-xs text-slate-600 block mb-1">{item.prompt}</span>
+                                <span
+                                    className="text-xs text-slate-600 block mb-1"
+                                    dangerouslySetInnerHTML={{ __html: sanitizeHomeworkAnswerHtml(item.prompt || '') }}
+                                />
                                 <RichEditor
                                     value={v[item.id] || ''}
                                     onChange={(html) => onChange({ ...v, [item.id]: html })}
```

#### Точка 2 — line 45, `ChecklistAnswersReadonly` (просмотр):

```diff
@@ -42,7 +42,10 @@
                     <ul className="mt-1 space-y-3">
                         {(sec.items || []).map((item) => (
                             <li key={item.id} className="text-sm">
-                                <span className="text-slate-500 text-xs block">{item.prompt}</span>
+                                <span
+                                    className="text-slate-500 text-xs block"
+                                    dangerouslySetInnerHTML={{ __html: sanitizeHomeworkAnswerHtml(item.prompt || '') }}
+                                />
                                 <div
                                     className={`${pvlMaterialBodyClass} mt-1 text-slate-800`}
                                     dangerouslySetInnerHTML={{
```

### 2.2. `views/pvlQuestionnaireShared.jsx` (7 точек)

#### Точка 3 — line 19, `QuestionnaireFieldsEditor` шапка (Variant A):

```diff
@@ -16,7 +16,11 @@
                     {questionnaireTitle || 'Анкета'}
                 </h2>
                 {questionnaireDescription ? (
-                    <p className="mt-2 text-sm text-slate-600 whitespace-pre-wrap">{questionnaireDescription}</p>
+                    <p
+                        className="mt-2 text-sm text-slate-600 whitespace-pre-wrap"
+                        dangerouslySetInnerHTML={{ __html: sanitizeHomeworkAnswerHtml(questionnaireDescription) }}
+                    />
                 ) : null}
             </div>
```

Note: `whitespace-pre-wrap` оставляю — для случая, когда description
ещё в plain text (старые анкеты). Не мешает HTML-рендеру.

#### Точка 4 — line 28, qa_pair вопрос в `<p>` с numbering span (Variant C):

```diff
@@ -23,10 +23,16 @@
             {/* Новые блоки qa_pair */}
             {qaPairs.map((b, idx) => (
                 <div key={b.id} className="rounded-xl bg-white shadow-md p-5 space-y-3">
                     <p className="text-sm text-slate-800">
                         <span className="text-slate-400 mr-2">{idx + 1}.</span>
-                        {b.question || <span className="text-slate-400 italic">Вопрос</span>}
+                        {b.question ? (
+                            <span dangerouslySetInnerHTML={{ __html: sanitizeHomeworkAnswerHtml(b.question) }} />
+                        ) : (
+                            <span className="text-slate-400 italic">Вопрос</span>
+                        )}
                     </p>
```

Numbering span (`{idx + 1}.`) остаётся sibling — не трогается.
Fallback `<span italic>Вопрос</span>` сохранён как было.

#### Точка 5 — line 63, legacy `short_text` label (Variant B):

```diff
@@ -60,7 +60,9 @@
                                 <label key={b.id} className="block space-y-1">
                                     <span className="text-sm text-slate-800">
-                                        {b.label || 'Вопрос'}
+                                        <span
+                                            dangerouslySetInnerHTML={{ __html: sanitizeHomeworkAnswerHtml(b.label || 'Вопрос') }}
+                                        />
                                         {b.required ? <span className="text-rose-600"> *</span> : null}
                                     </span>
                                     <input
```

Required `*` остаётся sibling — render HTML только для текста label.

#### Точка 6 — line 81, legacy `long_text` label (Variant B, аналогично):

```diff
@@ -78,7 +80,9 @@
                                 <div key={b.id} className="space-y-1">
                                     <span className="text-sm text-slate-800 block">
-                                        {b.label || 'Вопрос'}
+                                        <span
+                                            dangerouslySetInnerHTML={{ __html: sanitizeHomeworkAnswerHtml(b.label || 'Вопрос') }}
+                                        />
                                         {b.required ? <span className="text-rose-600"> *</span> : null}
                                     </span>
                                     <RichEditor
```

#### Точка 7 — line 191, `QuestionnaireAnswersReadonly` description (Variant A):

```diff
@@ -188,7 +188,12 @@
             {(questionnaireTitle || questionnaireDescription) ? (
                 <div className="rounded-lg border-t-4 border-emerald-500 bg-white p-4 shadow-sm">
                     {questionnaireTitle ? <div className="text-base font-medium text-slate-800">{questionnaireTitle}</div> : null}
-                    {questionnaireDescription ? <div className="text-sm text-slate-500 mt-1 whitespace-pre-wrap">{questionnaireDescription}</div> : null}
+                    {questionnaireDescription ? (
+                        <div
+                            className="text-sm text-slate-500 mt-1 whitespace-pre-wrap"
+                            dangerouslySetInnerHTML={{ __html: sanitizeHomeworkAnswerHtml(questionnaireDescription) }}
+                        />
+                    ) : null}
                 </div>
             ) : null}
```

Note: `questionnaireTitle` я **не правлю** — короткий заголовок,
admin едва ли вставит туда HTML, и обычно `<h2>`/`<div>` с inline
HTML на главной заголовочной строке выглядит странно. Если позже
понадобится — отдельный микро-fix.

#### Точка 8 — line 202, readonly qa_pair вопрос (Variant C-lite):

```diff
@@ -199,7 +204,10 @@
                     <div key={b.id} className="rounded-lg bg-white p-4 shadow-sm border border-slate-100 space-y-2">
                         <div className="text-xs font-medium text-slate-500">
-                            {idx + 1}. {b.question || 'Вопрос'}
+                            {idx + 1}.{' '}
+                            <span
+                                dangerouslySetInnerHTML={{ __html: sanitizeHomeworkAnswerHtml(b.question || 'Вопрос') }}
+                            />
                         </div>
```

Тут `'Вопрос'` — обычная строка fallback (не JSX). Sanitize вернёт её
as-is.

#### Точка 9 — line 233, legacy block label readonly (Variant A):

```diff
@@ -230,7 +238,10 @@
                         return (
                             <div key={b.id} className="text-sm">
-                                <div className="text-xs font-medium text-slate-500">{b.label || b.id}</div>
+                                <div
+                                    className="text-xs font-medium text-slate-500"
+                                    dangerouslySetInnerHTML={{ __html: sanitizeHomeworkAnswerHtml(b.label || b.id) }}
+                                />
                                 {b.type === 'long_text' ? (
                                     <div
                                         className={`${pvlMaterialBodyClass} mt-1 text-slate-800`}
```

Fallback `b.id` — это slug типа `qb-cd6cfe73`, безопасный для
sanitize (никаких тегов).

---

## 3. Возможные regression risks

### 3.1. `whitespace-pre-wrap` + DOMPurify

В точках 3 и 7 wrapper-`<p>`/`<div>` имеет `whitespace-pre-wrap`. С
HTML-контентом внутри (`<br>`, `<p>`) переводы строк уже выражены
тегами. Класс `whitespace-pre-wrap` дополнительно сохранит `\n` между
тегами и текстом — это **может дать чуть больше отступа**, чем без
него. Не критично, но визуально может отличаться от RichEditor-output.

**Митигация**: оставляю класс. Если станет проблемой — отдельный
P3 косметический fix. Альтернатива (убрать класс) рискованнее: plain-
text descriptions (старые анкеты, без HTML) сразу потеряют форматирование.

### 3.2. React warning про children + dangerouslySetInnerHTML

`dangerouslySetInnerHTML` нельзя сочетать с children. В Variant B
(точки 5, 6) я **выношу text в отдельный `<span>`** именно поэтому —
внешний `<span>` сохраняет children (новый внутренний span + sibling
required-`*`), внутренний span получает dangerouslySetInnerHTML. React
не должен ругаться.

### 3.3. Null/undefined safety

Все вызовы — `sanitizeHomeworkAnswerHtml(x || '')` или `x || 'fallback'`.
DOMPurify обрабатывает пустую строку как `''` (no-op), React в
dangerouslySetInnerHTML спокойно принимает `__html: ''`. Никаких
warnings ожидаемо нет.

### 3.4. Случай b.label = b.id (точка 9)

Если `b.label` пуст и используется `b.id` (типа `qb-cd6cfe73`),
sanitize вернёт его. Префикс `qb-` не выглядит как тег → sanitize
not affected. OK.

### 3.5. accessibility / linting

- `<label>` обёртка в точке 5 (line 61) сохраняет
  `<input>` внутри — label-for-input ассоциация работает (input
  внутри label).
- В точке 6 wrapper `<div>` — там был `<span block>` (line 80), это
  div-эквивалентный display. Сохраняю как было.
- ESLint правило `react/no-danger` (если включено) ругнётся на 9
  новых `dangerouslySetInnerHTML`. **Не включено** в проекте —
  проверял импорты: уже есть **10+** dangerouslySetInnerHTML в
  этих же файлах. Не должно ругаться (build prod ничего не блокирует).

### 3.6. Bundle size

Никаких новых imports / dependencies. Diff чисто структурный, npm ci
переберёт деpsы — chunk-hash flap, expected (1 push = 1 deploy =
1 flap, см. VITE-CHUNK-HASH-FLAPPING).

---

## 4. Файлы изменены

- `views/pvlChecklistShared.jsx` — 2 правки (lines 16, 45)
- `views/pvlQuestionnaireShared.jsx` — 7 правок (lines 19, 28, 63,
  81, 191, 202, 233)

**ВСЕГО:** 9 правок в 2 файлах. Никакого admin-side, никакого DB,
никаких новых imports.

---

## 5. Что НЕ сделано (read-only)

- ❌ Не применял правки в файлах (Шаг 1 = diff only).
- ❌ Не запускал `npm run build`.
- ❌ Не коммитил, не пушил.
- ❌ Не правил `_91` recon (там паттерны корректны).
- ❌ Не правил admin-side формы (вне scope — P3 follow-up).
- ❌ Не правил данные в БД (они валидны).

---

## 6. Готов к Шагу 2 после 🟢

После одобрения diff:
1. Apply 9 правок (Edit-by-Edit, проверяя каждый блок).
2. `npm run build` локально.
3. Commit с message по брифу (без `--amend`, без force-push — новое
   правило).
4. Push (один deploy, expected).
5. Smoke:
   - найду row с recent `<strong>` в одном из 9 полей (или попробую
     записать сам, если в БД сейчас нет — но это уже admin-side
     action, не моя зона; пойду по варианту «verify визуально на
     странице с уже сохранёнными `<p><strong>` главного prompt'a»,
     если нет admin-вставленных в sub-полях).
   - проверю один из открытых ДЗ-уроков, что главный prompt продолжает
     рендериться корректно (regression check).
6. Backlog update + отчёт `_94`.
