---
title: SEC-001 Phase 9 — PVL Шаблон A (контент курса, 8 таблиц) (execution log)
type: execution-log
phase: 9
created: 2026-05-02
status: ✅ COMMITTED
related_doc: docs/MIGRATION_2026-05-02_security_restoration.md
prev_phase: docs/EXEC_2026-05-02_phase8_birthday_templates.md
---

# Phase 9 — PVL Шаблон A: контент курса (execution log)

**Время выполнения:** 2026-05-02, ~21:50 MSK.
**Транзакция:** одна, `BEGIN; … COMMIT;` — успешно с первой попытки.
**Smoke:** прошёл (32 политики).
**Результат:** ✅ 8 таблиц контента курса под защитой: чтение всем `authenticated`, CRUD только админу через `is_admin()`. Применён через `DO FOREACH` луп.

---

## Покрытые таблицы (8)

| # | Таблица | Назначение |
|---:|---|---|
| 1 | `pvl_course_weeks` | Недели курса |
| 2 | `pvl_course_lessons` | Уроки внутри недель |
| 3 | `pvl_content_items` | Материалы курса (видео/текст/чек-листы) |
| 4 | `pvl_content_placements` | Размещение материалов по разделам/когортам |
| 5 | `pvl_homework_items` | Задания ДЗ |
| 6 | `pvl_calendar_events` | События календаря курса |
| 7 | `pvl_faq_items` | FAQ |
| 8 | `pvl_cohorts` | Когорты (потоки) |

Все — справочники / общий контент: должны быть видимы всем залогиненным, редактироваться только админом.

---

## SQL

Точно как в [docs/MIGRATION_2026-05-02_security_restoration.md](MIGRATION_2026-05-02_security_restoration.md#фаза-9--шаблон-a-контент-курса-8-таблиц):

```sql
BEGIN;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'pvl_course_weeks','pvl_course_lessons','pvl_content_items','pvl_content_placements',
    'pvl_homework_items','pvl_calendar_events','pvl_faq_items','pvl_cohorts'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
                   t || '_select_all', t);

    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (is_admin())',
                   t || '_insert_admin', t);

    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin())',
                   t || '_update_admin', t);

    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (is_admin())',
                   t || '_delete_admin', t);
  END LOOP;
END $$;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public'
     AND tablename = ANY(ARRAY['pvl_course_weeks','pvl_course_lessons','pvl_content_items',
       'pvl_content_placements','pvl_homework_items','pvl_calendar_events','pvl_faq_items','pvl_cohorts']);
  IF n <> 32 THEN RAISE EXCEPTION 'Шаблон A: expected 32 policies, got %', n; END IF;
END $$;

COMMIT;
```

---

## Сырой output psql

```
BEGIN;
BEGIN
DO $$ DECLARE t text; tables text[] := ARRAY[...]; BEGIN FOREACH t IN ARRAY tables LOOP ... END LOOP; END $$;
DO
DO $$ DECLARE n int; BEGIN SELECT count(*) INTO n ...; IF n <> 32 THEN RAISE ...; END IF; END $$;
DO
COMMIT;
COMMIT
```

**Разбор:**
- Первый DO-блок: `FOREACH` по 8 таблицам, для каждой 1 ALTER TABLE + 4 CREATE POLICY. Итого: **8 ALTER + 32 CREATE POLICY**, все упакованы в один DO. Завершение — `DO`.
- Второй DO-блок: smoke на ровно 32 политики. Завершение — `DO`.
- `COMMIT` — транзакция применена.

---

## Верификации после COMMIT

### (a) RLS-status — все 8 таблиц

```
        relname         | rls_enabled
------------------------+-------------
 pvl_calendar_events    | t
 pvl_cohorts            | t
 pvl_content_items      | t
 pvl_content_placements | t
 pvl_course_lessons     | t
 pvl_course_weeks       | t
 pvl_faq_items          | t
 pvl_homework_items     | t
(8 rows)
```

✅ Все 8 — `rls_enabled=t`.

### (b) По 4 политики на каждой

```
       tablename        | n
------------------------+---
 pvl_calendar_events    | 4
 pvl_cohorts            | 4
 pvl_content_items      | 4
 pvl_content_placements | 4
 pvl_course_lessons     | 4
 pvl_course_weeks       | 4
 pvl_faq_items          | 4
 pvl_homework_items     | 4
(8 rows)
```

✅ 8 × 4 = **32 политики**.

### (c) Имена и команды

```
       tablename        |             policyname              |  cmd
------------------------+-------------------------------------+--------
 pvl_calendar_events    | pvl_calendar_events_delete_admin    | DELETE
 pvl_calendar_events    | pvl_calendar_events_insert_admin    | INSERT
 pvl_calendar_events    | pvl_calendar_events_select_all      | SELECT
 pvl_calendar_events    | pvl_calendar_events_update_admin    | UPDATE
 pvl_cohorts            | pvl_cohorts_delete_admin            | DELETE
 pvl_cohorts            | pvl_cohorts_insert_admin            | INSERT
 pvl_cohorts            | pvl_cohorts_select_all              | SELECT
 pvl_cohorts            | pvl_cohorts_update_admin            | UPDATE
 pvl_content_items      | pvl_content_items_delete_admin      | DELETE
 pvl_content_items      | pvl_content_items_insert_admin      | INSERT
 pvl_content_items      | pvl_content_items_select_all        | SELECT
 pvl_content_items      | pvl_content_items_update_admin      | UPDATE
 pvl_content_placements | pvl_content_placements_delete_admin | DELETE
 pvl_content_placements | pvl_content_placements_insert_admin | INSERT
 pvl_content_placements | pvl_content_placements_select_all   | SELECT
 pvl_content_placements | pvl_content_placements_update_admin | UPDATE
 pvl_course_lessons     | pvl_course_lessons_delete_admin     | DELETE
 pvl_course_lessons     | pvl_course_lessons_insert_admin     | INSERT
 pvl_course_lessons     | pvl_course_lessons_select_all       | SELECT
 pvl_course_lessons     | pvl_course_lessons_update_admin     | UPDATE
 pvl_course_weeks       | pvl_course_weeks_delete_admin       | DELETE
 pvl_course_weeks       | pvl_course_weeks_insert_admin       | INSERT
 pvl_course_weeks       | pvl_course_weeks_select_all         | SELECT
 pvl_course_weeks       | pvl_course_weeks_update_admin       | UPDATE
 pvl_faq_items          | pvl_faq_items_delete_admin          | DELETE
 pvl_faq_items          | pvl_faq_items_insert_admin          | INSERT
 pvl_faq_items          | pvl_faq_items_select_all            | SELECT
 pvl_faq_items          | pvl_faq_items_update_admin          | UPDATE
 pvl_homework_items     | pvl_homework_items_delete_admin     | DELETE
 pvl_homework_items     | pvl_homework_items_insert_admin     | INSERT
 pvl_homework_items     | pvl_homework_items_select_all       | SELECT
 pvl_homework_items     | pvl_homework_items_update_admin     | UPDATE
(32 rows)
```

✅ Каждая таблица имеет ровно 4 политики:
- `<table>_select_all` — SELECT
- `<table>_insert_admin` — INSERT
- `<table>_update_admin` — UPDATE
- `<table>_delete_admin` — DELETE

Имена консистентны, типы команд корректны.

---

## Что изменилось в проде

**Было:** 8 таблиц с RLS=off, 0 политик. Под `gen_user` (owner) — все CRUD; под `web_anon`/`authenticated` — нет GRANT'ов, но никаких RLS-ограничений (фактически ходили через PUBLIC GRANT).

**Стало:** RLS=on, 4 политики на каждой таблице. Защита по ролям.

### Эффект на роли

| Роль | SELECT | INSERT/UPDATE/DELETE |
|---|:---:|:---:|
| `gen_user` (owner) | ✓ (owner-bypass) | ✓ (owner-bypass) |
| `postgres` (super) | ✓ | ✓ |
| `authenticated` без admin | ✓ (`true`) | ✗ (`is_admin()` = false) |
| `authenticated` + admin | ✓ | ✓ |
| `web_anon` | ✗ | ✗ |

### Эффект на фронт

После открытия Caddy и работы фронта под `authenticated`:
- Студент / ментор могут читать материалы курса, недели, FAQ, календарь.
- Только админ может через админ-панель/учительскую добавлять/изменять/удалять.
- web_anon (без логина) ничего не видит — так и должно быть.

### Эффект на бекенд

`gen_user` через owner-bypass продолжит работать без ограничений. PVL-сервисы фронта (через `pvlPostgrestApi.js`) могут читать всё (политика `_select_all`), но писать только под админом.

---

## Уроки

### Урок 6: `DO FOREACH … format(%I)` — рабочий паттерн для массовых RLS-политик

Использование `format('CREATE POLICY %I ON public.%I …', name, table)` с `%I`-quoting для идентификаторов работает корректно. 8 таблиц × 4 политики обработаны одним блоком, без копипасты SQL-блоков на каждую таблицу.

Этот же паттерн будет использован в фазе 10.1 (PVL шаблон B на 7 UUID-таблицах).

---

## Статус

**✅ ФАЗА 9 ЗАКРЫТА.** 32 политики созданы, шаблон A применён ко всем 8 таблицам контента курса.

## Следующий шаг

**Жду подтверждения «идём в фазу 10»** — PVL шаблон B (свои данные ученика). Состоит из 3 подфаз:
- **10.1** — 7 UUID-таблиц через `DO FOREACH` (`pvl_student_homework_submissions`, `pvl_student_course_progress`, `pvl_student_content_progress`, `pvl_checklist_items`, `pvl_student_certification_scores`, `pvl_student_course_points`, `pvl_student_disputes`)
- **10.2** — `pvl_student_questions` (TEXT id'шник, нужен cast `auth.uid()::text`, особый случай)
- **10.3** — `pvl_student_certification_criteria_scores` (через JOIN на `pvl_student_certification_scores`)

Будут использовать `is_mentor_for(uuid)` (из фазы 3) и `is_admin()`.
