---
title: SEC-001 Phase 14 Part 1 — Schema USAGE + SELECT grants + pre-flight для 14.3 (execution log)
type: execution-log
phase: "14.1+14.2+pre-14.3"
created: 2026-05-02
status: ⏸️ HALF-DONE (14.1 + 14.2 закоммичены, 14.3 ждёт решения)
related_doc: docs/MIGRATION_2026-05-02_security_restoration.md
prev_phase: docs/EXEC_2026-05-02_phase13_pvl_audit_log.md
---

# Phase 14 Part 1 — Grants: schema USAGE + SELECT + pre-flight (execution log)

**Время выполнения:** 2026-05-02, ~23:25 MSK.
**Транзакций закоммичено:** 2 (14.1 и 14.2). Pre-flight 14.0 для 14.3 read-only.
**Результат:** ✅ Schema USAGE выдан, SELECT для authenticated на всё кроме 5 закрытых таблиц. Pre-flight для 14.3 показал 4 расхождения с документом — ждёт решения владельца.

---

## Шаг 14.1 — Schema USAGE

### SQL

```sql
BEGIN;
GRANT USAGE ON SCHEMA public TO web_anon, authenticated;
COMMIT;
```

### Output

```
BEGIN
GRANT
COMMIT
WARNING:  no privileges were granted for "public"
```

📝 **Заметка про WARNING.** В Postgres 15+ schema `public` принадлежит `pg_database_owner`. У `web_anon`/`authenticated` USAGE уже был (унаследован через PUBLIC). GRANT-команда отработала, но фактически новых привилегий не добавила — отсюда WARNING. Это нормально.

### Верификация

```sql
SELECT nspname,
       has_schema_privilege('web_anon', nspname, 'USAGE') AS web_anon_u,
       has_schema_privilege('authenticated', nspname, 'USAGE') AS auth_u
FROM pg_namespace WHERE nspname='public';
```

```
 nspname | web_anon_u | auth_u
---------+------------+--------
 public  | t          | t
(1 row)
```

✅ **Шаг 14.1 ЗАКРЫТ.**

---

## Шаг 14.2 — SELECT для authenticated + REVOKE

### SQL

```sql
BEGIN;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
REVOKE ALL ON public.users_auth FROM authenticated;
REVOKE ALL ON public.to_archive FROM authenticated;
REVOKE ALL ON public.events_archive FROM authenticated;
REVOKE SELECT ON public.messages FROM authenticated;
REVOKE SELECT ON public.push_subscriptions FROM authenticated;
COMMIT;
```

### Output

```
BEGIN
GRANT
REVOKE  × 5
COMMIT
```

### Верификация (точное соответствие ожиданию)

```
      relname       | auth_select
--------------------+-------------
 events_archive     | f
 knowledge_base     | t
 messages           | f
 profiles           | t
 push_subscriptions | f
 pvl_students       | t
 to_archive         | f
 users_auth         | f
(8 rows)
```

✅ Закрытые таблицы (5) — `auth_select=f`. Открытые (3) — `auth_select=t`.

✅ **Шаг 14.2 ЗАКРЫТ.**

---

## Pre-flight 14.0 — проверка политик «прочих таблиц» перед 14.3

### SQL

Read-only SELECT по `pg_policies`, разбитый по cmd (INSERT/UPDATE/DELETE/ALL).

### Результат

```
     relname     | rls_on | p_insert | p_update | p_delete | p_all
-----------------+--------+----------+----------+----------+-------
 app_settings    | t      |        0 |        0 |        0 |     1
 cities          | t      |        1 |        1 |        1 |     0
 course_progress | t      |        1 |        0 |        0 |     0
 events          | t      |        1 |        1 |        1 |     0
 goals           | t      |        1 |        1 |        1 |     0
 meetings        | t      |        2 |        1 |        1 |     0
 news            | t      |        1 |        0 |        0 |     0
 notebooks       | t      |        0 |        0 |        0 |     0
 notifications   | t      |        0 |        1 |        0 |     0
 practices       | t      |        1 |        1 |        1 |     0
 questions       | t      |        0 |        0 |        0 |     0
 scenarios       | t      |        1 |        1 |        1 |     0
 shop_items      | t      |        0 |        0 |        0 |     1
(13 rows)
```

### Анализ расхождений с документом MIGRATION фаза 14.3

| Таблица | Документ предлагает | Реально политик | Решение |
|---|---|---|---|
| `app_settings` | INSERT, UPDATE | ALL=1 (покрывает все) | ✅ оставить INSERT, UPDATE |
| `cities` | INSERT, UPDATE, DELETE | I=1, U=1, D=1 | ✅ оставить как в документе |
| `course_progress` | INSERT | I=1 | ✅ совпадает |
| `events` | INSERT, UPDATE, DELETE | I=1, U=1, D=1 | ✅ оставить |
| `goals` | INSERT, UPDATE, DELETE | I=1, U=1, D=1 | ✅ оставить |
| `meetings` | INSERT, UPDATE, DELETE | I=2, U=1, D=1 | ✅ оставить |
| **`news`** | INSERT, UPDATE, DELETE | **только I=1** | ⚠ дать только INSERT |
| **`notebooks`** | INSERT, UPDATE, DELETE | **0 политик!** | ⚠ ничего не давать |
| **`notifications`** | INSERT, UPDATE | **только U=1** | ⚠ дать только UPDATE |
| `practices` | INSERT, UPDATE, DELETE | I=1, U=1, D=1 | ✅ оставить |
| **`questions`** | INSERT, UPDATE, DELETE | **0 политик!** | ⚠ ничего не давать |
| `scenarios` | INSERT, UPDATE, DELETE | I=1, U=1, D=1 | ✅ оставить |
| `shop_items` | INSERT, UPDATE, DELETE | ALL=1 (покрывает) | ✅ оставить |

### Подозрительные таблицы

**`notebooks`** и **`questions`** — `rls_on=true`, **0 политик**. Это значит:
- Под `authenticated` любые CRUD возвращают 0 строк / 403 (RLS блокирует без политики).
- Это либо сознательный «lockdown» (как `users_auth`), либо забытая настройка.
- По именам не похоже на «защищённые». Скорее всего — забытые. **Не блокер для SEC-001**, но стоит выписать в backlog: «notebooks/questions — RLS-on без политик: выяснить, нужна ли фича и какие политики писать, или это lockdown».

### Безопасность

✅ Все 13 таблиц с RLS=on — даже если дать «лишний» GRANT, открытой таблицы **не получим**: RLS отфильтрует через отсутствующую политику. Вопрос чисто гигиенический.

### Рекомендованный набор GRANT'ов для 14.3

```sql
GRANT INSERT, UPDATE        ON public.app_settings    TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.cities          TO authenticated;
GRANT INSERT                ON public.course_progress TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.events          TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.goals           TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.meetings        TO authenticated;
GRANT INSERT                ON public.news            TO authenticated;  -- только INSERT
-- notebooks: GRANT не давать (0 политик)
GRANT UPDATE                ON public.notifications   TO authenticated;  -- только UPDATE
GRANT INSERT, UPDATE, DELETE ON public.practices       TO authenticated;
-- questions: GRANT не давать (0 политик)
GRANT INSERT, UPDATE, DELETE ON public.scenarios       TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.shop_items      TO authenticated;

-- profiles, knowledge_base, birthday_templates — отдельной частью 14.3 (PVL и наши новые таблицы)
GRANT INSERT, UPDATE        ON public.profiles        TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.knowledge_base  TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.birthday_templates TO authenticated;

-- PVL шаблон A (8 таблиц)
GRANT INSERT, UPDATE, DELETE ON public.pvl_course_weeks       TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pvl_course_lessons     TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pvl_content_items      TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pvl_content_placements TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pvl_homework_items     TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pvl_calendar_events    TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pvl_faq_items          TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pvl_cohorts            TO authenticated;

-- PVL шаблон B (9 таблиц)
GRANT INSERT, UPDATE, DELETE ON public.pvl_student_homework_submissions          TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pvl_student_course_progress               TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pvl_student_content_progress              TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pvl_checklist_items                       TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pvl_student_certification_scores          TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pvl_student_certification_criteria_scores TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pvl_student_course_points                 TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pvl_student_disputes                      TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pvl_student_questions                     TO authenticated;

-- PVL шаблон C (3 таблицы)
GRANT INSERT, UPDATE, DELETE ON public.pvl_students             TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pvl_garden_mentor_links  TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pvl_mentors              TO authenticated;

-- PVL шаблон D (3 таблицы) — для status_history только INSERT
GRANT INSERT, UPDATE, DELETE ON public.pvl_direct_messages          TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pvl_notifications            TO authenticated;
GRANT INSERT                ON public.pvl_homework_status_history  TO authenticated;
-- UPDATE/DELETE на pvl_homework_status_history НЕ даём — append-only

-- PVL шаблон E
GRANT INSERT                ON public.pvl_audit_log               TO authenticated;
-- UPDATE/DELETE НЕ даём (write-once)
```

---

## Статус

**⏸️ ФАЗА 14 PART 1 ЗАКРЫТА** (14.1 + 14.2 закоммичены).
**🟡 14.3 ЖДЁТ РЕШЕНИЯ ВЛАДЕЛЬЦА** по 4 расхождениям (`news`, `notebooks`, `notifications`, `questions`).

## Открытые вопросы для владельца

1. **`news` — почему только INSERT-политика?** Существуют ли в коде update-новости / delete-новости через PostgREST? Если да — в коде они сейчас возвращают 0 affected. Если хотим починить — добавить UPDATE/DELETE-политики (отдельной задачей).
2. **`notebooks` — почему RLS-on без политик?** Это lockdown или забытая настройка? Если фича активна (фронт читает/пишет notebooks) — она сейчас не работает под authenticated.
3. **`notifications` — почему только UPDATE-политика?** INSERT нужен для системных уведомлений. Сейчас не работает.
4. **`questions` — почему RLS-on без политик?** Аналогично notebooks. Стоит выписать в backlog как **CLEAN-011: разобрать orphaned tables (notebooks, questions, news partial, notifications partial)**.

## Следующий шаг

**Жду подтверждения «идём в 14.3»** с одним из вариантов:
- **(A) Безопасный:** GRANT'ы только под существующие политики (как в моём «рекомендованном» наборе выше).
- **(B) Документный:** GRANT'ы строго как в документе MIGRATION (включая лишние для notebooks/questions/news/notifications). Бесполезные GRANT'ы, но не вредные — RLS отфильтрует.
- **(C) Гибридный:** свой вариант.

После 14.3 — 14.4 (sequences) — это 1 короткий блок, без расхождений.
