# DB-side recon FEAT-016 + FEAT-017 — стратег

**Создано:** 2026-05-07.
**Источник:** ssh+psql под gen_user (read-only).

## Counts

| Метрика | Значение |
|---|---|
| cohorts | 1 (ПВЛ 2026 Поток 1, year=2026, created 2026-04-09) |
| students | 22, все active |
| mentor_links | 18 (4 студента без ментора) |
| mentors | 1 (вероятно Ирина Одинцова) |
| weeks | 13 |
| modules | 4 (0/1/2/3) |
| lessons | 2 (мало используется как FK, см. ниже) |
| homework_items | 19 (17 homework + 2 control_point) |
| submissions | 53 (40 accepted + 10 in_review + 2 revision + 1 draft) |
| course_progress | 12 |
| content_progress | 356 |

## Структура курса

`pvl_course_weeks` — 13 строк, **с реальными датами `starts_at/ends_at`**:

| module | weeks | период |
|---|---|---|
| 0 | 1 | 15-21 апр |
| 1 | 3 | 22 апр — 12 мая |
| 2 | 3 | 13 мая — 2 июня |
| 3 | 6 | 3 июня — 14 июля |

→ **deadline'ы по неделям уже в БД.** Не нужно вычислять.

## Homework_items — что и как

```
title                                                    item_type      max_score  has_lesson  has_week
Тест к уроку «Из чего состоит практика»                  homework       20         f           f
Тест к уроку «Ведущая: роль, границы, этика»             homework       20         f           f
...
Рефлексия по модулю                                      homework       20         f           f
Задание к уроку «Из чего состоит практика»               homework       0          f           t  ← единственный с week_id
Чек-лист практикума (модуль 2)                           homework       10         f           f
Анкета обратной связи (модуль 3)                         homework       15         f           f
Рефлексия по модулю 1                                    homework       10         f           f
Запись СЗ                                                control_point  10         f           f
...
```

**Ключевые наблюдения:**
- `lesson_id` НЕ используется (FK ON DELETE SET NULL, но has_lesson=f везде).
- `week_id` используется ровно у 1 строки.
- **Модуль зашит в title строкой** ("Рефлексия по модулю 1", "Анкета обратной связи (модуль 3)") — нет структурированного поля.
- `external_key` есть у всех (формат `task-X` или `task-ci-<uuid>`), уникален.
- `is_control_point` — флаг есть, используется (2 элемента).

→ **Открытый вопрос продуктовый:** нужно ли поле `module_number` в `pvl_homework_items` для структурного фильтра, или достаточно текст-парсить из title?

## Submission payload — реальная структура

Sample из `pvl_student_homework_submissions.payload` (jsonb):

```json
{
  "thread": [
    { "id": "tm-...", "text": "Отправлена работа",
      "messageType": "version_submitted", "authorRole": "student",
      "linkedVersionId": "ver-...", "linkedStatusHistoryId": "sh-..." },
    { "id": "tm-...", "text": "Статус: отправлено",
      "messageType": "status", "authorRole": "system" }
  ],
  "versions": [
    {
      "id": "ver-...",
      "isCurrent": true,
      "isDraft": false,
      "createdAt": "2026-05-07T08:57:12.339Z",
      "authorRole": "student",
      "answersJson": {
        "qb-qa-1": "02.05.26",
        "qb-0c597aa3": "<b><p><strong>Знакомство было...</strong></p></b>",
        "qb-3f673f0c": "онлайн",
        "qb-5862fb84": "<b>...HTML...</b>",
        ...
      },
      "textContent": "",
      "submissionId": "sub-...",
      "versionNumber": 1,
      "attachments": []
    }
  ]
}
```

**Критически важное:**
- Реальные ответы — в `versions[].answersJson` как `{qb-<id>: HTML-строка}`.
- `textContent` пустое в sample → не используется как fallback, ответы строго в `answersJson`.
- HTML-разметка богатая (`<b><strong><p><ul><li><br>` и т.д.).
- **`qb-<id>` → название вопроса НЕ в БД.** Скорее всего конфиг в frontend-коде.

→ **Открытый вопрос продуктовый:** где живёт mapping `qb-<id>` → читаемое название вопроса? Это нужно знать для CSV-выгрузки.

→ **Архитектурная импликация:** для FEAT-016 (выгрузка) — либо клиентский экспорт (frontend знает свою конфигурацию полей), либо серверный с дублированием mapping'а. Клиентский проще, без новой backend-логики.

## RLS-карта

Все pvl_*-таблицы под RLS с консистентным паттерном:

| Таблица | SELECT | INSERT/UPDATE/DELETE |
|---|---|---|
| `pvl_cohorts` | all authenticated | admin |
| `pvl_mentors` | all authenticated | admin |
| `pvl_course_weeks` | all authenticated | admin |
| `pvl_course_lessons` | all authenticated | admin |
| `pvl_homework_items` | all authenticated | admin |
| `pvl_students` | own / mentor / admin | admin |
| `pvl_garden_mentor_links` | own (student_id или mentor_id) / admin | admin |
| `pvl_student_homework_submissions` | own / mentor / admin | own (insert), own/mentor/admin (update), admin (delete) |
| `pvl_homework_status_history` | через JOIN на submission | через JOIN |
| `pvl_student_course_progress` | own / mentor / admin | own (insert), own/mentor/admin (update), admin (delete) |
| `pvl_student_content_progress` | same as course_progress | same |

**`is_mentor_for(student_uuid uuid)` уже существует, SECURITY DEFINER.** Помощник из phase 17, проверяет связку через `pvl_garden_mentor_links`.

→ **Импликация для FEAT-017 (дашборд):**
- Admin (Ольга/Настя/Ирина) — видит всех студентов через RLS уже сейчас.
- Mentor — видит только своих через `is_mentor_for()` — RLS уже фильтрует.
- **Для дашборда не нужна новая backend-инфра** на access control.

## Существующие функции/RPC

| Функция | Args | SECURITY DEFINER |
|---|---|---|
| `is_admin` | () | t |
| `is_mentor_for` | (uuid) | t |
| `pvl_set_updated_at` | () | f (триггер) |
| `pvl_runtime_set_updated_at` | () | f |
| `pvl_sync_notification_compat` | () | f |
| `pvl_sync_student_question_compat` | () | f |

**Агрегатных view/RPC по прогрессу нет.** Для дашборда нужно либо строить SQL view, либо делать клиентскую агрегацию на фронте.

## Ключевые находки для продуктового решения

1. **Размер данных компактен** — 22 студента × 19 ДЗ ≈ 400 ячеек. Дашборд легко влезает в одну таблицу.
2. **Deadline'ы по неделям есть** — вычислять не надо.
3. **Mentor-view покрыт RLS уже сейчас** — без новой инфры.
4. **Состояние submissions реалистичное** — 75% accepted, 19% in_review, остальное rare. Метрики «сколько сдано/проверено» очевидны.
5. **Один курс, одна когорта, один основной ментор** — масштабируется до 2-3 когорт без архитектурных проблем.
6. **Форма ответов структурированная** — `qb-<id>` → HTML. Mapping в frontend.

## Открытые вопросы для стратега + Ольги

1. **Структурный module_number** в `pvl_homework_items` — нужно или достаточно текст-парсинга из title?
2. **Mapping `qb-<id>` → название вопроса** — в каком файле? (узнаем от code-recon).
3. **Идентификация "feedback по модулю"** — по title-keyword ("Рефлексия", "Анкета обратной связи") или ввести флаг `is_module_feedback` в `pvl_homework_items`?
4. **Формат экспорта** — CSV простой / Excel-style с многими листами / JSON?
5. **Где UI выгрузки** — кнопка в AdminPanel? В учительской "Результаты"? В отдельной странице?
6. **Где UI дашборда** — раздел "Дашборд" в учительской, новая страница в AdminPanel, или новая sidebar-секция?
7. **Колонки CSV** — что точно нужно: студент, ментор, когорта, неделя, модуль, ДЗ-title, статус, score, дата сдачи, дата принятия, текст ответов?
8. **Rich-text → plain** — стратегия очистки HTML для CSV (DOMPurify reverse + line-breaks по `<p>` и `<br>`?)
