---
title: SEC-001 Phase 10.1 — PVL Шаблон B (UUID-таблицы со student_id, 7 шт.) (execution log)
type: execution-log
phase: "10.1"
created: 2026-05-02
status: ✅ COMMITTED
related_doc: docs/MIGRATION_2026-05-02_security_restoration.md
prev_phase: docs/EXEC_2026-05-02_phase9_pvl_template_A.md
---

# Phase 10.1 — PVL Шаблон B: UUID-таблицы со student_id (execution log)

**Время выполнения:** 2026-05-02, ~22:00 MSK.
**Транзакция:** одна, `BEGIN; … COMMIT;` — успешно с первой попытки.
**Smoke:** прошёл (≥28 политик).
**Результат:** ✅ 7 таблиц данных ученика под защитой шаблона B: студент видит/правит свои строки, ментор — строки своих студентов, админ — все. Удаление — только админ. Две старые no-op политики (`_all`, `_student`) удалены.

---

## Покрытые таблицы (7)

Все имеют `student_id uuid` с FK на `pvl_students(id)`:

| # | Таблица | Назначение |
|---:|---|---|
| 1 | `pvl_student_homework_submissions` | Сданные ДЗ |
| 2 | `pvl_student_course_progress` | Прогресс по неделям |
| 3 | `pvl_student_content_progress` | Прогресс по материалам |
| 4 | `pvl_checklist_items` | Отмеченные чек-листы |
| 5 | `pvl_student_certification_scores` | Сертификационные оценки |
| 6 | `pvl_student_course_points` | Баллы курса |
| 7 | `pvl_student_disputes` | Споры по проверкам |

---

## SQL

Точно как в [docs/MIGRATION_2026-05-02_security_restoration.md](MIGRATION_2026-05-02_security_restoration.md#101--uuid-таблицы-со-student_id-напрямую-7-шт) (с правкой 1 — скобки в smoke):

```sql
BEGIN;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'pvl_student_homework_submissions','pvl_student_course_progress',
    'pvl_student_content_progress','pvl_checklist_items',
    'pvl_student_certification_scores','pvl_student_course_points','pvl_student_disputes'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- Чистим no-op политики ALL with qual=true, если есть
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_all', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_student', t);

    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
      USING (student_id = auth.uid() OR is_admin() OR public.is_mentor_for(student_id))$f$,
      t || '_select_own_or_mentor_or_admin', t);

    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
      WITH CHECK (student_id = auth.uid())$f$, t || '_insert_own', t);

    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
      USING (student_id = auth.uid() OR is_admin() OR public.is_mentor_for(student_id))
      WITH CHECK (student_id = auth.uid() OR is_admin() OR public.is_mentor_for(student_id))$f$,
      t || '_update_own_or_mentor_or_admin', t);

    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (is_admin())',
                   t || '_delete_admin', t);
  END LOOP;
END $$;

-- Smoke: 7 таблиц × 4 политики = 28 (с правкой 1 — OR-ветки в скобках)
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public'
     AND tablename = ANY(ARRAY['pvl_student_homework_submissions','pvl_student_course_progress',
       'pvl_student_content_progress','pvl_checklist_items','pvl_student_certification_scores',
       'pvl_student_course_points','pvl_student_disputes'])
     AND (
       policyname LIKE '%_own_or_mentor_or_admin'
       OR policyname LIKE '%_insert_own'
       OR policyname LIKE '%_delete_admin'
     );
  IF n < 28 THEN RAISE EXCEPTION 'Шаблон B (UUID): ожидалось ≥28 политик, получено %', n; END IF;
END $$;

COMMIT;
```

---

## Сырой output psql (с NOTICE-сообщениями)

```
BEGIN;
BEGIN
DO $outer$ ... END $outer$;
NOTICE:  policy "pvl_student_homework_submissions_all" for relation "public.pvl_student_homework_submissions" does not exist, skipping
NOTICE:  policy "pvl_student_homework_submissions_student" for relation "public.pvl_student_homework_submissions" does not exist, skipping
NOTICE:  policy "pvl_student_course_progress_all" for relation "public.pvl_student_course_progress" does not exist, skipping
NOTICE:  policy "pvl_student_course_progress_student" for relation "public.pvl_student_course_progress" does not exist, skipping
NOTICE:  policy "pvl_student_content_progress_all" for relation "public.pvl_student_content_progress" does not exist, skipping
NOTICE:  policy "pvl_checklist_items_student" for relation "public.pvl_checklist_items" does not exist, skipping
NOTICE:  policy "pvl_student_certification_scores_all" for relation "public.pvl_student_certification_scores" does not exist, skipping
NOTICE:  policy "pvl_student_certification_scores_student" for relation "public.pvl_student_certification_scores" does not exist, skipping
NOTICE:  policy "pvl_student_course_points_all" for relation "public.pvl_student_course_points" does not exist, skipping
NOTICE:  policy "pvl_student_course_points_student" for relation "public.pvl_student_course_points" does not exist, skipping
NOTICE:  policy "pvl_student_disputes_all" for relation "public.pvl_student_disputes" does not exist, skipping
NOTICE:  policy "pvl_student_disputes_student" for relation "public.pvl_student_disputes" does not exist, skipping
DO
DO $$ ... smoke ...; END $$;
DO
COMMIT;
COMMIT
```

**Разбор:**
- Первый DO — основной блок: `FOREACH` по 7 таблицам, для каждой 1 ALTER TABLE + 2 DROP POLICY IF EXISTS + 4 CREATE POLICY.
- 12 NOTICE-сообщений — `DROP POLICY IF EXISTS` для несуществующих политик (это нормальное поведение `IF EXISTS`). Показывает, что у каждой таблицы попробовали удалить и `_all`, и `_student`. Реально удалены только 2:
  - `pvl_checklist_items_all` (была no-op `qual=true` из v1 — DROP без NOTICE = удалена)
  - `pvl_student_content_progress_student` (была no-op `qual=true` из v3 — DROP без NOTICE = удалена)
- Второй DO — smoke на ≥28 политик, прошёл.
- `COMMIT` — успех.

---

## Верификации после COMMIT

### (a) RLS-status — все 7 таблиц

```
             relname              | rls_enabled
----------------------------------+-------------
 pvl_checklist_items              | t
 pvl_student_certification_scores | t
 pvl_student_content_progress     | t
 pvl_student_course_points        | t
 pvl_student_course_progress      | t
 pvl_student_disputes             | t
 pvl_student_homework_submissions | t
(7 rows)
```

✅ Все 7 — `rls_enabled=t`.

### (b) 4 политики на каждой таблице

```
            tablename             | n
----------------------------------+---
 pvl_checklist_items              | 4
 pvl_student_certification_scores | 4
 pvl_student_content_progress     | 4
 pvl_student_course_points        | 4
 pvl_student_course_progress      | 4
 pvl_student_disputes             | 4
 pvl_student_homework_submissions | 4
(7 rows)
```

✅ 7 × 4 = **28 политик**. У каждой таблицы консистентный набор имён:
- `<table>_select_own_or_mentor_or_admin`
- `<table>_insert_own`
- `<table>_update_own_or_mentor_or_admin`
- `<table>_delete_admin`

### (c) Старых no-op политик не осталось

```
 tablename | policyname
-----------+------------
(0 rows)
```

✅ Старые `pvl_checklist_items_all` (qual=true) и `pvl_student_content_progress_student` (qual=true) из v1/v3 — удалены.

---

## Что изменилось в проде

**Было:**
- 5 из 7 таблиц с RLS=off, 0 политик.
- `pvl_checklist_items` с RLS=on, 1 no-op политикой (`_all` qual=true).
- `pvl_student_content_progress` с RLS=on, 1 no-op политикой (`_student` qual=true).

**Стало:** Все 7 — RLS=on, 4 политики (шаблон B). No-op политики удалены.

### Логика политик

```
SELECT/UPDATE: USING (student_id = auth.uid() OR is_admin() OR is_mentor_for(student_id))
INSERT:        WITH CHECK (student_id = auth.uid())
DELETE:        USING (is_admin())
```

### Эффект на роли

| Роль | SELECT | INSERT | UPDATE | DELETE |
|---|:---:|:---:|:---:|:---:|
| `gen_user` (owner) | ✓ (owner-bypass) | ✓ | ✓ | ✓ |
| `postgres` (super) | ✓ | ✓ | ✓ | ✓ |
| Студент (`auth.uid() = student_id`) | ✓ свои строки | ✓ только свои | ✓ свои | ✗ |
| Ментор (`is_mentor_for(student_id) = true`) | ✓ строки своих студентов | ✗ | ✓ строки своих студентов | ✗ |
| Админ (`is_admin() = true`) | ✓ все | ✗ (INSERT только за себя) | ✓ все | ✓ все |
| `web_anon` | ✗ | ✗ | ✗ | ✗ |

**Тонкий момент:** админ не может INSERT'ить «за студента» — `WITH CHECK (student_id = auth.uid())` ограничивает создание только своими записями. Это **сознательное ограничение шаблона B**: данные ученика должен вносить сам ученик. Если админу нужно создать запись за студента — отдельной задачей либо через `gen_user` (owner-bypass), либо отдельной admin-политикой.

### Эффект на фронт

- Студент в кабинете видит свои оценки, прогресс, ДЗ — всё через шаблон B.
- Ментор в учительской видит ДЗ/прогресс **только своих** студентов (через `is_mentor_for()`).
- Админ видит всё.
- web_anon → ничего.

---

## Уроки

### Урок 7: `DROP POLICY IF EXISTS` шумит NOTICE'ами, но не падает

При `DROP POLICY IF EXISTS x ON t` для несуществующей политики Postgres шлёт `NOTICE: policy "x" ... does not exist, skipping`, но не ошибку. Это позволяет писать «defensive» SQL-блоки, безопасные при повторных прогонах.

В данной фазе из 14 попыток DROP'а реально удалились 2 политики, остальные 12 дали NOTICE — это ожидаемо.

### Урок 8: `DO $outer$ … END $outer$;` для именованного блока

Внутри DO-блока, который сам содержит `$f$` (для `EXECUTE format`), нельзя использовать обычный `$$` — Postgres путается. Использован `$outer$ … $outer$` для внешнего блока. Альтернатива в документе MIGRATION — `$$ … $$`, но при наличии вложенного `$f$` нужен другой dollar-tag.

При исполнении этой фазы я использовал `$outer$` для внешнего DO. Если в документе MIGRATION стоит `$$ … $$` — нужно проверить, не возникает ли конфликта при копи-пасте. (В моём запуске конфликта не было, потому что я заменил.)

---

## Статус

**✅ ФАЗА 10.1 ЗАКРЫТА.** 28 политик созданы, 2 no-op удалены. Шаблон B применён к 7 UUID-таблицам.

## Следующий шаг

**Жду подтверждения «идём в фазу 10.2»** — `pvl_student_questions` (TEXT-id, особый случай). Будет одна транзакция с 4 политиками, использующими cast `auth.uid()::text` и `student_id::uuid`.
