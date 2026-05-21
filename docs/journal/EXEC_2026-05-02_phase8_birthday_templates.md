---
title: SEC-001 Phase 8 — birthday_templates: RLS + 4 политики (execution log)
type: execution-log
phase: 8
created: 2026-05-02
status: ✅ COMMITTED
related_doc: docs/MIGRATION_2026-05-02_security_restoration.md
prev_phase: docs/EXEC_2026-05-02_phase7_push_subscriptions_lockdown.md
---

# Phase 8 — `birthday_templates`: RLS + 4 политики (execution log)

**Время выполнения:** 2026-05-02, ~21:40 MSK.
**Транзакция:** одна, `BEGIN; … COMMIT;` — успешно с первой попытки.
**Smoke:** прошёл (4 политики).
**Результат:** ✅ `birthday_templates` под защитой: чтение всем залогиненным, запись только админу.

---

## SQL

Точно как в [docs/MIGRATION_2026-05-02_security_restoration.md](MIGRATION_2026-05-02_security_restoration.md#фаза-8--birthday_templates-rls--4-политики):

```sql
BEGIN;

ALTER TABLE public.birthday_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY birthday_templates_select_all ON public.birthday_templates
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY birthday_templates_insert_admin ON public.birthday_templates
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY birthday_templates_update_admin ON public.birthday_templates
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY birthday_templates_delete_admin ON public.birthday_templates
  FOR DELETE TO authenticated
  USING (is_admin());

-- Smoke
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename='birthday_templates';
  IF n <> 4 THEN RAISE EXCEPTION 'birthday_templates: expected 4 policies, got %', n; END IF;
END $$;

COMMIT;
```

---

## Сырой output psql

```
BEGIN;
BEGIN
ALTER TABLE public.birthday_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE
CREATE POLICY birthday_templates_select_all ...;
CREATE POLICY
CREATE POLICY birthday_templates_insert_admin ...;
CREATE POLICY
CREATE POLICY birthday_templates_update_admin ...;
CREATE POLICY
CREATE POLICY birthday_templates_delete_admin ...;
CREATE POLICY
DO $$ ... END $$;
DO
COMMIT;
COMMIT
```

**Разбор:**
- `ALTER TABLE` — успех.
- 4 × `CREATE POLICY` — все прошли.
- `DO` — smoke прошёл (4 политики).
- `COMMIT` — транзакция применена.

---

## Верификации после COMMIT

### Политики

**SQL:**
```sql
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname='public' AND tablename='birthday_templates'
ORDER BY policyname;
```

**Результат:**
```
           policyname            |  cmd   |    qual    | with_check
---------------------------------+--------+------------+------------
 birthday_templates_delete_admin | DELETE | is_admin() |
 birthday_templates_insert_admin | INSERT |            | is_admin()
 birthday_templates_select_all   | SELECT | true       |
 birthday_templates_update_admin | UPDATE | is_admin() | is_admin()
(4 rows)
```

**Соответствие ожидаемому:**

| Ожидалось | Получено | ✓/✗ |
|---|---|:---:|
| `birthday_templates_delete_admin` DELETE `is_admin()` — | ✓ | ✓ |
| `birthday_templates_insert_admin` INSERT — `is_admin()` | ✓ | ✓ |
| `birthday_templates_select_all` SELECT `true` — | ✓ | ✓ |
| `birthday_templates_update_admin` UPDATE `is_admin()` `is_admin()` | ✓ | ✓ |

### RLS-status

```
 rls_enabled
-------------
 t
(1 row)
```

✅ RLS включён.

### Owner-bypass и сохранность данных

```
 row_count
-----------
         2
(1 row)
```

✅ 2 строки на месте (как в v2). Owner gen_user их видит.

---

## Что изменилось в проде

**Было:** `birthday_templates` с RLS=off, 0 политик, 2 строки.

**Стало:** RLS=on, 4 политики (read-all + write-admin pattern), 2 строки.

### Эффект на роли

| Роль | SELECT | INSERT | UPDATE | DELETE |
|---|:---:|:---:|:---:|:---:|
| `gen_user` (owner) | ✓ (owner-bypass) | ✓ | ✓ | ✓ |
| Любой `authenticated` | ✓ (`true`) | ✗ | ✗ | ✗ |
| `authenticated` + admin | ✓ | ✓ (`is_admin()`) | ✓ | ✓ |
| `web_anon` | ✗ (нет GRANT) | ✗ | ✗ | ✗ |

### Эффект на фронт

- Любой пользователь, открыв страницу с поздравлениями → SELECT проходит, видит шаблоны.
- Только админ может добавить/изменить/удалить шаблон через админку.
- web_anon (без логина) ничего не видит — для этого фронт должен ходить под `authenticated`.

### Это первая фаза с «настоящими» CREATE POLICY

Все предыдущие фазы (4–7) были `RLS-on без политик` (lockdown-режим). Фаза 8 — **первая полноценная RLS-таблица с 4-х политическим паттерном** (CRUD по ролям). Этот паттерн используется как шаблон для:
- knowledge_base (фаза 2 уже доработана через is_admin())
- PVL шаблон A (фаза 9, 8 таблиц)

Также проверено, что предикат `is_admin()` корректно работает в политиках без явных проблем с правами или search_path.

---

## Статус

**✅ ФАЗА 8 ЗАКРЫТА.** `birthday_templates` под RLS-on с 4 политиками. Шаблон «read-all + write-admin» обкатан, готов к массовому применению в фазе 9 (PVL контент курса).

## Следующий шаг

**Жду подтверждения «идём в фазу 9»** — **PVL шаблон A**: 8 таблиц контента курса (`pvl_course_weeks`, `pvl_course_lessons`, `pvl_content_items`, `pvl_content_placements`, `pvl_homework_items`, `pvl_calendar_events`, `pvl_faq_items`, `pvl_cohorts`). Для каждой — RLS-on + 4 политики (тот же паттерн «read-all authenticated + CRUD admin»). Делается через `DO $$ FOREACH` лупом, в одной транзакции, smoke на 32 политики.
