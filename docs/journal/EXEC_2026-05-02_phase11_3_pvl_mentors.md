---
title: SEC-001 Phase 11.3 — pvl_mentors (шаблон A, не C) (execution log)
type: execution-log
phase: "11.3"
created: 2026-05-02
status: ✅ COMMITTED
related_doc: docs/MIGRATION_2026-05-02_security_restoration.md
prev_phase: docs/EXEC_2026-05-02_phase11_2_pvl_garden_mentor_links.md
---

# Phase 11.3 — `pvl_mentors` (шаблон A, не C) (execution log)

**Время выполнения:** 2026-05-02, ~22:40 MSK.
**Транзакция:** одна, `BEGIN; … COMMIT;` — успешно с первой попытки.
**Результат:** ✅ `pvl_mentors` под защитой шаблона A (read-all + write-admin). Намеренное отступление от исходного ТЗ владельца — обоснование в правке 2 v6.

---

## Почему шаблон A, а не C

Из правки 2 в [docs/REPORT_2026-05-02_db_audit_v6.md](REPORT_2026-05-02_db_audit_v6.md):

- В `pvl_mentors` 1 строка с placeholder UUID `22222222-2222-2222-2222-222222222201` («Елена Ментор»).
- В `pvl_garden_mentor_links` 5 уникальных `mentor_id` — реальные действующие менторы (UUID из `profiles`).
- **0 пересечений** между `pvl_mentors.id` и `pvl_garden_mentor_links.mentor_id`. Таблица — оторванный справочник имён.
- Шаблон C предполагал бы `id = auth.uid()` для ментора, но `pvl_mentors.id` — НЕ `auth.uid()` ментора. Этот предикат всегда даст false.
- Шаблон A корректен: имя ментора должно быть видимо всем authenticated (для UI), CRUD только админу.

---

## SQL

Точно как в [docs/MIGRATION_2026-05-02_security_restoration.md](MIGRATION_2026-05-02_security_restoration.md#113--pvl_mentors-шаблон-a-не-c):

```sql
BEGIN;

ALTER TABLE public.pvl_mentors ENABLE ROW LEVEL SECURITY;

CREATE POLICY pvl_mentors_select_all
  ON public.pvl_mentors FOR SELECT TO authenticated
  USING (true);

CREATE POLICY pvl_mentors_insert_admin
  ON public.pvl_mentors FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY pvl_mentors_update_admin
  ON public.pvl_mentors FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY pvl_mentors_delete_admin
  ON public.pvl_mentors FOR DELETE TO authenticated
  USING (is_admin());

COMMIT;
```

---

## Сырой output psql

```
BEGIN;
BEGIN
ALTER TABLE public.pvl_mentors ENABLE ROW LEVEL SECURITY;
ALTER TABLE
CREATE POLICY pvl_mentors_select_all ...;
CREATE POLICY
CREATE POLICY pvl_mentors_insert_admin ...;
CREATE POLICY
CREATE POLICY pvl_mentors_update_admin ...;
CREATE POLICY
CREATE POLICY pvl_mentors_delete_admin ...;
CREATE POLICY
COMMIT;
COMMIT
```

---

## Верификации после COMMIT

### (a) RLS включён

```
   relname   | rls_enabled
-------------+-------------
 pvl_mentors | t
(1 row)
```

✅ `rls_enabled=t`.

### (b) 4 политики с правильными qual/with_check

```
        policyname        |  cmd   |    qual    | with_check
--------------------------+--------+------------+------------
 pvl_mentors_delete_admin | DELETE | is_admin() |
 pvl_mentors_insert_admin | INSERT |            | is_admin()
 pvl_mentors_select_all   | SELECT | true       |
 pvl_mentors_update_admin | UPDATE | is_admin() | is_admin()
(4 rows)
```

✅ Все 4 строки побайтно совпадают с ожидаемым.

### (c) Owner-bypass: 1 строка

```
 pvl_mentors_count
-------------------
                 1
(1 row)
```

✅ 1 строка («Елена Ментор» с UUID `22222222-…-01`, placeholder-фикстура).

---

## Что изменилось в проде

**Было:** `pvl_mentors` с RLS=off, 0 политик, 1 placeholder-строка.

**Стало:** RLS=on, 4 политики (шаблон A), 1 строка (без изменений).

### Логика политик

```
SELECT: USING (true)              ← все authenticated читают имя
INSERT: WITH CHECK (is_admin())
UPDATE: USING + WITH CHECK is_admin()
DELETE: USING (is_admin())
```

### Эффект на роли

| Роль | SELECT | INSERT/UPDATE/DELETE |
|---|:---:|:---:|
| Любой `authenticated` | ✓ читает справочник | ✗ |
| Админ (`is_admin()`) | ✓ | ✓ |
| `gen_user` (owner) | ✓ owner-bypass | ✓ |
| `web_anon` | ✗ | ✗ |

### Если в будущем структура изменится

Если когда-нибудь `pvl_mentors` синхронизируется с реестром реальных менторов (через FK на `profiles.id` или колонку `user_id` = `profiles.id`) — можно перейти на шаблон C по аналогии с `pvl_students`. Это потребует:
1. Добавить колонку `pvl_mentors.profile_id uuid REFERENCES profiles(id)` (или ALTER PK на использование `profiles.id`).
2. Заполнить её для 5 действующих менторов.
3. DROP старых политик A и CREATE политик C: `id = auth.uid() OR is_admin() OR EXISTS(...student-of-mentor...)`.

Сейчас это за пределами SEC-001. Работаем с тем, что есть.

---

## Шаблон C — итог фазы 11

| Подфаза | Таблица | Шаблон | Политик |
|---|---|---|---:|
| 11.1 | `pvl_students` | C | 4 |
| 11.2 | `pvl_garden_mentor_links` | C (без is_mentor_for) | 4 |
| 11.3 | `pvl_mentors` | **A** (правка 2 v6) | 4 |
| **Итого** | **3 таблицы** | | **12 политик** |

---

## Промежуточный итог по миграции

| Фаза | Что | Защищено таблиц | Политик создано |
|---|---|:---:|:---:|
| 1 | profiles cleanup | (без изменений) | -10 |
| 2 | knowledge_base hardcoded | (без изменений) | +2 |
| 3 | is_mentor_for(uuid) | (функция) | — |
| 4 | users_auth lockdown | +1 | 0 |
| 5 | to_archive + events_archive | +2 | 0 |
| 6 | messages | +1 | 0 |
| 7 | push_subscriptions | +1 | 0 |
| 8 | birthday_templates | +1 | +4 |
| 9 | PVL шаблон A (8 таблиц контента) | +8 | +32 |
| 10.1 | PVL B UUID (7 таблиц student-data) | +5 (+2 уже on) | +28 |
| 10.2 | PVL B TEXT (`pvl_student_questions`) | +1 | +4 |
| 10.3 | PVL B JOIN (`pvl_certification_criteria`) | +1 | +4 |
| 11.1 | `pvl_students` | +1 | +4 |
| 11.2 | `pvl_garden_mentor_links` | +1 | +4 |
| 11.3 | `pvl_mentors` | +1 | +4 |
| **Итого 11 фаз** | | **24 таблицы под RLS** | **+78, -10** |

---

## Статус

**✅ ФАЗА 11.3 ЗАКРЫТА.** Шаблон C завершён (с правкой 2 для `pvl_mentors` → шаблон A).

## Следующий шаг

**Жду подтверждения «идём в фазу 12»** — PVL шаблон D (личные сообщения и нотификации). Состоит из 3 подфаз:
- **12.1** — `pvl_direct_messages` (UUID, `mentor_id` / `student_id` / `author_user_id`)
- **12.2** — `pvl_notifications` (TEXT-id, OR по 3 колонкам адресации)
- **12.3** — `pvl_homework_status_history` (через JOIN на `pvl_student_homework_submissions`, immutable history без UPDATE/DELETE-политик)
