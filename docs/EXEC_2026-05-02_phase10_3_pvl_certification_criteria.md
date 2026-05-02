---
title: SEC-001 Phase 10.3 — pvl_student_certification_criteria_scores (JOIN) (execution log)
type: execution-log
phase: "10.3"
created: 2026-05-02
status: ✅ COMMITTED
related_doc: docs/MIGRATION_2026-05-02_security_restoration.md
prev_phase: docs/EXEC_2026-05-02_phase10_2_pvl_student_questions.md
---

# Phase 10.3 — `pvl_student_certification_criteria_scores` (через JOIN) (execution log)

**Время выполнения:** 2026-05-02, ~22:20 MSK.
**Транзакция:** одна, `BEGIN; … COMMIT;` — успешно с первой попытки.
**Результат:** ✅ `pvl_student_certification_criteria_scores` под защитой шаблона B через `EXISTS`-подзапрос на parent-таблицу. Шаблон B полностью применён (10.1 + 10.2 + 10.3 закрыты).

---

## Особенность таблицы

`pvl_student_certification_criteria_scores` — единственная PVL-таблица в шаблоне B, **у которой нет прямого `student_id`**. Owner определяется через FK:
```
certification_score_id  →  pvl_student_certification_scores(id, student_id)
```

Поэтому 4 политики используют `EXISTS (SELECT 1 FROM pvl_student_certification_scores s WHERE s.id = certification_score_id AND …)`. По сути — JOIN с проверкой условия владения на parent-таблице.

---

## SQL

Точно как в [docs/MIGRATION_2026-05-02_security_restoration.md](MIGRATION_2026-05-02_security_restoration.md#103--pvl_student_certification_criteria_scores-через-join):

```sql
BEGIN;

ALTER TABLE public.pvl_student_certification_criteria_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY pvl_student_certification_criteria_scores_select
  ON public.pvl_student_certification_criteria_scores FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pvl_student_certification_scores s
      WHERE s.id = certification_score_id
        AND (s.student_id = auth.uid() OR is_admin() OR public.is_mentor_for(s.student_id))
    )
  );

CREATE POLICY pvl_student_certification_criteria_scores_insert
  ON public.pvl_student_certification_criteria_scores FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pvl_student_certification_scores s
      WHERE s.id = certification_score_id
        AND s.student_id = auth.uid()
    )
  );

CREATE POLICY pvl_student_certification_criteria_scores_update
  ON public.pvl_student_certification_criteria_scores FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pvl_student_certification_scores s
      WHERE s.id = certification_score_id
        AND (s.student_id = auth.uid() OR is_admin() OR public.is_mentor_for(s.student_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pvl_student_certification_scores s
      WHERE s.id = certification_score_id
        AND (s.student_id = auth.uid() OR is_admin() OR public.is_mentor_for(s.student_id))
    )
  );

CREATE POLICY pvl_student_certification_criteria_scores_delete
  ON public.pvl_student_certification_criteria_scores FOR DELETE TO authenticated
  USING (is_admin());

COMMIT;
```

---

## Сырой output psql

```
BEGIN;
BEGIN
ALTER TABLE public.pvl_student_certification_criteria_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE
CREATE POLICY pvl_student_certification_criteria_scores_select ...;
CREATE POLICY
CREATE POLICY pvl_student_certification_criteria_scores_insert ...;
CREATE POLICY
CREATE POLICY pvl_student_certification_criteria_scores_update ...;
CREATE POLICY
CREATE POLICY pvl_student_certification_criteria_scores_delete ...;
CREATE POLICY
COMMIT;
COMMIT
```

**Разбор:**
- `ALTER TABLE` — успех.
- 4 × `CREATE POLICY` — все прошли.
- `COMMIT` — транзакция применена.

---

## Верификации после COMMIT

### (a) RLS включён

```
                  relname                  | rls_enabled
-------------------------------------------+-------------
 pvl_student_certification_criteria_scores | t
(1 row)
```

✅ `rls_enabled=t`.

### (b) 4 политики с правильными cmd

```
                    policyname                    |  cmd
--------------------------------------------------+--------
 pvl_student_certification_criteria_scores_delete | DELETE
 pvl_student_certification_criteria_scores_insert | INSERT
 pvl_student_certification_criteria_scores_select | SELECT
 pvl_student_certification_criteria_scores_update | UPDATE
(4 rows)
```

✅ Имена и команды соответствуют ожидаемому. Заметка: имена короче чем в 10.1/10.2 (без `_own_or_mentor_or_admin` суффикса) — так в документе MIGRATION; внутри предикат всё равно проверяет все три (own/mentor/admin) через JOIN.

### (c) EXISTS-подзапрос на месте

```
                    policyname                    |                        qual_preview
--------------------------------------------------+------------------------------------------------------------
 pvl_student_certification_criteria_scores_delete | is_admin()
 pvl_student_certification_criteria_scores_insert |
 pvl_student_certification_criteria_scores_select | (EXISTS ( SELECT 1                                        +
                                                  |    FROM pvl_student_certification_scores s                +
                                                  |   WHERE ((s.id = pvl_student_certification_criteria_scores
 pvl_student_certification_criteria_scores_update | (EXISTS ( SELECT 1                                        +
                                                  |    FROM pvl_student_certification_scores s                +
                                                  |   WHERE ((s.id = pvl_student_certification_criteria_scores
(4 rows)
```

✅ EXISTS-подзапрос корректно сохранён Postgres'ом:
- `SELECT/UPDATE`: `EXISTS (SELECT 1 FROM pvl_student_certification_scores s WHERE s.id = certification_score_id AND ...)`.
- `INSERT` (в `with_check`, не показано в qual): `EXISTS (...) AND s.student_id = auth.uid()`.
- `DELETE`: `is_admin()`.

📝 **Postgres явно квалифицировал `certification_score_id` как `pvl_student_certification_criteria_scores.certification_score_id`** в сохранённом виде — для disambiguation от потенциального `s.certification_score_id` в подзапросе. Это нормальное поведение, на корректность не влияет.

---

## Что изменилось в проде

**Было:** `pvl_student_certification_criteria_scores` с RLS=off, 0 политик, 0 строк (см. v3 — таблица пуста, фича сертификации не активна).

**Стало:** RLS=on, 4 политики через JOIN, 0 строк (без изменений).

### Логика политик

```
SELECT/UPDATE: EXISTS на parent с (own OR admin OR mentor)
INSERT:        WITH CHECK EXISTS на parent с own (только за себя)
DELETE:        is_admin()
```

### Эффект на роли

| Роль | SELECT/UPDATE | INSERT | DELETE |
|---|---|:---:|:---:|
| Студент (parent.student_id = auth.uid()) | ✓ свои критерии | ✓ только за себя | ✗ |
| Ментор (is_mentor_for(parent.student_id)) | ✓ критерии своих студентов | ✗ | ✗ |
| Админ | ✓ все | ✗ за студента | ✓ |
| `gen_user` | ✓ owner-bypass | ✓ | ✓ |

### Эффект на производительность

**Каждый запрос к `pvl_student_certification_criteria_scores`** теперь делает подзапрос на `pvl_student_certification_scores` (на одной строке через `s.id = certification_score_id`). Это:
- Один lookup по PK `pvl_student_certification_scores.id` — быстро.
- Plus вызов `is_mentor_for(uuid)` — STABLE, кэшируется в пределах запроса.
- Plus `is_admin()` — STABLE, тоже кэшируется.

На 0 строк сейчас разницы нет. При активации фичи сертификации производительность будет приемлемой за счёт PK lookup в подзапросе.

---

## Шаблон B — итог

Завершено 3 подфазы шаблона B (свои данные ученика):

| Подфаза | Таблиц | Политик | Особенность |
|---|---:|---:|---|
| 10.1 | 7 | 28 | UUID-id, через `DO FOREACH` |
| 10.2 | 1 | 4 | TEXT-id, два cast'а (`::text` и `::uuid`) |
| 10.3 | 1 | 4 | Без прямого `student_id`, через JOIN на parent |
| **Итого** | **9** | **36** | |

Все 9 student-data-таблиц защищены. Шаблон B обеспечивает: студент видит/правит свои строки, ментор — строки своих студентов, админ — все, удаление — только админ.

---

## Уроки

### Урок 10: `EXISTS` в RLS для таблиц без прямого owner-id

Когда у таблицы нет колонки-владельца, но есть FK на parent-таблицу с владельцем — RLS пишется через `EXISTS (SELECT 1 FROM parent WHERE parent.pk = child.fk AND <owner-condition>)`. Postgres сохраняет это в `pg_policies.qual` как `(EXISTS (...))`.

⚠ **Уязвимость к производительности.** Если parent-таблица большая или подзапрос содержит JOIN'ы — каждый row-check может дорогим. На статической parent (как `pvl_student_certification_scores`) с PK lookup — приемлемо. Для глубоких иерархий (`grandparent → parent → child`) лучше денормализовать `student_id` или использовать материализованное представление.

В нашем случае:
- `pvl_student_certification_criteria_scores` (child) → `pvl_student_certification_scores` (parent) — одно вложение, по PK. Дёшево.

### Урок 11: Postgres квалифицирует имена колонок при сохранении политики

В исходном SQL мы писали `s.id = certification_score_id` (где `certification_score_id` — колонка table-being-policied). Postgres сохранил как `s.id = pvl_student_certification_criteria_scores.certification_score_id` — добавил префикс таблицы для disambiguation. Это нормально, не меняет семантику.

---

## Статус

**✅ ФАЗА 10.3 ЗАКРЫТА.** Шаблон B полностью применён к 9 таблицам.

## Следующий шаг

**Жду подтверждения «идём в фазу 11»** — PVL шаблон C (реестр PVL): `pvl_students`, `pvl_garden_mentor_links`, `pvl_mentors`. У `pvl_mentors` будет применён шаблон A (а не C — см. правку 2 в v6, обоснование: `pvl_mentors.id ≠ auth.uid()` ментора, таблица — оторванный справочник).
