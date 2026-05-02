# DB-аудит v3, 2026-05-02 (read-only)

Сессия только на чтение. `psql` под `gen_user` через `/opt/garden-auth/.env` на `5.129.251.56`. Никаких изменений.

Цель: собрать схемы 24 PVL-таблиц + точечные проверки перед SQL по 5 утверждённым шаблонам RLS (A — контент, B — свои данные ученика, C — реестр PVL, D — личные сообщения и нотификации, E — audit log).

---

## Краткое резюме

1. **Схемы 24 PVL-таблиц получены полностью.** Поля «владельца» неоднородны по типу: где-то `student_id`/`mentor_id` UUID, где-то `actor_user_id`/`user_id`/`student_id` — TEXT (`pvl_audit_log`, `pvl_notifications`, `pvl_student_questions`, `pvl_calendar_events`, `pvl_content_items`, `pvl_faq_items`). В RLS-предикатах для TEXT-таблиц обязателен cast `auth.uid()::text = ...`.
2. **🔴 КРИТИЧНО: в `pvl_students` нет ни `user_id`, ни `profile_id`, ни `email`.** Никакой формальной связи `pvl_students.id ↔ profiles.id` в БД нет. Шаблон B («свои данные ученика») без явной связки не реализуется. Вероятная конвенция — `pvl_students.id = profiles.id` для тех же людей: это подкрепляется единственным наблюдением (`messages.author_id = 1085e06d…` совпал с `pvl_students.id = 1085e06d…`). Это **конвенция**, не контракт. Нужно подтверждение от владельца перед написанием политик.
3. **`pvl_students.mentor_id` фактически мёртвая колонка.** У всех 23 студентов `mentor_id=NULL` и `cohort_id=NULL`. Реальная связка ментор↔студент живёт только в `pvl_garden_mentor_links` (19 связок, 5 менторов, PK=student_id — один студент = один ментор, без истории и без флага active). Предикаты «свой ментор» в RLS должны идти через `pvl_garden_mentor_links`, не через `pvl_students.mentor_id`.
4. **garden-auth ходит как `gen_user` (owner таблиц `public.*`).** Не суперпользователь, `rolbypassrls=f`, но как **OWNER таблиц** автоматически обходит RLS на свои таблицы — backend-сервис продолжит работать после включения RLS везде. Член `web_anon` и `authenticated` с двойными GRANT-записями (admin_option=t/f) — следы повторных GRANT'ов, не bug.
5. **На `profiles` 14 политик** — все имена выписаны точно для `DROP POLICY`. Пять «дубликатов с `qual=true`/`auth.uid()=id`» подтверждены: `Map_View_All`, `Public View`, `Public profiles are viewable by everyone.`, `Self Update`, `User_Edit_Self`, `User_Insert_Self`, `Users can insert their own profile.`, `Users can update own profile.` (точные имена ниже).
6. **`messages` — 4 строки, все тестовые от 2026-03-17.** Подтверждено по содержимому: «Тестовое сообщение из БД», «Тестовое сообщение от меня», «И от меня», «Привет-привет». Включение RLS без политик безопасно — потеря этих 4 строк бизнесу безразлична.

---

## Задача 1 — Схемы 24 PVL-таблиц

### Сводная таблица «полей владельца» (для шаблонов RLS)

Главное: какой колонкой и каким типом фильтровать в RLS. Жёлтые ячейки — TEXT (нужен cast `auth.uid()::text`).

| # | Таблица | Шаблон | Главные колонки-владельцы | Тип | FK на `pvl_students(id)` |
|---:|---|---|---|---|---|
| 1 | `pvl_audit_log` | E | `actor_user_id` | **text** | нет |
| 2 | `pvl_calendar_events` | A | `cohort_id`, `visibility_role`, `created_by` | text/text/text | нет |
| 3 | `pvl_checklist_items` | B | `student_id` | uuid | ✓ CASCADE |
| 4 | `pvl_cohorts` | C | (справочник, нет владельца) | — | нет (referenced by students) |
| 5 | `pvl_content_items` | A | `target_role`, `target_cohort_id`, `created_by`, `updated_by` | text | нет |
| 6 | `pvl_content_placements` | A | `target_role`, `target_section`, `cohort_id` | text | нет |
| 7 | `pvl_course_lessons` | A | (через `week_id` → `pvl_course_weeks`) | uuid | нет |
| 8 | `pvl_course_weeks` | A | (без владельца — общий контент) | — | нет |
| 9 | `pvl_direct_messages` | D | `mentor_id`, `student_id`, `author_user_id` | **uuid×3** | нет (но student_id → семантически pvl_students.id) |
| 10 | `pvl_faq_items` | A | `target_role`, `target_section`, `created_by` | text | нет |
| 11 | `pvl_garden_mentor_links` | C | `student_id`, `mentor_id` | uuid | нет |
| 12 | `pvl_homework_items` | A | (общее задание, без владельца) | — | нет |
| 13 | `pvl_homework_status_history` | B | `submission_id` (через `pvl_student_homework_submissions.student_id`), `changed_by` | uuid/uuid | через submission |
| 14 | `pvl_mentors` | C | (справочник) | — | referenced by students |
| 15 | `pvl_notifications` | D | `user_id`, `recipient_student_id`, `recipient_mentor_id`, `role` | **text** | нет |
| 16 | `pvl_student_certification_criteria_scores` | B | `certification_score_id` (через `pvl_student_certification_scores.student_id`) | uuid | через score |
| 17 | `pvl_student_certification_scores` | B | `student_id` | uuid | ✓ CASCADE |
| 18 | `pvl_student_content_progress` | B | `student_id` | uuid | ✓ CASCADE |
| 19 | `pvl_student_course_points` | B | `student_id`, `awarded_by` | uuid/uuid | ✓ CASCADE |
| 20 | `pvl_student_course_progress` | B | `student_id`, `week_id` | uuid | ✓ CASCADE |
| 21 | `pvl_student_disputes` | B | `student_id`, `submission_id`, `certification_score_id` | uuid | ✓ CASCADE |
| 22 | `pvl_student_homework_submissions` | B | `student_id`, `homework_item_id` | uuid | ✓ CASCADE |
| 23 | `pvl_student_questions` | B/D | `student_id`, `assigned_mentor_id`, `resolved_by` | **text×3** | нет (text id'шник!) |
| 24 | `pvl_students` | C | `id` (PK), `mentor_id` (мёртвая), `cohort_id` (мёртвая) | uuid | — |

### Полные \d по таблицам

<details>
<summary><b>Группа 1: справочники / контент курса (шаблон A, C)</b></summary>

```
Table "public.pvl_cohorts"
  id uuid PK gen_random_uuid()
  title text NOT NULL
  year integer
  created_at timestamptz NOT NULL now()

Referenced by: pvl_students.cohort_id (ON DELETE SET NULL)
Trigger: trg_pvl_cohorts_updated_at (но колонки updated_at в схеме нет — потенциальный bug в триггере)
```

```
Table "public.pvl_mentors"
  id uuid PK gen_random_uuid()
  full_name text NOT NULL
  created_at timestamptz NOT NULL now()

Referenced by: pvl_students.mentor_id (ON DELETE SET NULL)
Trigger: trg_pvl_mentors_updated_at (тоже без колонки updated_at в схеме)
```

```
Table "public.pvl_course_weeks"
  id uuid PK gen_random_uuid()
  week_number int NOT NULL UNIQUE
  title text NOT NULL
  module_number int
  is_active bool NOT NULL true
  starts_at date, ends_at date
  external_key text UNIQUE (where not null)
  created_at, updated_at timestamptz NOT NULL now()

Referenced by:
  pvl_course_lessons.week_id (CASCADE)
  pvl_homework_items.week_id (SET NULL)
  pvl_student_course_progress.week_id (CASCADE)
```

```
Table "public.pvl_course_lessons"
  id uuid PK gen_random_uuid()
  week_id uuid NOT NULL FK→pvl_course_weeks(id) CASCADE
  module_number int
  title text NOT NULL
  lesson_type text NOT NULL 'lesson'
    CHECK (lesson|video|pdf|checklist|practice|other)
  sort_order int NOT NULL 0
  external_key text UNIQUE (where not null)
  created_at timestamptz NOT NULL now()

Referenced by: pvl_homework_items.lesson_id (SET NULL)
```

```
Table "public.pvl_homework_items"
  id uuid PK gen_random_uuid()
  lesson_id uuid FK→pvl_course_lessons(id) SET NULL
  week_id uuid FK→pvl_course_weeks(id) SET NULL
  title text NOT NULL
  item_type text NOT NULL 'homework'
    CHECK (homework|control_point|certification_task|other)
  max_score int NOT NULL 20
  is_control_point bool NOT NULL false
  sort_order int NOT NULL 0
  external_key text UNIQUE (where not null)
  created_at timestamptz NOT NULL now()

Referenced by: pvl_student_homework_submissions.homework_item_id (CASCADE)
```

```
Table "public.pvl_content_items"      -- 33 колонки
  id text PK
  title, short_description, body_html text
  content_type text NOT NULL CHECK (video|text|pdf|checklist|template|link|audio|fileBundle)
  lesson_video_url, lesson_rutube_url, lesson_video_embed text
  lesson_quiz, homework_config, glossary_payload, library_payload jsonb
  status text NOT NULL 'draft' CHECK (draft|published|archived)
  created_by, updated_by text          ← владельцы (text id из profiles)
  created_at, updated_at timestamptz NOT NULL now()
  legacy_key text
  target_section text NOT NULL 'library'
  visibility text NOT NULL 'all'
  target_role text NOT NULL 'both'     ← ключ для шаблона A
  target_cohort_id text                ← ключ для шаблона A
  module_number, week_number int
  lesson_kind, category_id, category_title text
  tags jsonb NOT NULL '[]'
  cover_image text
  external_links jsonb NOT NULL '[]'
  estimated_duration text
  metadata jsonb NOT NULL '{}'
  order_index int NOT NULL 999

Referenced by: pvl_content_placements.content_item_id (CASCADE)
```

```
Table "public.pvl_content_placements"
  id text PK
  content_item_id text NOT NULL FK→pvl_content_items(id) CASCADE
  target_role text NOT NULL CHECK (student|mentor|admin|all|both)
  target_section text NOT NULL CHECK (about|dashboard|library|glossary|tracker|lessons|practicums|results|certification|qa|questions|settings|students|mentors|content|calendar|admin)
  cohort_id text
  module_number int CHECK (NULL OR 0..4)
  week_number int CHECK (NULL OR >=0)
  sort_order int 0
  is_published bool NOT NULL false
  created_at, updated_at timestamptz NOT NULL now()
  order_index int NOT NULL 999
  metadata jsonb NOT NULL '{}'
```

```
Table "public.pvl_calendar_events"   -- 23 колонки
  id text PK
  title text NOT NULL, description text
  event_type text NOT NULL CHECK (lesson|practicum|practicum_done|breakfast|mentor_meeting|live_stream|lesson_release|deadline|other)
  visibility_role text NOT NULL 'all' CHECK (student|mentor|admin|all|both)
  cohort_id text
  module_number int CHECK (NULL OR 0..4)
  week_number int CHECK (NULL OR >=0)
  linked_lesson_id, linked_practicum_id text
  starts_at, ends_at timestamptz
  color_token text
  is_published bool NOT NULL true
  created_at, updated_at timestamptz NOT NULL now()
  legacy_key text
  start_at timestamptz NOT NULL now()  ← дублирует starts_at?
  end_at timestamptz                   ← дублирует ends_at?
  date_hint date
  created_by text
  recording_url, recap_text text
```

```
Table "public.pvl_faq_items"
  id text PK
  question text NOT NULL, answer_html text
  target_role text NOT NULL CHECK (student|mentor|admin|all|both)
  is_published bool NOT NULL true
  sort_order int 0
  created_at, updated_at timestamptz NOT NULL now()
  legacy_key text
  answer text NOT NULL ''
  target_section text
  module_number int
  order_index int NOT NULL 0
  created_by text
```
</details>

<details>
<summary><b>Группа 2: реестр PVL (шаблон C)</b></summary>

```
Table "public.pvl_students"
  id uuid PK gen_random_uuid()        ← вероятно = profiles.id, но FK НЕТ
  full_name text NOT NULL
  cohort_id uuid FK→pvl_cohorts(id) SET NULL    ← у всех 23 NULL
  mentor_id uuid FK→pvl_mentors(id) SET NULL    ← у всех 23 NULL (мёртвая колонка)
  status text NOT NULL 'active' CHECK (applicant|active|paused|finished|certified)
  created_at, updated_at timestamptz NOT NULL now()

Referenced by (CASCADE):
  pvl_checklist_items.student_id
  pvl_student_certification_scores.student_id
  pvl_student_content_progress.student_id
  pvl_student_course_points.student_id
  pvl_student_course_progress.student_id
  pvl_student_disputes.student_id
  pvl_student_homework_submissions.student_id
```

```
Table "public.pvl_garden_mentor_links"
  student_id uuid PK                  ← один студент = один ментор
  mentor_id uuid                       ← без FK на pvl_mentors!
  updated_at timestamptz NOT NULL now()
```
</details>

<details>
<summary><b>Группа 3: данные ученика (шаблон B, все CASCADE на pvl_students)</b></summary>

```
Table "public.pvl_checklist_items"
  id uuid PK
  student_id uuid NOT NULL FK→pvl_students(id) CASCADE
  content_item_id text NOT NULL
  checked_at timestamptz NOT NULL now()
  UNIQUE(student_id, content_item_id)
RLS=on, policy "pvl_checklist_items_all": USING(true) WITH CHECK(true) — no-op
```

```
Table "public.pvl_student_content_progress"
  id uuid PK
  student_id uuid NOT NULL FK→pvl_students(id) CASCADE
  content_item_id text NOT NULL
  progress_percent int NOT NULL 0
  completed bool NOT NULL false
  last_opened_at, completed_at timestamptz
  created_at, updated_at timestamptz NOT NULL now()
  UNIQUE(student_id, content_item_id)
RLS=on, policy "pvl_student_content_progress_student": USING(true) WITH CHECK(true) — no-op
```

```
Table "public.pvl_student_course_progress"
  id uuid PK
  student_id uuid NOT NULL FK→pvl_students(id) CASCADE
  week_id uuid NOT NULL FK→pvl_course_weeks(id) CASCADE
  lessons_completed/total int NOT NULL 0
  homework_completed/total int NOT NULL 0
  is_week_closed bool NOT NULL false
  auto_points_awarded bool NOT NULL false
  created_at, updated_at timestamptz NOT NULL now()
  payload jsonb NOT NULL '{}'
  UNIQUE(student_id, week_id)
```

```
Table "public.pvl_student_course_points"
  id uuid PK
  student_id uuid NOT NULL FK→pvl_students(id) CASCADE
  source_type text NOT NULL CHECK (onboarding|week_completion|control_point|mentor_bonus|manual_bonus|library_material|other)
  source_id uuid
  points int NOT NULL
  is_auto bool NOT NULL true
  comment text
  awarded_by uuid
  awarded_at timestamptz NOT NULL now()
```

```
Table "public.pvl_student_homework_submissions"
  id uuid PK
  student_id uuid NOT NULL FK→pvl_students(id) CASCADE
  homework_item_id uuid NOT NULL FK→pvl_homework_items(id) CASCADE
  status text NOT NULL 'draft' CHECK (draft|submitted|in_review|revision|accepted|rejected|overdue)
  score int CHECK (NULL OR >=0)
  mentor_bonus_score int NOT NULL 0
  submitted_at, checked_at, accepted_at timestamptz
  revision_cycles int NOT NULL 0
  created_at, updated_at timestamptz NOT NULL now()
  payload jsonb NOT NULL '{}'

Referenced by:
  pvl_homework_status_history.submission_id (CASCADE)
  pvl_student_disputes.submission_id (CASCADE)
```

```
Table "public.pvl_homework_status_history"
  id uuid PK
  submission_id uuid NOT NULL FK→pvl_student_homework_submissions(id) CASCADE
  from_status, to_status text
  comment text
  changed_by uuid
  changed_at timestamptz NOT NULL now()
  payload jsonb
```

```
Table "public.pvl_student_certification_scores"
  id uuid PK
  student_id uuid NOT NULL FK→pvl_students(id) CASCADE
  self_score_total, mentor_score_total int NOT NULL 0 CHECK (0..54)
  critical_flags_count int NOT NULL 0
  certification_status text NOT NULL 'not_started' CHECK (not_started|in_progress|submitted|accepted|revision|failed)
  scored_at timestamptz
  created_at, updated_at timestamptz NOT NULL now()
```

```
Table "public.pvl_student_certification_criteria_scores"
  id uuid PK
  certification_score_id uuid NOT NULL FK→pvl_student_certification_scores(id) CASCADE
  criterion_code text NOT NULL
  self_score, mentor_score int NOT NULL 0 CHECK (0..3)
  created_at, updated_at timestamptz NOT NULL now()
  UNIQUE(certification_score_id, criterion_code)
```

```
Table "public.pvl_student_disputes"
  id uuid PK
  student_id uuid NOT NULL FK→pvl_students(id) CASCADE
  submission_id uuid FK→pvl_student_homework_submissions(id) CASCADE
  certification_score_id uuid FK→pvl_student_certification_scores(id) CASCADE
  status text NOT NULL 'open' CHECK (open|in_review|resolved|rejected)
  message text NOT NULL
  created_at, updated_at timestamptz NOT NULL now()
```

```
Table "public.pvl_student_questions"   -- !!! id и student_id — TEXT, не uuid
  id text PK
  student_id text NOT NULL              ← без FK!
  question text NOT NULL, answer_html text
  is_public bool NOT NULL false
  status text NOT NULL 'new' CHECK (new|in_review|answered|closed|archived)
  created_at, updated_at timestamptz NOT NULL now()
  legacy_key text
  cohort_id text
  module_number int
  subject, question_text, answer text
  visibility text NOT NULL 'private'
  assigned_mentor_id text               ← без FK
  resolved_by text                      ← без FK
  resolved_at timestamptz
```
</details>

<details>
<summary><b>Группа 4: личные сообщения, нотификации, audit (шаблоны D, E)</b></summary>

```
Table "public.pvl_direct_messages"
  id uuid PK
  mentor_id uuid NOT NULL                ← без FK на pvl_mentors!
  student_id uuid NOT NULL                ← без FK на pvl_students!
  author_user_id uuid NOT NULL            ← без FK
  text text NOT NULL
  created_at, updated_at timestamptz NOT NULL now()
Index: idx_pvl_direct_messages_dialog (mentor_id, student_id, created_at)
```

```
Table "public.pvl_notifications"   -- !!! user_id и recipient_* — TEXT
  id text PK
  user_id text NOT NULL                  ← TEXT, без FK
  role text CHECK (NULL OR student|mentor|admin|all|both)
  kind text NOT NULL
  title text NOT NULL, body text
  entity_type, entity_id text
  is_read bool NOT NULL false
  created_at timestamptz NOT NULL now()
  legacy_key text
  payload jsonb NOT NULL '{}'
  read_at timestamptz
  recipient_role text
  recipient_student_id text               ← TEXT
  recipient_mentor_id text                ← TEXT
  type, text text
  is_system bool NOT NULL true
Trigger: pvl_sync_notification_compat (BEFORE INSERT/UPDATE) — синкает legacy/new колонки
```

```
Table "public.pvl_audit_log"
  id text PK
  actor_user_id text                     ← TEXT, без FK
  action text NOT NULL
  entity_type text NOT NULL
  entity_id text
  payload jsonb
  created_at timestamptz NOT NULL now()
```
</details>

### Ключевые точки для RLS-предикатов

**UUID-таблицы (cast не нужен):**
`pvl_checklist_items`, `pvl_direct_messages`, `pvl_garden_mentor_links`, `pvl_homework_status_history`, `pvl_student_certification_scores`, `pvl_student_certification_criteria_scores`, `pvl_student_content_progress`, `pvl_student_course_points`, `pvl_student_course_progress`, `pvl_student_disputes`, `pvl_student_homework_submissions`, `pvl_students` — `auth.uid() = student_id` работает напрямую.

**TEXT-таблицы (нужен cast `auth.uid()::text`):**
`pvl_audit_log` (`actor_user_id`), `pvl_notifications` (`user_id`/`recipient_*`), `pvl_student_questions` (`student_id`/`assigned_mentor_id`/`resolved_by`), `pvl_calendar_events` (`created_by`), `pvl_content_items` (`created_by`/`updated_by`), `pvl_content_placements` (`cohort_id`), `pvl_faq_items` (`created_by`).

**Без поля владельца (только видимость по target_role/cohort):**
`pvl_cohorts`, `pvl_mentors`, `pvl_course_weeks`, `pvl_course_lessons`, `pvl_homework_items` — это справочники + общий контент. Шаблон A: SELECT всем `authenticated` или ограничение по `target_role`.

---

## Задача 2 — связка ментор-студент

### `pvl_garden_mentor_links` — единственный источник истины

```
links_total | distinct_students | distinct_mentors | unlinked
         19 |                19 |                5 |        0
```

PK по `student_id` → один студент = ровно один ментор, истории нет, флага `is_active` нет.

Сэмпл (5 строк, отсортировано по `updated_at DESC`):
```
              student_id              |              mentor_id               |        updated_at
--------------------------------------+--------------------------------------+------------------------
 5aa62776-6229-4270-9886-33316ff035c6 | 6cf385c3-5d4b-44dc-bcf1-6aa17d50bac7 | 2026-05-01 19:20
 3746da91-5c66-4e91-9966-15643136dae6 | 1b10d2ef-8504-4778-9b7b-5b04b24f8751 | 2026-04-27 23:08
 49c267b1-7ef6-48f6-bb2f-0e6741491b90 | 1b10d2ef-8504-4778-9b7b-5b04b24f8751 | 2026-04-26 11:41
 b90d5f86-3b0e-4f99-8d37-7b32dcf9c401 | 0e779c13-4cf8-48f7-9dd0-caa8da9a0d72 | 2026-04-22 18:48
 35019374-d7de-4900-aa9d-1797bcca9769 | 492e5d3d-81c7-41d8-8cef-5a603e1389e6 | 2026-04-21 19:42
```

5 уникальных менторов на 19 студентов. У одного из них (`1b10d2ef-…`) минимум 3 студента — ментор-нагрузка распределена неравномерно.

### `pvl_students` — мёртвые колонки `mentor_id` и `cohort_id`

```
students_total | distinct_mentors_in_students | unlinked_in_students | active_students
            23 |                            0 |                   23 |              23
```

**У всех 23 студентов `mentor_id IS NULL` и `cohort_id IS NULL`.** Колонки в схеме есть, FK есть, но ни одна строка не заполнена. Реальная связка вынесена в `pvl_garden_mentor_links` без сохранения в `pvl_students`.

### Проверка консистентности `pvl_students.mentor_id` vs `pvl_garden_mentor_links.mentor_id`

10 случайных пар — везде `mismatch=t`, потому что `pvl_students.mentor_id` всегда NULL, а `pvl_garden_mentor_links` всегда заполнен:
```
              student_id              | in_students |               in_links               | mismatch
--------------------------------------+-------------+--------------------------------------+----------
 d302b93d-…                           | NULL        | 6cf385c3-…                           | t
 147aea39-…                           | NULL        | 492e5d3d-…                           | t
 1085e06d-…                           | NULL        | 1b10d2ef-…                           | t
 d128a7a3-…                           | NULL        | 6cf385c3-…                           | t
 (всего 10 строк, 4 с NULL в links — это студенты без ментора, остальные 19 — связаны через links)
```

**Вывод для RLS:** все предикаты «свой ментор / мои студенты» должны идти **только** через `pvl_garden_mentor_links`. Колонку `pvl_students.mentor_id` либо не использовать никогда, либо в отдельной задаче DROP/обновить ETL.

23 − 19 = **4 студента без ментора**. Если шаблон C даёт ментору доступ к строкам своих студентов через `pvl_garden_mentor_links` — эти 4 студента не видны ни одному ментору (но видны админу).

---

## Задача 3 — роль подключения garden-auth

### `/opt/garden-auth/.env` (только нужные переменные)

```
DB_HOST=<TIMEWEB_DB_HOST>.twc1.net
DB_PORT=5432
DB_NAME=default_db
DB_USER=gen_user
```

`DB_PASS` присутствует, на экран не выведен.

### Атрибуты роли `gen_user`

```
current_user | session_user
-------------+-------------
 gen_user    | gen_user

    rolname    | rolsuper | rolinherit | rolcanlogin | rolbypassrls
---------------+----------+------------+-------------+--------------
 authenticated | f        | t          | f           | f
 gen_user      | f        | t          | t           | f
 postgres      | t        | t          | t           | t
 web_anon      | f        | t          | f           | f
```

`gen_user`: не суперпользователь, **rolbypassrls=f**, наследует привилегии (rolinherit=t), может логиниться. Сам по себе RLS не обходит.

### Membership

```
    granted    | member_role | admin_option
---------------+-------------+--------------
 web_anon      | gen_user    | t
 web_anon      | gen_user    | f
 authenticated | gen_user    | t
 authenticated | gen_user    | f
```

`gen_user` — член обеих ролей `web_anon` и `authenticated`, по две записи на каждую (с `admin_option=t` и `f`) — следы повторных GRANT'ов.

### Будет ли garden-auth обходить RLS после включения везде?

**Да, через ownership.** Из v1-аудита: `Access privileges: gen_user=arwdDxtm/gen_user` означает, что `gen_user` — **OWNER таблиц `public.*`**. В Postgres владелец таблицы по умолчанию обходит RLS (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY` без `FORCE` оставляет owner-bypass). FORCE RLS на таблицах **не включён** (`rls_forced=0` из v1).

Значит после включения RLS на всех 28 таблицах:
- garden-auth-сервис под `gen_user` → **продолжит работать без ограничений** (owner-bypass).
- `web_anon` / `authenticated` (через PostgREST или прямое подключение) → попадают под RLS, политики применяются.
- `postgres` (суперюзер, `rolbypassrls=t`) → bypass всегда.

**Рекомендация:** перед написанием SQL уточнить у владельца, нужен ли `ALTER TABLE ... FORCE ROW LEVEL SECURITY` для критичных таблиц (типа `users_auth` из v2). Без FORCE — owner всё ещё видит всё, что может быть как преимуществом (бекенд работает), так и риском (если бекенд получит SQLi).

### Версия Postgres

```
PostgreSQL 18.1 (Ubuntu 18.1-1.pgdg24.04+2) on x86_64-pc-linux-gnu
```

Postgres 18 — самая свежая major. Все современные RLS-фичи доступны.

---

## Задача 4 — точные имена политик `public.profiles`

Из `~/Desktop/policies_backup_2026-05-02.txt` строки 40–53 — все 14 политик на `public.profiles`. Все `permissive=PERMISSIVE`, `roles={public}` (т.е. применяются ко всем ролям, включая будущие `web_anon`/`authenticated`):

| # | policyname | cmd | qual | with_check |
|---:|---|---|---|---|
| 1 | `Map_View_All` | SELECT | `true` | — |
| 2 | `Olga Power` | ALL | `(auth.jwt() ->> 'email'::text) = 'olga@skrebeyko.com'::text` | `(auth.jwt() ->> 'email'::text) = 'olga@skrebeyko.com'::text` |
| 3 | `Olga_Power_Profiles` | ALL | `(auth.jwt() ->> 'email'::text) = 'olga@skrebeyko.com'::text` | `(auth.jwt() ->> 'email'::text) = 'olga@skrebeyko.com'::text` |
| 4 | `Public View` | SELECT | `true` | — |
| 5 | `Public profiles are viewable by everyone.` | SELECT | `true` | — |
| 6 | `Self Update` | UPDATE | `(auth.uid() = id)` | — |
| 7 | `User_Edit_Self` | UPDATE | `(auth.uid() = id)` | — |
| 8 | `User_Insert_Self` | INSERT | — | `(auth.uid() = id)` |
| 9 | `Users can insert their own profile.` | INSERT | — | `(auth.uid() = id)` |
| 10 | `Users can update own profile.` | UPDATE | `(auth.uid() = id)` | — |
| 11 | `profiles_insert_own` | INSERT | — | `(auth.uid() = id)` |
| 12 | `profiles_select_authenticated` | SELECT | `(auth.uid() IS NOT NULL)` | — |
| 13 | `profiles_update_admin` | UPDATE | `is_admin()` | `is_admin()` |
| 14 | `profiles_update_own` | UPDATE | `(auth.uid() = id)` | `(auth.uid() = id)` |

### Дубликаты, готовые к `DROP POLICY` (в кавычках — точные имена)

**SELECT с `qual=true` (3 шт. — все нужно убрать, оставив только `profiles_select_authenticated`):**
```sql
DROP POLICY "Map_View_All" ON public.profiles;
DROP POLICY "Public View" ON public.profiles;
DROP POLICY "Public profiles are viewable by everyone." ON public.profiles;
```

**UPDATE по `auth.uid() = id` (3 шт. — все нужно убрать, оставив только `profiles_update_own`):**
```sql
DROP POLICY "Self Update" ON public.profiles;
DROP POLICY "User_Edit_Self" ON public.profiles;
DROP POLICY "Users can update own profile." ON public.profiles;
```

**INSERT с `auth.uid() = id` (2 шт. — оставить только `profiles_insert_own`):**
```sql
DROP POLICY "User_Insert_Self" ON public.profiles;
DROP POLICY "Users can insert their own profile." ON public.profiles;
```

**Hardcoded `olga@skrebeyko.com` (2 шт. — заменить на `is_admin()` через новые политики):**
```sql
DROP POLICY "Olga Power" ON public.profiles;
DROP POLICY "Olga_Power_Profiles" ON public.profiles;
```

После чистки на `profiles` останется 4 политики:
- `profiles_select_authenticated` (SELECT для залогиненных)
- `profiles_insert_own` (INSERT свой профиль)
- `profiles_update_own` (UPDATE свой профиль)
- `profiles_update_admin` (UPDATE через `is_admin()`)

**Внимание**: точки и большие буквы в именах требуют двойных кавычек в `DROP POLICY` (особенно `"Public profiles are viewable by everyone."` — точка на конце имени).

---

## Задача 5 — содержимое 4 строк `messages`

```
 id |              author_id               |    author_name    |          preview            |          created_at
----+--------------------------------------+-------------------+-----------------------------+--------------------------------
  1 | NULL                                 | Система           | Тестовое сообщение из БД    | 2026-03-17 12:06:23.248+03
  2 | e6de2a97-60f8-4864-a6d9-eb7da2831bf4 | Анастасия Зобнина | Тестовое сообщение от меня  | 2026-03-17 12:11:13.080+03
  3 | 1085e06d-34ad-4e7e-b337-56a0c19cc43f | Настина фея       | И от меня                   | 2026-03-17 12:12:04.536+03
  4 | 85dbefda-ba8f-4c60-9f22-b3a7acd45b21 | Ольга Скребейко   | Привет-привет               | 2026-03-17 13:48:42.323+03
```

**Подтверждено: все 4 строки — тестовые от 2026-03-17 (~46 дней назад).** Содержимое — буквально «Тестовое сообщение из БД», «Тестовое сообщение от меня», «И от меня», «Привет-привет». Авторы — два админа (Анастасия `e6de2a97`, Ольга `85dbefda` — id'шники из v1) и один студент (Настина фея `1085e06d-…`). Включение RLS без политик безопасно: даже если эти 4 строки станут невидимы под `web_anon`/`authenticated`, бизнес-смысл нулевой.

**Бонус-находка:** `author_id` строки 3 (`1085e06d-34ad-4e7e-b337-56a0c19cc43f`) **совпадает с `pvl_students.id`** того же значения (виден в задаче 2). Это первое наблюдение, поддерживающее гипотезу `pvl_students.id = profiles.id` — но всё ещё единичное, не контракт. Нужно подтверждение через `JOIN profiles ON profiles.id = pvl_students.id` (показать %совпадений) либо явное «да» от владельца.

---

## Что неожиданно

1. **`pvl_students` не имеет ни `user_id`, ни `profile_id`, ни `email`.** Связи с `profiles` в БД нет вообще — ни FK, ни даже денормализованного ключа. Если `pvl_students.id` действительно равен `profiles.id` — это договорённость на уровне ETL, не БД. **Без её подтверждения шаблон B (`auth.uid() = student_id` на 7+ таблиц через CASCADE) становится «вероятно работает, проверьте сами».** Это главный риск всей RLS-задачи.

2. **`pvl_students.mentor_id` и `pvl_students.cohort_id` полностью мёртвые** (NULL у всех 23 строк). Реальная связка ментор↔студент — только в `pvl_garden_mentor_links`. Колонка не удалена и FK на `pvl_mentors` сохранён, что вводит в заблуждение читающего схему.

3. **Типы `_id`-полей неоднородны.** Половина PVL-таблиц на UUID, половина на TEXT. `auth.uid()` возвращает UUID. Для TEXT-таблиц (`pvl_audit_log`, `pvl_notifications`, `pvl_student_questions`, `pvl_calendar_events`, `pvl_content_items`, `pvl_faq_items`) предикаты RLS требуют `auth.uid()::text = column`. Особенно странно: `pvl_student_questions.student_id` — TEXT, тогда как остальные `student_id` — UUID. Если фронт пишет туда uuid в виде text — работает, но не проверяется типами.

4. **В `pvl_direct_messages` нет ни одного FK** — `mentor_id`, `student_id`, `author_user_id` без ссылок на `pvl_mentors`/`pvl_students`/`profiles`. Целостность держится только на коде фронта/бекенда. RLS-политики писать можно (по `auth.uid() = student_id OR auth.uid() = mentor_id`), но удаление студента из реестра не удалит его сообщения автоматически.

5. **В `pvl_garden_mentor_links` `mentor_id` без FK на `pvl_mentors`.** Можно вписать любой UUID — БД не проверит.

6. **`pvl_calendar_events` имеет дубль колонок `starts_at`/`start_at` и `ends_at`/`end_at`.** В CHECK-constraints используются `starts_at`/`ends_at`, в индексах — `start_at`/`cohort_start`. Похоже на незаконченную миграцию. К RLS не относится, но всплыло.

7. **`pvl_notifications` имеет ещё более бардакное дублирование колонок** — `kind`/`type`, `body`/`text`, `is_read`/`read_at`, `recipient_role`/`role`, плюс `recipient_student_id`/`recipient_mentor_id` параллельно с `user_id`. Триггер `pvl_sync_notification_compat` синкает legacy/new — это указывает на миграцию в процессе. Для шаблона D придётся писать предикат через ИЛИ по нескольким колонкам.

8. **`pvl_cohorts` и `pvl_mentors` имеют триггеры `*_updated_at`, но колонки `updated_at` в их схеме нет.** Триггеры либо мёртвые, либо упали при миграции. Не RLS, но смежный долг.

9. **garden-auth ходит как owner таблиц** (`gen_user=arwdDxtm/gen_user`) — это значит, после включения RLS без `FORCE`, бекенд продолжит работать. Это хорошо для безопасности изменений (фронт-сервисы не сломаются), но и значит, что RLS защищает только PostgREST-роли (`web_anon`/`authenticated`), а не сам `gen_user`. Для `users_auth` из v2 это критично: если хочется защитить от SQLi через бекенд — нужен `FORCE ROW LEVEL SECURITY`.

10. **Postgres 18.1 на проде** — самая свежая major-версия. Все RLS-фичи (PERMISSIVE/RESTRICTIVE, FORCE, политика на колонку) доступны.

11. **`messages` row #3 author_id = pvl_students.id** того же значения — единственное в этой сессии наблюдение в пользу `pvl_students.id = profiles.id`. Слабое, но согласующееся с гипотезой.

---

## Открытые вопросы / blockers

1. **Связь `pvl_students.id ↔ profiles.id` — это контракт или совпадение?** Без чёткого «да» или добавления `pvl_students.profile_id` шаблон B построить нельзя. Способ подтвердить read-only: `SELECT count(*) FROM pvl_students s JOIN profiles p ON p.id = s.id` vs `SELECT count(*) FROM pvl_students` — если совпадают (все 23), гипотеза подтверждается. Эту проверку делать в следующей сессии.

2. **Нужен ли `FORCE ROW LEVEL SECURITY`** на критичных таблицах (`users_auth`, `messages`, `pvl_*`)? Если да — `gen_user` тоже попадает под RLS, и бекенд должен ходить через явные политики (например, `auth.role() = 'service_role'`). Это меняет архитектуру.

3. **Что делать с `pvl_students.mentor_id`/`cohort_id`?** Оставить мёртвыми (опаснее: новые разработчики могут начать использовать)? Или DROP COLUMN отдельной миграцией? Не RLS-вопрос напрямую, но влияет на читаемость предикатов.

4. **TEXT-таблицы (`pvl_audit_log`, `pvl_notifications`, `pvl_student_questions`, `pvl_calendar_events`, `pvl_content_items`, `pvl_faq_items`) — это легаси с TEXT id'шников из старой системы?** Если да — потенциально стоит привести к UUID отдельной задачей. Для RLS сейчас обходимся cast'ами.

5. **Шаблон D на `pvl_notifications`: предикат должен матчить какую из колонок?** Минимум 4 кандидата: `user_id`, `recipient_student_id`, `recipient_mentor_id`, `role`. Триггер `pvl_sync_notification_compat` что-то синкает — нужно прочитать его тело перед политикой. Иначе можно случайно открыть доступ через одну из старых колонок.

6. **Шаблон C (реестр PVL): админ → `is_admin()`, ментор → через `pvl_garden_mentor_links`, студент → `auth.uid() = pvl_students.id`?** Финальная формулировка предиката для трёх ролей сразу, и кто из них имеет право читать `pvl_mentors`/`pvl_cohorts`/`pvl_garden_mentor_links` (студент видит своего ментора по имени? видит других студентов своего ментора? видит свою когорту?).

7. **`pvl_direct_messages` без FK** — если в будущем нужна целостность, добавлять FK отдельной миграцией. Сейчас RLS-политика будет проверять только сами поля, не валидность ссылок.

8. **Точная очередность DROP/CREATE для `profiles`.** Текущие 14 политик все `PERMISSIVE` и складываются по OR. Если сначала DROP «Map_View_All» / «Public View» / «Public profiles are viewable by everyone.» — `profiles_select_authenticated` остаётся, но без логина SELECT упадёт. Нужно убедиться, что фронт после чистки не делает анонимного SELECT-а на `profiles` (если делает где-то на старте до логина — сломается). Это вне scope аудита, но нужно держать в голове перед миграцией.
