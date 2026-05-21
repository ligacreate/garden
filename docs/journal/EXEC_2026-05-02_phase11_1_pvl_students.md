---
title: SEC-001 Phase 11.1 — pvl_students (шаблон C) (execution log)
type: execution-log
phase: "11.1"
created: 2026-05-02
status: ✅ COMMITTED
related_doc: docs/MIGRATION_2026-05-02_security_restoration.md
prev_phase: docs/EXEC_2026-05-02_phase10_3_pvl_certification_criteria.md
---

# Phase 11.1 — `pvl_students` (шаблон C) (execution log)

**Время выполнения:** 2026-05-02, ~22:30 MSK.
**Транзакция:** одна, `BEGIN; … COMMIT;` — успешно с первой попытки.
**Результат:** ✅ `pvl_students` под защитой шаблона C: студент видит свою строку, ментор — своих студентов, админ — все. Запись только админ.

---

## SQL

Точно как в [docs/MIGRATION_2026-05-02_security_restoration.md](MIGRATION_2026-05-02_security_restoration.md#111--pvl_students):

```sql
BEGIN;

ALTER TABLE public.pvl_students ENABLE ROW LEVEL SECURITY;

CREATE POLICY pvl_students_select_own_or_mentor_or_admin
  ON public.pvl_students FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR is_admin()
    OR public.is_mentor_for(id)
  );

CREATE POLICY pvl_students_insert_admin
  ON public.pvl_students FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY pvl_students_update_admin
  ON public.pvl_students FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY pvl_students_delete_admin
  ON public.pvl_students FOR DELETE TO authenticated
  USING (is_admin());

COMMIT;
```

---

## Сырой output psql

```
BEGIN;
BEGIN
ALTER TABLE public.pvl_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE
CREATE POLICY pvl_students_select_own_or_mentor_or_admin ...;
CREATE POLICY
CREATE POLICY pvl_students_insert_admin ...;
CREATE POLICY
CREATE POLICY pvl_students_update_admin ...;
CREATE POLICY
CREATE POLICY pvl_students_delete_admin ...;
CREATE POLICY
COMMIT;
COMMIT
```

---

## Верификации после COMMIT

### (a) RLS включён

```
   relname    | rls_enabled
--------------+-------------
 pvl_students | t
(1 row)
```

✅ `rls_enabled=t`.

### (b) 4 политики с правильными cmd

```
                 policyname                 |  cmd
--------------------------------------------+--------
 pvl_students_delete_admin                  | DELETE
 pvl_students_insert_admin                  | INSERT
 pvl_students_select_own_or_mentor_or_admin | SELECT
 pvl_students_update_admin                  | UPDATE
(4 rows)
```

✅ Имена и команды соответствуют ожидаемому. Шаблон C: SELECT расширенный (own/mentor/admin), CRUD только admin.

### (c) Тело SELECT-политики

```
                 policyname                 |                          qual
--------------------------------------------+--------------------------------------------------------
 pvl_students_select_own_or_mentor_or_admin | ((id = auth.uid()) OR is_admin() OR is_mentor_for(id))
(1 row)
```

✅ Все три предиката на месте:
- `id = auth.uid()` — студент видит свою строку (`pvl_students.id = profiles.id` контракт из v6)
- `is_admin()` — админ видит все
- `is_mentor_for(id)` — ментор видит своих студентов через `pvl_garden_mentor_links`

### (d) Owner-bypass: gen_user видит все 23 строки

```
 pvl_students_count
--------------------
                 23
(1 row)
```

✅ 23 строки (как в v3/v4). `gen_user` через owner-bypass читает всё.

---

## Что изменилось в проде

**Было:** `pvl_students` с RLS=off, 0 политик, 23 строки.

**Стало:** RLS=on, 4 политики (шаблон C), 23 строки (без изменений).

### Логика политик

```
SELECT: USING (id = auth.uid() OR is_admin() OR is_mentor_for(id))
INSERT: WITH CHECK (is_admin())
UPDATE: USING + WITH CHECK is_admin()
DELETE: USING (is_admin())
```

### Эффект на роли

| Роль | SELECT | INSERT | UPDATE | DELETE |
|---|:---:|:---:|:---:|:---:|
| `gen_user` (owner) | ✓ owner-bypass | ✓ | ✓ | ✓ |
| `postgres` (super) | ✓ | ✓ | ✓ | ✓ |
| Студент (`auth.uid() = pvl_students.id`) | ✓ свою строку | ✗ | ✗ | ✗ |
| Ментор (`is_mentor_for(id)`) | ✓ своих студентов | ✗ | ✗ | ✗ |
| Админ | ✓ всех | ✓ | ✓ | ✓ |
| `web_anon` | ✗ | ✗ | ✗ | ✗ |

### Что увидит каждая роль на текущих 23 строках

- **22 «реальных» студента** (есть в `profiles`, см. v4): студент видит **только** свою строку. Ментор (5 действующих) видит свои **3–4 строки** (по 4 студента у большинства, 3 — у одного, см. v6). Админ видит все 23.
- **1 «Участница»** (`33333…01`, тестовая фикстура без `profiles`/`auth`): не виден никому, кроме админа (admin видит всё) и owner (gen_user через bypass). Это и хотели — фикстура не должна светиться в UI.

### Эффект на учительскую (`syncPvlActorsFromGarden`)

Фронт вызывает `pvlPostgrestApi.listStudents()` (см. [services/pvlPostgrestApi.js:511](../services/pvlPostgrestApi.js#L511)) — это `SELECT * FROM pvl_students`. После открытия Caddy:
- Под админом (Олга/Анастасия/Ирина) — вернутся все 23.
- Под ментором — вернутся **только свои студенты**. Это значит «учительская» для не-админа покажет ровно нагрузку этого ментора.
- Под студентом — вернётся **1 строка** (свою). Если фронт ожидает «список студентов курса» в каком-то экране у студента — он окажется пустым (кроме самого себя). Это сознательное ограничение шаблона C.

---

## Следствие для фронта (на заметку, вне scope этой фазы)

Если в фронте есть UI, где **студенту** должен быть виден список других студентов (например, «когорта», «лидерборд»), он сломается после этой фазы — `pvlPostgrestApi.listStudents()` вернёт 1 строку.

Если такая фича существует — нужно либо:
1. Отдельная политика «студенты одной когорты могут видеть друг друга» — потребует FK `cohort_id` (сейчас у всех 23 он NULL — мёртвая колонка, см. v3).
2. Отдельный RPC под админом / специальная view.
3. Делать запрос только под админом для таких UI.

Это **не блокер для SEC-001**, но при тестировании фронта после открытия Caddy могут всплыть «пустые списки» — стоит зафиксировать как наблюдение.

---

## Статус

**✅ ФАЗА 11.1 ЗАКРЫТА.** `pvl_students` под шаблоном C. 23 строки на месте, owner-bypass работает.

## Следующий шаг

**Жду подтверждения «идём в фазу 11.2»** — `pvl_garden_mentor_links`. Шаблон C, но с особенностью: студент видит свою связку (`student_id = auth.uid()`), ментор видит свои связки (`mentor_id = auth.uid()`), админ — все. CRUD — только админ (учительская).
