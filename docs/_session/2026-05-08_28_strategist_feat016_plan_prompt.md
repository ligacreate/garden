# FEAT-016 — план реализации (per-student MD-отчёт)

**Адресат:** VS Code Claude Code (executor).
**Автор:** стратег (claude.ai).
**Создано:** 2026-05-08.
**Источник:** DB-recon стратега
[`2026-05-08_27_strategist_feat016_recon.md`](2026-05-08_27_strategist_feat016_recon.md)

## Задача

Recon code-side + план реализации FEAT-016 (per-student
markdown-отчёт по ДЗ ПВЛ). **НЕ apply, НЕ commit.** Только
план в файл, ждём 🟢 от стратега.

## Финальные решения по продукту (Ольга 2026-05-08)

| # | Вопрос | Решение |
|---|---|---|
| 1 | Формат | **Markdown (.md)** — родной для Obsidian, без библиотек генерации |
| 2 | Скоп | **Per-student**, per-module + кнопка «Все модули» (один большой файл) |
| 3 | Куда вписывается | Кнопка/dropdown в строке студентки на дашборде FEAT-017 (`AdminPvlProgress.jsx`) |
| 4 | Версии ответа | Только финальная (`isCurrent: true`) |
| 5 | Комментарии ментора | **Все из revision-цикла** (показывает процесс обучения) |
| 6 | Не сданные ДЗ | **Включать с пометкой «Не сдано»** (полная картина модуля) |
| 7 | HTML→plain | Через существующий `utils/pvlHomeworkAnswerRichText.js`
       `homeworkAnswerPlainText()` (DOMPurify пустой whitelist) |
| 8 | CSV-сводка по когорте | НЕ делаем (дашборд это покрывает) |

## Что нужно от тебя — recon + план

### Section 1 — Code-recon

1. **Mapping `qb-<id>` → название вопроса**:
   - Где живёт? Скорее всего `services/pvlMockApi.js`,
     `utils/pvlQuestionnaireBlocks.js`, или фронт-конфиг.
   - Найти + показать точное место.
   - Понять структуру: один глобальный mapping или per-homework-item?

2. **API методы**:
   - `pvlPostgrestApi.listStudentHomeworkSubmissions(studentId)`
     возвращает submissions с payload (versions + thread)?
   - Есть ли способ читать `pvl_homework_status_history`
     для submission'ов? Если нет — добавить
     `listHomeworkStatusHistory(submissionIds[])`.
   - Возможен ли batch-fetch (несколько submissions сразу),
     чтобы не дёргать N запросов?

3. **Структура AdminPvlProgress** — куда добавить кнопку:
   - В строке таблицы (рядом с `state_line`) добавить иконку
     «📄» / `<Download />` (lucide-react).
   - Клик открывает dropdown / dialog с выбором модуля
     или «Все модули».

4. **Browser blob-download** — паттерн:
   ```js
   const blob = new Blob([markdownString], { type: 'text/markdown;charset=utf-8' });
   const url = URL.createObjectURL(blob);
   const a = document.createElement('a');
   a.href = url;
   a.download = `${fileName}.md`;
   a.click();
   URL.revokeObjectURL(url);
   ```

### Section 2 — План структуры markdown

Шаблон файла:

```markdown
# Александра Титова — Модуль 1

**Курс:** ПВЛ 2026 Поток 1
**Ментор:** Елена Федотова
**Период:** 22.04.2026 — 12.05.2026
**Сгенерировано:** 2026-05-09

---

## ДЗ 1: «Рефлексия по модулю 1»

**Статус:** ✅ Принято · 10/10 баллов
**Сдано:** 25.04.2026 · **Принято:** 27.04.2026

### Ответ

**В: Вопрос 1 (название из mapping)**
Ответ студентки plain text.

**В: Вопрос 2**
...

### Комментарии ментора

**Елена Федотова, 26.04.2026 — на доработку:**
Лилия, добрый день. По заданию...

**Елена Федотова, 27.04.2026 — принято:**
Спасибо за доработку!

---

## ДЗ 2: «Упражнение модуля 1»

**Статус:** ⏳ На проверке
**Сдано:** 02.05.2026

### Ответ
...

---

## ДЗ 3: «Домашка модуля 1 (слабый прогресс)»

**Статус:** ❌ Не сдано

(контент пропущен)

---
```

Иконки статусов (можешь корректировать):
- ✅ accepted
- ⏳ in_review
- 🔄 revision
- 📝 draft
- ❌ overdue / не сдано

### Section 3 — Имена файлов

- Per-module: `Александра_Титова_Модуль_1_2026-05-09.md`
- Все модули: `Александра_Титова_все_модули_2026-05-09.md`

Транслитерация имени? Или оставить кириллицу? Скорее
оставить (имя файла на macOS / Obsidian спокойно
кириллицу). Проверь, чтобы пробелы заменялись на `_`,
не было запрещённых символов (`/`, `:`, и т.д.).

### Section 4 — План реализации

1. **Новый файл `utils/pvlHomeworkReport.js`** — функции:
   - `buildStudentMarkdownReport({ student, mentorName,
     cohortTitle, moduleNumber|'all', homeworkItems,
     submissions, statusHistory, qbMapping })` →
     возвращает markdown string.
   - `downloadAsMarkdownFile(filename, content)` —
     blob-download utility.

2. **`views/AdminPvlProgress.jsx`** — добавить:
   - В каждую строку таблицы — кнопку «📄» с dropdown:
     - «Модуль 0», «Модуль 1», «Модуль 2», «Модуль 3»,
       «Все модули».
     - Если в модуле 0 ДЗ — disable пункт.
   - Логика клика: fetch submissions + status_history +
     mapping → buildStudentMarkdownReport →
     downloadAsMarkdownFile.

3. **Возможные новые методы в `pvlPostgrestApi.js`**:
   - `listHomeworkStatusHistory(submissionIds[])` если ещё
     нет.

### Section 5 — Open questions

1. **Где взять `mentorName`** — мы определили, что в FEAT-017
   RPC уже есть `mentor_name` через COALESCE на profiles.
   Используем то же.
2. **Период модуля** — даты из `pvl_course_weeks.starts_at`/
   `ends_at` для недель этого модуля. min/max по ним.
3. **Перенести логику генерации MD на сервер** (RPC) или
   оставить на клиенте? Для 1 студентки × ~17 ДЗ — клиент
   справится. RPC оставим на потом если потребуется.

## Что НЕ делать в этой задаче

- CSV-сводка по когорте.
- PDF-генерация.
- Server-side report-RPC.
- Email отправка отчёта (пока скачивание).

## После плана

После того как план готов — стратег ревьюит, даёт 🟢 на apply.
Apply — через **локальное preview** (как с магазином), потому
что это UI-изменение в рабочей админке.

План положи в файл:
```
docs/_session/2026-05-08_29_codeexec_feat016_plan.md
```
