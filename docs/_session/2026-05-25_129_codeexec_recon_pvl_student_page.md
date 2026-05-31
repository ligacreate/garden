# Recon Этап 1.1 — Личная страница участницы ПВЛ + отзывы на тренировочные завтраки

**Адресат:** стратег (claude.ai) через Ольгу.
**Автор:** VS Code Claude Code (codeexec).
**Дата:** 2026-05-25.
**Режим:** read-only. psql под `gen_user` + чтение исходников. Никаких изменений.
**Источник задачи:** запрос стратега, шаг 1.1 разведки перед составлением ТЗ Этапа 1 фичи.

---

## TL;DR

- В схеме нет «личной страницы участницы» в peer-режиме. Сегодня всё устроено как
  mentor→mentee (RLS `is_mentor_for`) или admin→all. Peer-видимость в когорте
  потребует **нового RLS-хелпера** `is_pvl_cohort_peer(uuid)` либо нового
  `SECURITY DEFINER` RPC.
- `pvl_students.id` = `profiles.id` (FK ON DELETE CASCADE). Primary identity — единая,
  отдельной таблицы менти-как-учётной-записи нет. Аватар, имя, email — в `profiles`.
- Отзывы на странице ведущего Garden уже есть, но **хранятся как `profiles.leader_reviews jsonb`**
  и **редактируются самой ведущей** (owner-curated). Для peer-feedback паттерн **не
  переиспользуется** — нужна отдельная таблица `pvl_training_feedback`.
- Тренировочный завтрак как сущность сегодня **отсутствует**. В `pvl_calendar_events` есть
  `event_type='breakfast'` (15 строк), но это календарные слоты ведения у действующих
  ведущих Garden (Мария Романова, Елена Бондаренко и т.п.), не у менти курса.
- **Когорта Поток 1: 29 менти (28 active + 1 applicant), 5 менторов, 15 связок.
  13–14 менти ещё без ментора.** Связь 1↔N (1 менти = 1 ментор, PK на `student_id`).
- FEAT-016 (выгрузка ДЗ в MD/ZIP) — **полностью frontend** в `utils/pvlHomeworkReport.js`
  + `views/AdminPvlProgress.jsx`, без новых RPC. Паттерн (lazy JSZip + per-сущность MD)
  **переиспользуется** для bulk-выгрузки отзывов.
- PVL внутри Garden — это не URL-router, а внутренний state-router (`route` строка) с
  префиксами `/student/...`, `/mentor/...`, `/admin/...`. Mount новой страницы логично
  в `StudentPage` под `/student/peer/:id` или новый префикс `/pvl/profile/:id`.

---

## 1. Схема `pvl_*`

### 1.1 Список таблиц (24)

[`database/pvl/migrations/001_pvl_scoring_system.sql`](../../database/pvl/migrations/001_pvl_scoring_system.sql)
+ последующие миграции:

```
pvl_audit_log                              pvl_homework_items
pvl_calendar_events                        pvl_homework_status_history
pvl_checklist_items                        pvl_mentors
pvl_cohorts                                pvl_notifications
pvl_content_items                          pvl_student_certification_criteria_scores
pvl_content_placements                     pvl_student_certification_scores
pvl_course_lessons                         pvl_student_content_progress
pvl_course_weeks                           pvl_student_course_points
pvl_direct_messages                        pvl_student_course_progress
pvl_faq_items                              pvl_student_disputes
pvl_garden_mentor_links                    pvl_student_homework_submissions
                                           pvl_student_questions
                                           pvl_students
```

### 1.2 Ключевые сущности и FK

**`pvl_students`** (id, full_name, cohort_id, mentor_id, status, …)
- `id uuid PRIMARY KEY` + `FOREIGN KEY (id) REFERENCES profiles(id) ON DELETE CASCADE`
  → **primary identity единая с auth: один UUID = profile = student = auth.uid()**.
- `cohort_id → pvl_cohorts(id) ON DELETE SET NULL`.
- `mentor_id → pvl_mentors(id) ON DELETE SET NULL` — **legacy-поле**, на проде в
  `pvl_mentors` всего 1 строка (placeholder `22222222-…-201`). Реальная связь
  ментор↔менти живёт в `pvl_garden_mentor_links`.
- `status ∈ {applicant, active, paused, finished, certified}`.

**`pvl_garden_mentor_links`** (student_id PK, mentor_id, updated_at)
- `student_id uuid PRIMARY KEY` (uniqueness гарантирована → **1 менти = максимум 1 ментор**).
- `mentor_id uuid` — это `profiles.id` (FK не объявлен, конвенция).
- ⚠ FK на `profiles` нет, но `is_mentor_for(uuid)` это использует.

**`pvl_cohorts`** (id, title, year, start_date, end_date)
- Поток 1: `id = 11111111-1111-1111-1111-111111111101`,
  `title = 'ПВЛ 2026 Поток 1'`, `2026-04-15 → 2026-07-01`.
- Поток 2: `ca2b1ce3-…-216704b50f13`, `2026-09-15 → 2026-12-20`.

**`pvl_homework_items`** (id, lesson_id, week_id, title, item_type, max_score, is_control_point, external_key, module_number, is_module_feedback, …)
- Используется как «карточка задания», на которую студент пишет submissions.

**`pvl_student_homework_submissions`** (id, student_id, homework_item_id, status, score, payload jsonb, …)
- `payload` — основной jsonb с `versions[]`, `thread[]` и т.п.
- `status ∈ {draft, submitted, in_review, revision, accepted, rejected, overdue}`.
- Это **главный паттерн «работа студента → проверка ментора»**, который можно
  взять как образец, но **отзывы на тренировочные завтраки — другая сущность**
  (множество авторов на одну единицу контента, не ученическая работа).

### 1.3 Идентификатор Поток 1

```sql
SELECT id FROM pvl_cohorts WHERE title = 'ПВЛ 2026 Поток 1';
-- → 11111111-1111-1111-1111-111111111101
```

---

## 2. RLS-паттерны

Источник правды по живой БД: `\d pvl_<table>` под `gen_user`. Хелперы:
[`is_admin()`](../RUNBOOK_garden.md), `is_mentor_for(uuid)`, `has_platform_access(uuid)`.

### 2.1 Универсальный «шаблон pvl_*»

Каждая pvl-таблица имеет 6 политик:

| Политика | Тип | Что делает |
|---|---|---|
| `*_active_access_guard_select` | RESTRICTIVE, FOR SELECT, TO authenticated | `USING (has_platform_access(auth.uid()))` |
| `*_active_access_guard_write` | RESTRICTIVE, ALL (INS/UPD/DEL), TO authenticated | `USING + WITH CHECK` те же |
| `*_select_*` | PERMISSIVE FOR SELECT | per-table логика видимости |
| `*_insert_*` | PERMISSIVE FOR INSERT | per-table логика записи |
| `*_update_*` | PERMISSIVE FOR UPDATE | per-table логика записи |
| `*_delete_admin` | PERMISSIVE FOR DELETE | `USING (is_admin())` |

Это значит **любая новая pvl-таблица должна получить тот же RESTRICTIVE guard +
PERMISSIVE select/insert/update/delete** — иначе будет дыра.

### 2.2 `pvl_students` (важно для peer-видимости)

```sql
POLICY pvl_students_select_own_or_mentor_or_admin
  USING ((id = auth.uid()) OR is_admin() OR is_mentor_for(id))
```

**Peer-видимости НЕТ.** Менти Поток 1 сегодня **не может** прочитать строки других
менти своей когорты. Это потребует расширения политики, например:

```sql
USING ((id = auth.uid()) OR is_admin() OR is_mentor_for(id) OR is_pvl_cohort_peer(id))
```

где `is_pvl_cohort_peer(uuid)` — новая `SECURITY DEFINER`-функция:

```sql
SELECT EXISTS (
  SELECT 1
  FROM pvl_students me
  JOIN pvl_students them ON me.cohort_id = them.cohort_id
  WHERE me.id = auth.uid()
    AND them.id = target_student
    AND me.cohort_id IS NOT NULL
);
```

### 2.3 «Свой менти» паттерн

[`is_mentor_for(uuid)`](https://github.com/…) (SECURITY DEFINER, stable):

```sql
SELECT EXISTS (
  SELECT 1 FROM public.pvl_garden_mentor_links
  WHERE student_id = student_uuid AND mentor_id = auth.uid()
);
```

Готовый, проверенный — переиспользуется как есть в политике
«ментор видит отзывы своей менти».

### 2.4 Пример INSERT-политики для authenticated

`pvl_student_homework_submissions_insert_own`:

```sql
POLICY pvl_student_homework_submissions_insert_own
  FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid())
```

Это **точный паттерн** для отзыва на тренировочный завтрак:
`WITH CHECK (author_id = auth.uid() AND is_pvl_cohort_peer(target_student_id))`.

### 2.5 web_anon на pvl_*

```sql
SELECT count(*)
FROM information_schema.role_table_grants
WHERE grantee='web_anon' AND table_name LIKE 'pvl_%';
-- → 0
```

**Ничего.** Все pvl-таблицы только для `authenticated`. Это значит публичной
(unauth) видимости тренировочных завтраков и отзывов **по умолчанию не будет** —
соответствует требованию «доверенный круг залогиненных».

---

## 3. Маршруты PVL

### 3.1 Архитектура роутинга

Garden — SPA с state-based view switching, **не URL router**.
`App.jsx` держит `view` (`dashboard`/`leader`/`library`/…),
[`views/UserApp.jsx`](../../views/UserApp.jsx) рендерит `LeaderPageView` когда
`view === 'leader'`. PVL открывается через библиотеку (`view === 'library'`,
`canOpenPvlButton`), внутри [`views/PvlPrototypeApp.jsx`](../../views/PvlPrototypeApp.jsx)
своя строковая «route»-переменная с тремя префиксами.

### 3.2 Префиксы внутри `PvlPrototypeApp`

| Префикс | Кто видит | Главные пути |
|---|---|---|
| `/student/*` | менти (под своим логином) | `/student/dashboard`, `/student/tracker`, `/student/library`, `/student/lessons`, `/student/results`, `/student/certification`, `/student/messages`, `/student/about`, `/student/glossary`, `/student/settings` |
| `/mentor/*` | менторы | `/mentor/dashboard`, `/mentor/applicants`, `/mentor/mentees`, `/mentor/review-queue`, `/mentor/mentee/:id`, `/mentor/mentee/:id/task/:taskId`, и зеркало student-курса под `/mentor/about` etc. |
| `/admin/*` | админы (Учительская) | `/admin/pvl`, `/admin/students`, `/admin/mentors`, `/admin/content`, `/admin/calendar`, `/admin/settings` + зеркало курса |

### 3.3 Что рендерится

- **[`PvlStudentCabinetView`](../../views/PvlStudentCabinetView.jsx)** — мок-кабинет, отдельный legacy-файл с собственным
  state-роутером (Дашборд / Уроки / Результаты / Сертификация / Библиотека). Не
  замаунчен в актуальный PvlPrototypeApp. Похоже на остаток ранней версии — данные
  захардкожены (`stu-2026-001`, `Дарья Лебедева`).
- **`StudentDashboard`** (внутри PvlPrototypeApp:2070) — реальный кабинет менти
  под `/student/dashboard`.
- **[`PvlMenteeCardView`](../../views/PvlMenteeCardView.jsx)** — карточка менти **для ментора**, mount под
  `/mentor/mentee/:id` (PvlPrototypeApp:4103). Точка взгляда: ментор смотрит
  на своего менти. Можно посмотреть «как менти выглядит для ментора» — но
  это **не peer-страница**, RLS заворачивает peers.
- **[`PvlStudentTrackerView`](../../views/PvlStudentTrackerView.jsx)** — рендер недельной структуры/трекера, переиспользуется
  как блок внутри других страниц.
- **[`MentorDashboardView`](../../views/MentorDashboardView.jsx)** — старый mock без PostgREST-подвязки; реальный
  ментор-дашборд живёт внутри PvlPrototypeApp (`MentorDashboard`).

### 3.4 Есть ли «публичная страница менти» для peer'ов

**Нет.** В коде нет ни одного маршрута, который позволял бы залогиненной менти
зайти на страницу другой менти. Текущая видимость:
- Менти → только своя страница (`/student/*`)
- Ментор → его менти (`/mentor/mentee/:id`)
- Админ → все (`/admin/students/:id`)

---

## 4. Профиль менти как сущность

### 4.1 Где менти видит свои артефакты сегодня

| Артефакт | Маршрут | Файл |
|---|---|---|
| Дашборд (модуль, дни до конца, прогресс) | `/student/dashboard` | `StudentDashboard` в [PvlPrototypeApp.jsx:2070](../../views/PvlPrototypeApp.jsx#L2070) |
| Трекер ДЗ по неделям | `/student/tracker` | [`PvlStudentTrackerView`](../../views/PvlStudentTrackerView.jsx) |
| Результаты (статусы submissions) | `/student/results` | `StudentResults` в [PvlPrototypeApp.jsx:2954](../../views/PvlPrototypeApp.jsx#L2954) |
| Сертификация | `/student/certification` | внутри `StudentPage` |
| Сообщения с ментором | `/student/messages` | `pvl_direct_messages` |
| Уроки | `/student/lessons` | reused → `pvl_content_items` |
| Библиотека | `/student/library` | `LibraryPage` |

### 4.2 «Личной страницы ученицы курса» в peer-режиме НЕТ

В коде/UI её нет. Ни в `PvlPrototypeApp`, ни в `views/`. Ближайшие соседи:
- `PvlMenteeCardView` (mentor-view, восстанавливается через mentorApi) —
  показывает «всё про менти» (профиль, статы, задачи, контрольные точки,
  риски, встречи). **Можно начать как форк** этого компонента в peer-mode,
  но многие блоки (риски, контрольные точки, СЗ) для peer'а не нужны и не
  должны быть видны.

### 4.3 Предложение по маршруту

Учитывая, что Garden не использует URL-router, а PVL держит свой строковый
«route»:

**Вариант A (рекомендую):** новый префикс `/student/peer/:id` внутри
PvlPrototypeApp. Mount в `StudentPage()` рядом с `/student/library/:id`.
Плюсы: остаётся в студенческом сайдбаре, не плодит лишнюю иерархию.

**Вариант B:** `/pvl/profile/:id` как корневой префикс (доступный из любого
из трёх pvl-кабинетов). Плюсы: семантически нейтральный. Минусы: придётся
править все три роутера.

**Вариант C:** `/student/cohort/:id` — называет вещь «по сути» (когорта-страница).
Минусы: путает с «когорта целиком».

### 4.4 Backward-compat после курса

Менти после завершения курса (status='certified') становится ведущей Garden —
у неё уже есть LeaderPageView и `profiles.leader_reviews`. С учебной страницей:

**Опция 1 (рекомендую):** **архивируем доступ по умолчанию**. RLS-предикат
`is_pvl_cohort_peer(id)` для активных когорт. После `status='certified'`/`finished`
менти исчезает из выборки peer'ов автоматически (если cohort_id остаётся, но
статус не active — фильтр в политике или в `is_pvl_cohort_peer`).
Альтернативно — добавить в `pvl_cohorts.is_archived boolean` + фильтр в helper.
Плюсы: исторические отзывы остаются (важно как доказательная база для админов).

**Опция 2:** просто убрать из навигации (skip кнопку «к страницам когорты»), но
оставить URL. Менти, у которой сохранена ссылка, всё ещё попадёт. Не блокирует.

**Опция 3:** жёсткое удаление страницы и отзывов через 6 мес после завершения
когорты. Не рекомендую — Ольга и кураторы захотят показывать «прецеденты с
прошлых потоков» новым менти.

---

## 5. Список участниц когорты — точка входа

### 5.1 Что есть сегодня

| UI-точка | Кто видит | Источник | Файл |
|---|---|---|---|
| «Мои менти» (`/mentor/mentees`) | ментор → свои 1–4 менти | `pvlDomainApi.mentorApi.getMentorMentees(mentorId)` | `MentorMenteesPanel` в [PvlPrototypeApp.jsx:3954](../../views/PvlPrototypeApp.jsx#L3954) |
| «Ученицы» (`/admin/students`) | админ → все когорты | `pvlPostgrestApi.listStudents()` + фильтр по cohort | админский MentorMentees... + AdminPvlProgress |

### 5.2 Для peer-навигации ничего нет

- `pvlPostgrestApi.listStudents()` упрётся в RLS (`pvl_students_select_own_or_mentor_or_admin`)
  и вернёт менти только саму себя.
- **Нужно либо** новая RLS-политика (см. §2.2), **либо** новый SECURITY DEFINER
  RPC `list_my_cohort_peers()` (отдаёт `{id, name, avatar_url, status}[]` —
  безопасный whitelist без mentor_id/cohort_id).

### 5.3 Где разместить «список участниц когорты»

Логичные кандидаты:

1. **Новый таб в студенческом сайдбаре «Моя когорта»** — заходит сюда менти,
   видит сетку «как в Саду ведущих» из коллег-менти с переходом на страницу
   каждой. Mount: `/student/cohort`.
2. **Встроить в `/student/dashboard`** небольшой блок «Менти твоего потока»
   с 4–6 карточками + кнопка «Посмотреть всех». Меньше навигации, но дашборд
   перегружается.
3. **Из страницы тренировочного завтрака**: «отзывы оставили N, оставить отзыв» —
   но тут нужна обратная навигация «куда зайти и оставить отзыв». Для V1
   достаточно §1.

Рекомендую совместить: отдельный таб + блок-тизер на дашборде.

---

## 6. Паттерн FEAT-016 (выгрузка)

### 6.1 Что реализовано

Полностью **frontend-only** (никаких новых RPC и Edge functions):

- **[`utils/pvlHomeworkReport.js`](../../utils/pvlHomeworkReport.js)** (510 строк) — генератор:
  - `buildStudentMarkdownReport({student, homeworkItems, submissions, contentItems, weeks, lessons, mentorsById, …})` ([L354](../../utils/pvlHomeworkReport.js#L354))
    → MD-текст одного студента.
  - `downloadAsMarkdownFile(filename, content)` ([L490](../../utils/pvlHomeworkReport.js#L490)) — `Blob` + `URL.createObjectURL`.
  - `downloadAsZipFile(zipName, files)` ([L503](../../utils/pvlHomeworkReport.js#L503)) — `JSZip` лениво (`await import('jszip')`), `generateAsync({type:'blob'})`, blob-link.
- **[`views/AdminPvlProgress.jsx`](../../views/AdminPvlProgress.jsx)** (358 — формирование `${cohortSlug}_${moduleSlug}_${todayIso()}.zip`):
  - Кнопка «Скачать модуль» в админке.
  - Один батч-запрос истории через `listHomeworkStatusHistoryBulk(ids)` ([pvlPostgrestApi.js:](../../services/pvlPostgrestApi.js) добавили `in.(…)`).

### 6.2 Формат

- **MD на менти**, имя файла `{ФИО}_{module|all}_{YYYY-MM-DD}.md`.
- **ZIP по когорте/модулю**: набор `*.md` + один `_summary.md` (содержит TOTALS).

### 6.3 План FEAT-016

[`docs/_session/2026-05-08_29_codeexec_feat016_plan.md`](2026-05-08_29_codeexec_feat016_plan.md)
закоммичен. Применение → [`2026-05-08_31_codeexec_feat016_apply.md`](2026-05-08_31_codeexec_feat016_apply.md).

### 6.4 Переиспользуемость для bulk-выгрузки отзывов

**Да, паттерн прямо ложится:**
- Новый builder `buildFeedbackMarkdownReport({student, feedbacks, sessions, authorsById, …})`
  в том же `utils/pvlHomeworkReport.js` или в соседнем `utils/pvlFeedbackReport.js`.
- В админском кабинете кнопка «Скачать все отзывы по когорте» → тот же
  `downloadAsZipFile(name, [['Иванова.md', md1], ['Петрова.md', md2], …])`.
- На странице самой менти кнопка «Скачать мои отзывы» → `downloadAsMarkdownFile()`.
- JSZip уже в deps (`package.json`), повторно не добавлять.

---

## 7. Когорта Поток 1 — фактуальное состояние

### 7.1 Активные менти

```
SELECT s.status, count(*) FROM pvl_students s
WHERE s.cohort_id='11111111-1111-1111-1111-111111111101'
GROUP BY s.status;

 status    | count
-----------+-------
 active    |    28
 applicant |     1
```

**29 менти всего**, 28 активных + 1 в статусе applicant (Ольга Разжигаева).

### 7.2 Менторы и их менти

```
mentor_id                              | name               | email                         | mentee_count
---------------------------------------+--------------------+-------------------------------+--------------
 0e779c13-4cf8-48f7-9dd0-caa8da9a0d72  | Елена Федотова     | tolstokulakova77@mail.ru      |  4
 492e5d3d-81c7-41d8-8cef-5a603e1389e6  | Юлия Габрух        | lyulya777@inbox.ru            |  4
 6cf385c3-5d4b-44dc-bcf1-6aa17d50bac7  | Василина Лузина    | vasilina_luzina@mail.ru       |  3
 ebd79a0f-1bac-49f9-a3f2-aeeb165a10d7  | Ирина Одинцова     | odintsova.irina.ig@gmail.com  |  3
 1b10d2ef-8504-4778-9b7b-5b04b24f8751  | Настин фиксик      | zobyshka@gmail.com            |  1
```

5 менторов, 15 связок. **Ирина Одинцова — одновременно ментор И админ**
(см. §7.4) — это важно: её `is_mentor_for()` и `is_admin()` дают двойной
доступ, при проектировании RLS «ментор видит отзывы своих менти» она увидит
всё через admin-ветку.

### 7.3 Уникальность связок

```
 total_links | unique_students | unique_mentors
-------------+-----------------+----------------
          15 |              15 |              5
```

PK на `student_id` → **1 менти = 1 ментор**, по факту 15/29 менти привязаны,
**14 без ментора** (включая applicant'а). Это значит на момент Этапа 1 при
peer-навигации часть менти будет с пустым «ментор» в meta — UI должен это
обрабатывать без падений.

### 7.4 Админы

```
 id                                    | name               | email
---------------------------------------+--------------------+-----------------------------
 e6de2a97-60f8-4864-a6d9-eb7da2831bf4  | Анастасия Зобнина  | ilchukanastasi@yandex.ru
 ebd79a0f-1bac-49f9-a3f2-aeeb165a10d7  | Ирина Одинцова     | odintsova.irina.ig@gmail.com
 85dbefda-ba8f-4c60-9f22-b3a7acd45b21  | Ольга Скребейко    | olga@skrebeyko.com
```

3 админа: Ольга, Анастасия (Настя), Ирина — совпадает с озвученным «Ольга,
Настя, Ирина». Хорошо для smoke (хотя именно Ирина = админ+ментор, см. §7.2).

---

## Что ОТСУТСТВУЕТ и придётся создавать с нуля

### Backend (миграции)

1. **Таблица `pvl_training_sessions`** (тренировочные завтраки):
   - `id uuid PK`, `student_id uuid REFERENCES pvl_students(id) ON DELETE CASCADE`,
   - `scheduled_at timestamptz NOT NULL`, `title text`, `scenario_topic text`,
   - `status text` (`planned` / `held` / `cancelled`) — на Этапе 1 можно
     обойтись без статуса, по факту «менти нажала кнопку → завтрак прошёл».
   - `created_at`, `updated_at`.
2. **Таблица `pvl_training_feedback`** (отзывы):
   - `id uuid PK`, `session_id uuid REFERENCES pvl_training_sessions(id) ON DELETE CASCADE`,
   - `author_id uuid REFERENCES profiles(id) ON DELETE CASCADE` (peer),
   - 4 поля по методичке Урок 8: `text_what_worked`, `text_what_to_strengthen`,
     `text_one_technique`, `text_open_question` (все `text NOT NULL`),
   - `created_at`, `updated_at`.
   - Уникальность: `UNIQUE (session_id, author_id)` — один автор = один отзыв
     на одну сессию (но редактирование разрешено).
3. **Хелпер `is_pvl_cohort_peer(target_student uuid) RETURNS boolean`**
   `SECURITY DEFINER`, `STABLE` — см. §2.2 пример.
4. **Расширение `pvl_students_select_own_or_mentor_or_admin`** — добавить
   `OR is_pvl_cohort_peer(id)` или, безопаснее, ввести **отдельную policy
   `pvl_students_peer_select`** с whitelist-полями через VIEW.
5. **Полный набор policies на новые таблицы** (см. §2.1 «универсальный
   шаблон pvl_*»):
   - `*_active_access_guard_select`/`write` RESTRICTIVE.
   - `pvl_training_sessions`:
     - SELECT: own / mentor_for(student_id) / admin / cohort_peer(student_id).
     - INSERT: `WITH CHECK (student_id = auth.uid())`.
     - UPDATE: own (на случай редактирования темы) + admin.
     - DELETE: admin only.
   - `pvl_training_feedback`:
     - SELECT: `is_admin()` OR
       `session_id IN (SELECT id FROM pvl_training_sessions WHERE student_id = auth.uid())` (сама менти видит все отзывы на свои сессии)
       OR `is_mentor_for(<student_id-of-session>)` (ментор видит отзывы на свою менти)
       OR `author_id = auth.uid()` (peer видит свой отзыв; но не чужие).
     - INSERT: `WITH CHECK (author_id = auth.uid() AND is_pvl_cohort_peer(<student_id-of-session>))`.
     - UPDATE: `author_id = auth.uid()` (peer редактирует свой) OR `is_admin()`.
     - DELETE: admin only.
   - **Нюанс:** для select/insert на `pvl_training_feedback` нужен подзапрос
     к `pvl_training_sessions` — это норм, но проверь, что guard'ы не
     рекурсивно режут (skip secdef wrapper).
6. **GRANT'ы** на authenticated для обеих таблиц (см. `recover_grants.sh`,
   ровно те же 4 — SELECT/INSERT/UPDATE/DELETE).

### Frontend

1. **Новая view `PvlPeerProfileView` (или `PvlPeerPageView`)** — peer-страница менти.
   Можно начать с форка `PvlMenteeCardView`, но **жёстко урезать**: видимы только
   имя, аватар (из profiles), тема курса, статус (active), и **блок «Тренировочные
   завтраки» с отзывами**. Никаких рисков/контрольных точек/СЗ.
2. **Mount в PvlPrototypeApp**: добавить `'/student/peer/:id'` (и зеркально для
   `/mentor` и `/admin`, чтобы ментор/админ заходили в тот же UI). См. §4.3.
3. **Список когорты** — отдельный таб `/student/cohort` (см. §5.3) +
   тизер на дашборде.
4. **Кнопка «Я провела тренировочный завтрак»** на странице самой менти:
   модалка → дата+время + тема → `INSERT INTO pvl_training_sessions`.
5. **Кнопка/форма «Оставить отзыв»** на странице другой менти (видна когда
   я peer этой менти + у неё есть session): модалка с 4 textarea →
   `INSERT INTO pvl_training_feedback`.
6. **Список отзывов** на странице сессии — peer видит свой отзыв; менти/ментор/
   админ видят все.
7. **48-часовая подсказка**: чисто client-side calc (`session.scheduled_at + 48h`),
   баннер «у тебя ещё N часов» / «дедлайн прошёл, но можно оставить позже» —
   без блокировки.

### Сервисы

1. **`pvlPostgrestApi.listMyCohortPeers()`** — POST RPC или SELECT с
   собственной RLS-видимостью (зависит от выбранного варианта в §5.2).
2. **`pvlPostgrestApi.listTrainingSessions(studentId)` / `upsertTrainingSession(payload)`**.
3. **`pvlPostgrestApi.listTrainingFeedback(sessionId)` / `upsertTrainingFeedback(payload)`**.
4. **`pvlPostgrestApi.exportFeedbackZip(cohortId)`** (Этап 2/3 если нужно
   bulk-выгрузка как FEAT-016).

---

## Открытые вопросы к продукту

1. **Тренировочный завтрак — сущность с расписанием или just-fact?**
   Менти жмёт кнопку «провела» **до** или **после** завтрака? Если до — нужен
   статус `planned/held/cancelled` и логика напоминаний. Если после — это просто
   запись факта, статус не нужен.
2. **Можно ли удалять тренировочный завтрак?** Если менти ошиблась — удаление
   каскадно убьёт отзывы. Soft delete или нет?
3. **«Один менти — 1–2 тренировочных»** — это hard-limit (CHECK constraint
   `count(*) ≤ 2 per student`) или soft (UI говорит «обычно 1-2», но не
   режет)? Если hard — нужен triggered constraint или RPC-проверка перед insert.
4. **Кто видит, что отзыв оставлен моим именем?** Сейчас задумано «менти и ментор
   видят имя автора». Можно ли peer'ам видеть **факт того, что они уже оставили
   отзыв** (свой), но **не видеть отзывы других peer'ов**? Это в RLS заложено,
   но требует подтверждения UX.
5. **Редактирование отзыва — лимит по времени?** «48ч — только подсказка» — но
   что после? Можно редактировать вечно или есть hard-cutoff?
6. **Авторы отзывов после ухода с курса** — если автор переключился в `paused`/
   ушёл, его старые отзывы остаются видимыми всем? (Сейчас в RLS не учитывается).
7. **Backward-compat с LeaderPageView** — после курса менти становится ведущей
   Garden, у неё есть `profiles.leader_reviews`. Объединять/мигрировать
   тренировочные отзывы туда? Скорее всего нет (другой контекст), но
   уточнить.
8. **«Учебная страница» доступна только участницам когорты или всем
   залогиненным Garden-пользователям?** Я понял «доверенный круг = когорта»,
   но в задаче сказано «всем залогиненным участницам курса». Если допускаем
   расширение на «все участницы всех ПВЛ-когорт» — RLS-помощник проще
   (`exists pvl_students with id=auth.uid()`).
9. **Цвет/визуальный язык карточки отзыва** — переиспользовать палитру
   `REVIEW_COLORS` из LeaderPageView (молочный/песок/беж/мята/туман/пудра)
   или сделать отдельную? Если переиспользуем — единая визуальная
   преемственность с public-страницей ведущего.
10. **Менторы и админы видят отзывы peers вне «своих» менти?**
    По задаче: «отзывы видят сама менти, её ментор, админы». Но peer-автор
    тоже видит свой отзыв. Уточнить, нужны ли менторам отзывы НЕ-своих
    менти (например, для калибровки) — Этап 1 = нет.

---

## Предложение по архитектуре (codeexec)

### Минимальная модель данных

```sql
-- Миграция (например): 2026-05-XX_phase38_pvl_training_breakfasts.sql
CREATE TABLE pvl_training_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES pvl_students(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  scenario_topic text NOT NULL,
  status text NOT NULL DEFAULT 'held'  -- если решим, что это just-fact
    CHECK (status IN ('planned', 'held', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pvl_training_sessions_student_id ON pvl_training_sessions(student_id);
CREATE INDEX idx_pvl_training_sessions_scheduled_at ON pvl_training_sessions(scheduled_at);

CREATE TABLE pvl_training_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES pvl_training_sessions(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  text_what_worked text NOT NULL DEFAULT '',
  text_what_to_strengthen text NOT NULL DEFAULT '',
  text_one_technique text NOT NULL DEFAULT '',
  text_open_question text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, author_id)
);
CREATE INDEX idx_pvl_training_feedback_session_id ON pvl_training_feedback(session_id);
CREATE INDEX idx_pvl_training_feedback_author_id ON pvl_training_feedback(author_id);

-- Хелпер
CREATE OR REPLACE FUNCTION is_pvl_cohort_peer(target_student uuid)
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM pvl_students me
    JOIN pvl_students them ON me.cohort_id = them.cohort_id
    WHERE me.id = auth.uid()
      AND them.id = target_student
      AND me.cohort_id IS NOT NULL
      AND me.status IN ('active', 'applicant', 'certified')  -- скорректировать после §6 в Open Questions
  );
$$;

-- Триггеры updated_at (по аналогии с pvl_set_updated_at)
CREATE TRIGGER trg_pvl_training_sessions_updated_at BEFORE UPDATE ON pvl_training_sessions
  FOR EACH ROW EXECUTE FUNCTION pvl_set_updated_at();
CREATE TRIGGER trg_pvl_training_feedback_updated_at BEFORE UPDATE ON pvl_training_feedback
  FOR EACH ROW EXECUTE FUNCTION pvl_set_updated_at();

-- RLS, по шаблону §2.1 + см. §«Что отсутствует» п.5
-- (детальные политики выпишет ТЗ Этапа 1 — здесь не дублирую).

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON pvl_training_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pvl_training_feedback TO authenticated;
```

Расширение `pvl_students_select_*` — отдельным шагом, **с явным
обсуждением риска** (peer-видимость затрагивает все колонки таблицы;
лучше создать VIEW `pvl_students_peer_view` с whitelist'ом колонок и
дать SELECT на VIEW).

### Список компонентов фронта

| Файл | Что | Размер (прикидка) |
|---|---|---|
| `views/PvlPeerProfileView.jsx` (новый) | страница «другая менти моей когорты» | ~250–400 строк |
| `views/PvlMyCohortView.jsx` (новый) | список всех участниц когорты | ~150 строк |
| `components/PvlTrainingSessionBlock.jsx` (новый) | блок «Тренировочные завтраки» — список сессий + кнопка «провела» | ~150 строк |
| `components/PvlTrainingFeedbackList.jsx` (новый) | список отзывов на сессию + кнопка «Оставить отзыв» / «Редактировать мой» | ~120 строк |
| `components/PvlTrainingFeedbackForm.jsx` (новый) | модалка с 4 textarea | ~80 строк |
| `services/pvlPostgrestApi.js` (правка) | `listTrainingSessions/upsertTrainingSession/listTrainingFeedback/upsertTrainingFeedback/listMyCohortPeers` | +~150 строк |
| `views/PvlPrototypeApp.jsx` (правка) | mount новых маршрутов в `StudentPage`, `MentorPage`, `AdminPage` + sidebar items | +~80 строк |
| `utils/pvlTrainingFeedbackText.js` (новый, опционально) | helper форматирования 4-полевого отзыва в plain MD | ~50 строк |

### Точки роутинга

- `/student/cohort` → `PvlMyCohortView` (мой поток, список менти-карточек).
- `/student/peer/:id` → `PvlPeerProfileView` (страница peer-менти).
- `/student/peer/:id/session/:sid` → опционально, та же страница со скроллом
  на нужную сессию + открытой формой отзыва.
- `/mentor/mentee/:id` → **расширяем**: добавляем тот же блок «Тренировочные
  завтраки» + список отзывов (mentor-режим — read-only, но видит всё).
- `/admin/students/:id` → аналогично mentor: блок видимости всех отзывов +
  кнопка bulk-выгрузки (Этап 3).

### Этап 1 — минимальный scope (предложение)

- Миграция: 2 таблицы, 1 helper, ~10 policies, 2 GRANT.
- Frontend: 3 новых view-файла, 3 компонента, 5 новых API-методов в
  pvlPostgrestApi, ~3 точки mount в роутере.
- Smoke: 1 менти (Дарья Старостина? — у неё есть мент.) создаёт сессию,
  2 peer'а (например, из тех же 4 у Елены Федотовой) оставляют отзыв,
  её ментор открывает её страницу и видит оба, админ из выгрузки видит
  обоих в MD.

### Риски

- **RLS «peer-видимость на pvl_students»** — самый чувствительный кусок.
  Лучше через VIEW + RPC, не через расширение текущей политики
  (изменение `pvl_students` затронет каскад зависимых select'ов в коде).
- **Подзапросы в RLS на feedback** — производительность. На 29 менти и
  ~50 отзывов проблем не будет, но синтаксис нужно валидировать прогоном
  под `authenticated` ролью (вспомним урок 1.1 RUNBOOK — cast и подзапросы
  под RLS могут падать целой таблицей).
- **48-часовая логика** — чисто UX, не блокирует код, но требует
  согласования (см. Open Questions §5).
- **Дубли отзыва** — UNIQUE (session_id, author_id) + ON CONFLICT UPDATE
  через PostgREST `prefer: 'resolution=merge-duplicates'` (см. как в
  `upsertStudentContentProgress` [pvlPostgrestApi.js:600](../../services/pvlPostgrestApi.js#L600)).

---

## Что я НЕ делал (read-only)

- Не создавал/менял таблицы.
- Не писал/применял миграции.
- Не правил код.
- Не коммитил ничего.
- Не запускал dev-сервер.

Все выводы — из чтения схемы под `gen_user`, исходников фронта и
существующих docs/_session/, docs/journal/.

---

**Готов к ревью стратега.** После ревью могу:
- Уточнить любой блок (доп. SQL под gen_user, доп. чтение кода).
- Помочь составить ТЗ Этапа 1 (детальные миграции + policies + diff'ы фронта).
- Подобрать smoke-сценарии под фактическую когорту 1.
