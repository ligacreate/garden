---
title: DOMPurify whitelist режет ТЕГИ, но KEEP_CONTENT:true пропускает их текст наружу
type: lesson
created: 2026-05-04
related_incident: BUG-HOMEWORK-PASTE-MSO 2026-05-04 (Office HTML-мусор в payload ДЗ)
related_files:
  - utils/pvlHomeworkAnswerRichText.js
  - commit 90e0987
related_lessons:
  - docs/lessons/2026-05-03-rls-returning-implies-select-policy.md (тот же класс «настройка по умолчанию ведёт себя не так, как ожидаешь»)
---

# DOMPurify whitelist режет теги, но `KEEP_CONTENT:true` пропускает их текст наружу

## Симптом

Пользователь копирует ответ ДЗ из Word/Office в HomeworkInlineForm. В `pvl_student_homework_submissions.payload.versions[].textContent` после save попадает не только текст ответа, но и **CSS-код**, выглядящий как обычный текст:

```
<!-- /* Font Definitions */ @font-face {font-family:"Cambria Math"; ...
mso-font-charset:204; mso-generic-font-family:roman; ...}
.MsoChpDefault {mso-style-type:export-only; ...}
```

Этот мусор виден в превью ответа и в админских view. Пользователь не понимает, откуда он взялся.

## Корневая причина — три слоя поведения DOMPurify

`sanitizeHomeworkAnswerHtml` использовал DOMPurify в whitelist-режиме:

```js
DOMPurify.sanitize(html, {
  ALLOWED_TAGS: ['p', 'br', 'h1'..'h6', 'strong', ...],
  ALLOWED_ATTR: ['href', 'target', 'rel', ...],
});
```

Ожидание: «всё, что не в списке, удаляется целиком».

**Реальность DOMPurify:**

1. **Запрещённый ТЕГ** удаляется как ожидается — `<style>` или `<script>` или `<o:p>` исчезают.
2. **Но KEEP_CONTENT:true — это default**. Поведение: «сохранить текстовое содержимое запрещённого тега, как будто это был обычный текст». Логика: чтобы при удалении, например, `<font>` обёртки сохранить текст внутри неё.
3. **Это не различает «обёрточные» теги (`<font>`, `<center>`) от «контейнеров чужого языка» (`<style>`, `<script>`, `<!--...-->`).** В результате CSS из `<style>` попадает в выходной HTML как plain text.

Атрибуты `class="MsoNormal"` / `style="mso-pagination:..."` корректно удалялись (не в `ALLOWED_ATTR`). А вот **содержимое** `<style>` блоков и conditional comments `<!--[if mso]>...<![endif]-->` — нет.

## Паттерн (общий)

При работе с любым **HTML-санитайзером в whitelist-режиме** (DOMPurify, sanitize-html, bleach в Python и подобными):

- **Whitelist тегов и атрибутов — необходимое, но НЕ достаточное условие** для очистки от внешнего HTML-мусора.
- **Default-настройки часто оптимизированы под «обёрточный» сценарий**, не под «разные языки в одном документе» (HTML + CSS + XML + Office namespaces).
- **Запрещённые теги, чьё содержимое — НЕ HTML-текст** (`<style>` = CSS, `<script>` = JS, `<!--...-->` = comments, `<o:p>...</o:p>` = Office XML), нужно резать **целиком вместе с содержимым**, не полагаясь на whitelist.

## Как предотвращать

Перед whitelist-санитайзером — **regex-препроцессинг для тегов с не-HTML содержимым**:

```js
function stripContentBlocks(dirty) {
  return String(dirty || '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')        // включая <!--[if mso]>...<![endif]-->
    .replace(/<\/?[a-z]+:[a-z][^>]*>/gi, ''); // XML-namespaced теги Office
}
```

Альтернативы (рассматривали, отвергли):

- **`KEEP_CONTENT: false`** в DOMPurify — глобально, ломает легитимные кейсы (если когда-нибудь захотим разрешить, например, `<font>` → удалять обёртку, оставлять текст).
- **`FORBID_TAGS: ['style', 'script', ...]`** — то же поведение по KEEP_CONTENT, не помогает.
- **`USE_PROFILES: {html: true}`** — другой preset, не решает проблему content-leak.

## Чек-лист при ревью HTML-санитизации

1. Какие теги содержат **не-HTML-язык** в своём контенте? (`<style>`, `<script>`, XML-namespace `<x:y>`, проприетарные `<o:p>`, conditional comments `<!--[if]>`).
2. Что произойдёт с их **текстом**, если такой тег придёт через paste из стороннего редактора?
3. Если санитайзер не гарантирует «удалять весь блок целиком» — добавить regex-prefilter ДО санитайзера.
4. Проверить на реальном Word-paste, не на синтетическом тесте — Office генерирует много неочевидных конструкций.

## Garden-specific следствие

`sanitizeHomeworkAnswerHtml` в `utils/pvlHomeworkAnswerRichText.js` теперь имеет двухступенчатый pipeline: `stripMsOfficeHtmlNoise` (regex prefilter) → DOMPurify (whitelist). Применяется в 19 точках render+save. **Старые записи в БД с накопленным мусором не требуют миграции данных** — на следующем рендеринге через тот же pipeline отрисуются чисто (мусор в `payload.versions[].textContent` остаётся как есть, но санитизация на render-стадии его убирает из видимого DOM).
