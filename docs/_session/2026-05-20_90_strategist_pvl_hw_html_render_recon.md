# BUG-PVL-ADMIN-HW-HTML-RAW-RENDER — recon бриф для codeexec

**От:** стратега (claude.ai)
**Кому:** codeexec (VS Code Claude Code)
**Дата:** 2026-05-20 поздний вечер
**Тип:** Read-only recon, БЕЗ apply/commit/push
**Зелёный:** Ольга 🟢

---

## Контекст

Админ ПВЛ-курса (один из admin-role: Ольга / Настя / Ирина) редактировала
сегодня вечером текст домашнего задания одного из уроков через админку.
На странице студентки в карточке этого задания виден **сырой HTML**
вместо отрендеренного текста:

```
<p>

</p><p><strong>Шаг 1.</strong> Выберите тему гостьи? 2. Какой
артефакт унесут? 3. Как вы пой подготовиться? 5. Что вы сами хотите
попробо
</p><p><strong>Шаг 2.</strong> Сформулируй...
```

Свежий случай (сегодня). Админ нашла workaround — копировать текст
через Obsidian (с конверсией в plain text), это сохраняется
«нормально».

Также пользователь жалуется на:
- Медленная загрузка материалов курса (нужно много раз делать reload)
- Пробелы ломаются при copy-paste из файла

Эти две — **отдельные баги** (BUG-PVL-SLOW-MATERIALS-LOAD,
BUG-PVL-WHITESPACE-CORRUPTION), завести параллельно в backlog без
recon в этом батче.

---

## Что найти (фокус — HTML-render баг)

### 1. Save-path
- Где админка сохраняет текст ДЗ. Какой компонент (вероятно
  `AdminPanel` → один из `AdminPvl*` табов)
- Какой endpoint дёргается (`PATCH /pvl_homework_items?id=eq.X` или
  RPC)
- В какую таблицу и какое поле (вероятно
  `pvl_homework_items.description` / `tasks` / `content`)

### 2. Render-path
- Где этот же текст отображается студентке в карточке задания
  (вероятно view связанная с `PvlPrototypeApp` или
  `views/Pvl*Lesson*.jsx`)
- Используется ли `{text}` (React-escape, тогда `<p>` показывается
  как plain text — **наша гипотеза**) или
  `dangerouslySetInnerHTML` с санитайзером?

### 3. Rich-text editor в админке
- Есть ли в админке rich-text editor (TipTap / TinyMCE / Lexical /
  CKEditor)? Или просто `<textarea>` где админ типит plain text?
- Если editor — какой `output format` он даёт (`getHTML()` / `getJSON()`
  / `getMarkdown()`)?
- Если textarea — то админ вводит HTML-теги **руками** (что
  объясняет `<p>` в данных)

### 4. Реальные данные за сутки
```sql
SELECT id, lesson_id, module_id, updated_at, length(description) AS len,
       substring(description, 1, 200) AS preview
  FROM pvl_homework_items
 WHERE updated_at > NOW() - INTERVAL '24 hours'
 ORDER BY updated_at DESC
 LIMIT 5;
```
(имя поля `description` — гипотеза, скорректируй после `\d
pvl_homework_items`).

Посмотреть **точно**:
- Лежит ли `<p>` явно в `description` (то есть HTML сохраняется как
  есть)?
- Или там `&lt;p&gt;` escaped (двойной escape проблема)?
- Или вообще plain text без тегов (тогда `<p>` появился где-то на
  render-стадии)?

### 5. Связь с BUG-HOMEWORK-PASTE-MSO (commit `90e0987`, lesson
`docs/lessons/2026-05-04-dompurify-keep-content-leaks-style-text.md`)
- Тот fix расширил `stripMsOfficeHtmlNoise` в
  `utils/pvlHomeworkAnswerRichText.js` — покрывает 19 точек render+save
  для `pvl_student_homework_submissions`
- Вопрос: задействован ли этот pipeline в **админ-flow** для
  `pvl_homework_items` (задание которое админ создаёт) или это
  **другой** path?
- Если другой — то админ-side не имеет sanitizer и rich-text editor
  pipeline вообще, и это **причина**

---

## Формат отчёта

`docs/_session/2026-05-20_91_codeexec_pvl_hw_html_render_recon.md`

Структура (компактная):
1. Save-path: компонент, endpoint, таблица/поле — с line refs
2. Render-path: компонент, как рендерится — с line refs
3. Rich-text editor: есть/нет, какой
4. Данные из БД: 3-5 свежих rows preview (без полного content,
   достаточно substring для определения формата)
5. **Гипотеза причины** (одна или 2-3 ranged по вероятности)
6. **Место fix'a** — какой файл, какая функция
7. **Effort estimate** — single-line, 30 мин, 2 часа?
8. Open questions (если что-то требует продуктового решения от стратега)

---

## Что НЕ делать

- ❌ Не править ничего — только recon
- ❌ Не делать UPDATE / DELETE в БД (даже не сам raw HTML «починить»)
- ❌ Не публиковать полный content поля description в отчёте — только
  substring до 200 chars + длина (могут содержать чувствительные
  данные курса)
- ❌ Не лезть в save через UI без надобности (можно тригернуть тот же
  баг снова)

---

## Timeline

~20-30 минут recon. После — стратег пишет fix бриф `_92`, codeexec
apply `_93`, smoke. **Не сегодня вечером** — recon можно отдать сразу,
fix откладываем на утро.
