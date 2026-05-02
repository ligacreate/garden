---
title: SEC-001 Phase 10.2 — pvl_student_questions (TEXT-id) (execution log)
type: execution-log
phase: "10.2"
created: 2026-05-02
status: ✅ COMMITTED
related_doc: docs/MIGRATION_2026-05-02_security_restoration.md
prev_phase: docs/EXEC_2026-05-02_phase10_1_pvl_template_B_uuid.md
---

# Phase 10.2 — `pvl_student_questions` (TEXT-id) (execution log)

**Время выполнения:** 2026-05-02, ~22:10 MSK.
**Транзакция:** одна, `BEGIN; … COMMIT;` — успешно с первой попытки.
**Smoke:** не требовался (4 политики проверены явной верификацией).
**Результат:** ✅ `pvl_student_questions` под защитой шаблона B с двойными cast'ами.

---

## Особенность таблицы

`pvl_student_questions` — единственная PVL-таблица в шаблоне B, у которой все идентификаторы — **TEXT**, а не UUID:
- `student_id text`
- `assigned_mentor_id text`
- `resolved_by text`

Поэтому 4 политики написаны индивидуально (не через `DO FOREACH`-луп) с двумя cast'ами:

| Cast | Назначение |
|---|---|
| `auth.uid()::text` | привести UUID `auth.uid()` к TEXT для сравнения с `student_id text` |
| `student_id::uuid` | привести TEXT `student_id` к UUID для передачи в `is_mentor_for(uuid)` |

⚠ **Условие.** `student_id::uuid` упадёт, если в строке невалидный UUID. Это приемлемо: невалидные значения не должны попадать в живую таблицу. На текущий момент в `pvl_student_questions` 5 строк (см. v3).

---

## SQL

Точно как в [docs/MIGRATION_2026-05-02_security_restoration.md](MIGRATION_2026-05-02_security_restoration.md#102--text-таблица-pvl_student_questions):

```sql
BEGIN;

ALTER TABLE public.pvl_student_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY pvl_student_questions_select_own_or_mentor_or_admin
  ON public.pvl_student_questions FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()::text
    OR is_admin()
    OR public.is_mentor_for(student_id::uuid)
  );

CREATE POLICY pvl_student_questions_insert_own
  ON public.pvl_student_questions FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid()::text);

CREATE POLICY pvl_student_questions_update_own_or_mentor_or_admin
  ON public.pvl_student_questions FOR UPDATE TO authenticated
  USING (
    student_id = auth.uid()::text
    OR is_admin()
    OR public.is_mentor_for(student_id::uuid)
  )
  WITH CHECK (
    student_id = auth.uid()::text
    OR is_admin()
    OR public.is_mentor_for(student_id::uuid)
  );

CREATE POLICY pvl_student_questions_delete_admin
  ON public.pvl_student_questions FOR DELETE TO authenticated
  USING (is_admin());

COMMIT;
```

---

## Сырой output psql

```
BEGIN;
BEGIN
ALTER TABLE public.pvl_student_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE
CREATE POLICY pvl_student_questions_select_own_or_mentor_or_admin ...;
CREATE POLICY
CREATE POLICY pvl_student_questions_insert_own ...;
CREATE POLICY
CREATE POLICY pvl_student_questions_update_own_or_mentor_or_admin ...;
CREATE POLICY
CREATE POLICY pvl_student_questions_delete_admin ...;
CREATE POLICY
COMMIT;
COMMIT
```

**Разбор:**
- `ALTER TABLE` — успех.
- 4 × `CREATE POLICY` — все прошли. Postgres приняла оба cast'а в предикатах.
- `COMMIT` — транзакция применена.

---

## Верификации после COMMIT

### (a) RLS включён

```
        relname        | rls_enabled
-----------------------+-------------
 pvl_student_questions | t
(1 row)
```

✅ `rls_enabled=t`.

### (b) 4 политики с правильными командами

```
                     policyname                      |  cmd
-----------------------------------------------------+--------
 pvl_student_questions_delete_admin                  | DELETE
 pvl_student_questions_insert_own                    | INSERT
 pvl_student_questions_select_own_or_mentor_or_admin | SELECT
 pvl_student_questions_update_own_or_mentor_or_admin | UPDATE
(4 rows)
```

✅ Имена и команды точно совпадают с ожидаемыми.

### (c) Cast'ы в `qual` / `with_check`

```
                     policyname                      |                                   qual_preview                                   |                                with_check_preview
-----------------------------------------------------+----------------------------------------------------------------------------------+----------------------------------------------------------------------------------
 pvl_student_questions_delete_admin                  | is_admin()                                                                       |
 pvl_student_questions_insert_own                    |                                                                                  | (student_id = (auth.uid())::text)
 pvl_student_questions_select_own_or_mentor_or_admin | ((student_id = (auth.uid())::text) OR is_admin() OR is_mentor_for((student_id):: |
 pvl_student_questions_update_own_or_mentor_or_admin | ((student_id = (auth.uid())::text) OR is_admin() OR is_mentor_for((student_id):: | ((student_id = (auth.uid())::text) OR is_admin() OR is_mentor_for((student_id)::
(4 rows)
```

✅ **Cast'ы корректно сохранены Postgres'ом:**
- `(auth.uid())::text` — UUID `auth.uid()` приведён к TEXT для сравнения с `student_id text`.
- `is_mentor_for((student_id)::uuid)` — TEXT `student_id` приведён к UUID для передачи в функцию `is_mentor_for(uuid)`.

Postgres расставил скобки вокруг `auth.uid()` и `student_id` (явно показывает, что cast применяется к результату функции / к колонке), это его нормальное форматирование.

---

## Что изменилось в проде

**Было:** `pvl_student_questions` с RLS=off, 0 политик.

**Стало:** RLS=on, 4 политики (шаблон B с TEXT-id), 5 строк (как в v3).

### Логика политик (с cast'ами)

```
SELECT/UPDATE: USING (
    student_id = auth.uid()::text
    OR is_admin()
    OR is_mentor_for(student_id::uuid)
)
INSERT:        WITH CHECK (student_id = auth.uid()::text)
DELETE:        USING (is_admin())
```

### Эффект на роли

Тот же что в 10.1, но через TEXT-сравнение:

| Роль | SELECT/UPDATE | INSERT | DELETE |
|---|---|:---:|:---:|
| Студент (auth.uid::text = student_id) | ✓ свои вопросы | ✓ только за себя | ✗ |
| Ментор (is_mentor_for(student_id::uuid)) | ✓ вопросы своих студентов | ✗ | ✗ |
| Админ | ✓ все | ✗ за студента | ✓ |
| `gen_user` | ✓ owner-bypass | ✓ | ✓ |

### Риск с invalid UUID в `student_id::uuid`

Если в строке `student_id` — невалидный UUID, при вызове `student_id::uuid` Postgres бросит ошибку `invalid input syntax for type uuid`. Это значит:
- Строка не пройдёт через политику (исключение → доступ запрещён).
- Если такая строка существует — её увидит **только** через owner-bypass (`gen_user`/`postgres`).

На текущий момент в `pvl_student_questions` 5 строк — все, вероятно, имеют валидный UUID (это конвенция приложения, см. v3). Если когда-нибудь появится невалидное значение — оно автоматически «исчезнет» для пользовательских ролей. Это безопасный fail-closed.

---

## Уроки

### Урок 9: TEXT-id и `auth.uid()` — двойной cast

Когда таблица использует TEXT-id, а `auth.uid()` возвращает UUID:
- Сравнение в `=` требует cast одной из сторон. Принят `auth.uid()::text`, потому что `auth.uid()` стабильнее (а конвертировать колонку каждый раз дороже, и нельзя `student_id::uuid = auth.uid()` если `student_id` — невалидный UUID — упадёт ещё на cast'е).
- Функция `is_mentor_for(uuid)` принимает UUID — нужен `student_id::uuid`. Это **может упасть** на невалидном `student_id`. Это ОК для fail-closed-семантики.

Postgres в `pg_policies.qual` сохранит эти cast'ы как `(auth.uid())::text` и `(student_id)::uuid`.

---

## Статус

**✅ ФАЗА 10.2 ЗАКРЫТА.** `pvl_student_questions` под защитой шаблона B с двойными cast'ами. 4 политики работают.

## Следующий шаг

**Жду подтверждения «идём в фазу 10.3»** — `pvl_student_certification_criteria_scores` (через JOIN на `pvl_student_certification_scores.student_id`). У этой таблицы нет прямого `student_id` — owner определяется через `certification_score_id → pvl_student_certification_scores.student_id`. 4 политики с `EXISTS (SELECT 1 FROM pvl_student_certification_scores s WHERE s.id = certification_score_id AND …)`.
