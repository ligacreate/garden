# Fix — первый ATX-heading съедается при импорте .md (Fix-2)

**Дата:** 2026-05-28
**Сессия:** apply (после recon в `_session/141`)
**Объём:** одна строка в `utils/pvlMarkdownImport.js` + manual UPDATE для текущей «Драматургии» в БД
**Статус:** 🟢 apply Fix-2 — получено. PUSH — ожидает отдельного зелёного после ревью этого диффа.

---

## Корень bug

[utils/pvlMarkdownImport.js:81-134](utils/pvlMarkdownImport.js#L81-L134) — функция `parsePvlImportedMarkdownDoc`.

Текущая логика:
1. `peelYamlFrontMatter` достаёт `yamlTitle`.
2. Цикл по строкам ищет первый ATX-heading (`^#{1,6}\s+`), пишет `headingIndex`.
   - Если `title` ещё не занят — берёт текст heading'а как title.
   - **Если `yamlTitle` уже занял title — heading в title не идёт, но `headingIndex` всё равно запоминается.**
3. `if (headingIndex >= 0) { nl.splice(headingIndex, 1); ... }` — **безусловно вырезает первую найденную heading-строку из тела**, даже если title она не дала.

Результат: при импорте .md с YAML frontmatter + первым `## Принцип первый. Динамика`:
- YAML отдаёт title `Драматургия встречи - динамика, ритм, разнообразие`.
- Парсер находит `## Принцип первый. Динамика` как «первый ATX heading».
- Title не перезаписывается (он уже из YAML).
- Но строка `## Принцип первый. Динамика` всё равно **выпиливается из body**.
- `marked` парсит оставшийся текст — там уже нет первого `##`, есть только второй и далее.
- В БД попадает `body_html` с `<h2>Принцип второй...</h2>`, `<h2>Принцип третий...</h2>` и т. д., но **без `<h2>Принцип первый. Динамика</h2>`**.

Подтверждено прод-SELECT'ом `pvl_content_items.id = ff026114-11f8-4adf-8ff6-138bd56229ee`: «второй/третий/Итог/Микро-задание» лежат как `<h2>`, «Принцип первый. Динамика» вообще отсутствует, тело сразу начинается с `<p>Хороший сценарий — это…</p>`.

Стили `[&>h2]` в `pvlMaterialBodyClass` тут ни при чём — оставшиеся четыре `<h2>` рендерятся корректно, селектор работает. **Fix-1 (CSS) НЕ нужен.**

---

## Diff

### Edit 1: `utils/pvlMarkdownImport.js:110`

```diff
     let mdBody = afterYaml;
-    if (headingIndex >= 0) {
+    if (headingIndex >= 0 && !yamlTitle) {
         const nl = [...lines];
         nl.splice(headingIndex, 1);
         mdBody = nl.join('\n').replace(/^\n+/, '');
     } else if (yamlTitle && lines.length) {
         const t0 = String(lines[0] || '').trim();
         const h0 = t0.match(/^#{1,6}\s+(.+)$/);
         const firstTitle = h0 ? h0[1].trim() : t0.replace(/^#{1,6}\s*/, '').trim();
         if (firstTitle === title) {
             mdBody = lines.slice(1).join('\n').replace(/^\n+/, '');
         }
     } else if (!yamlTitle) {
```

**Смысл:** вырезать первый ATX-heading из тела разрешено только когда title был взят из этого же heading'а (`yamlTitle` пустой). Если title пришёл из YAML — `else if (yamlTitle && lines.length)` уже умеет аккуратно убрать первую строку, **но только если она совпадает с title-ом**. То есть посторонние `## Принцип первый.` останутся в теле.

### Edge-case sanity-check

| Сценарий | yamlTitle | Первая строка | Поведение до fix | Поведение после fix |
|---|---|---|---|---|
| YAML + первый `## Принцип первый` (наш баг) | есть | `## Принцип первый. Динамика` | вырезает (BUG) | оставляет (✓) |
| YAML + первая строка совпадает с title | есть | `# Драматургия встречи` (= title) | вырезает | вырезает (через `else if`) |
| YAML + первая строка случайная | есть | `# Что-то ещё` | вырезает (BUG) | оставляет (✓) |
| Нет YAML, есть `# Заголовок` | пусто | `# Заголовок` | вырезает → title | вырезает → title (без изменений) |
| Нет YAML, нет ATX heading | пусто | абзац | первый абзац идёт в title через нижний блок | без изменений |

Все сценарии — корректно.

---

## Manual UPDATE для уже существующей «Драматургии»

Текущая запись `pvl_content_items.id = ff026114-11f8-4adf-8ff6-138bd56229ee` в БД сломана с момента импорта. Fix кода её не починит — нужен одноразовый UPDATE:

```sql
UPDATE pvl_content_items
SET body_html = REPLACE(
        body_html,
        '<p>Хороший сценарий — это увлекательная история',
        '<h2>Принцип первый. Динамика</h2><p>Хороший сценарий — это увлекательная история'
    )
WHERE id = 'ff026114-11f8-4adf-8ff6-138bd56229ee'
  AND body_html NOT LIKE '%<h2>Принцип первый. Динамика</h2>%';
```

Защита `AND body_html NOT LIKE …` — чтобы повторный прогон UPDATE не задвоил heading.

Проверка после:

```sql
SELECT substring(body_html FROM 1 FOR 800) FROM pvl_content_items
WHERE id = 'ff026114-11f8-4adf-8ff6-138bd56229ee';
```

Должно увидеть `<h2>Принцип первый. Динамика</h2>` перед `<p>Хороший сценарий…</p>`.

---

## Open вопрос — RichEditor manual heading

Жалоба Ольги: «вручную не получается». В этой сессии **НЕ закрываем** — отдельная подзадача. Гипотезы (из recon `_session/141`):

- `document.execCommand('formatBlock', '<h2>')` deprecated, на пустой строке/в нестандартной структуре Chrome может вообще ничего не сделать или обернуть h2 в `<div>` — пользователь нажал и не понял что произошло.
- Markdown-shortcut `## ` → h2 в редакторе сейчас нет; стоило бы добавить.

**Действие:** дождаться от Ольги конкретный шаговый кейс («открыла материал → щёлкнула сюда → нажала H2 → результат такой») и сделать отдельный recon. Не угадывать.

---

## Что НЕ делаю в этой сессии

- Bump sw.js, commit, push, deploy — жду отдельного 🟢 PUSH.
- Не трогаю CSS / стили (Fix-1 не нужен).
- Не правлю RichEditor (open вопрос выше).
- Не делаю backfill для других материалов — насколько вижу, баг проявился только в «Драматургии» (другие импорты могут быть без YAML title, тогда они уже работают через старый путь корректно). Если у Ольги есть ещё материалы из того же экспорта Notion с YAML + первым `##` — попросить список, тогда сделать общий backfill.

---

## План шагов после 🟢 PUSH

1. Edit применён → bump `public/sw.js` (cache version).
2. Commit + push на main.
3. Deploy через GitHub Actions FTP (либо ручной trigger, если так заведено).
4. Apply manual UPDATE на проде (или сейчас параллельно — read-only check уже сделан).
5. Ольга проверяет «Драматургию» — должны быть видны все 5 h2.
6. Ольга пробует ре-импорт того же .md (без удаления старой записи или в test-материале) → должен прийти `<h2>Принцип первый. Динамика</h2>` уже из парсера.

---

## Risk / blast radius

- **Файл:** один (`utils/pvlMarkdownImport.js`).
- **Один call-site:** `handleImportContentDocument` в [views/PvlPrototypeApp.jsx:6150](views/PvlPrototypeApp.jsx#L6150) — единственное использование `parsePvlImportedMarkdownDoc` в репо.
- **Behavior change:** только для случая `yamlTitle + первый ATX heading`. Старые сценарии без YAML не затронуты.
- **UPDATE на проде:** одна строка, одна запись по id, защита от двойного прогона. Не destructive.
