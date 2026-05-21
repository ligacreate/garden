---
title: SEC-001 Phase 11.2 — pvl_garden_mentor_links (шаблон C) (execution log)
type: execution-log
phase: "11.2"
created: 2026-05-02
status: ✅ COMMITTED
related_doc: docs/MIGRATION_2026-05-02_security_restoration.md
prev_phase: docs/EXEC_2026-05-02_phase11_1_pvl_students.md
---

# Phase 11.2 — `pvl_garden_mentor_links` (шаблон C) (execution log)

**Время выполнения:** 2026-05-02, ~22:35 MSK.
**Транзакция:** одна, `BEGIN; … COMMIT;` — успешно с первой попытки.
**Результат:** ✅ `pvl_garden_mentor_links` под защитой шаблона C: студент видит свою связку, ментор — свои связки, админ — все. CRUD только админ (учительская).

---

## SQL

Точно как в [docs/MIGRATION_2026-05-02_security_restoration.md](MIGRATION_2026-05-02_security_restoration.md#112--pvl_garden_mentor_links):

```sql
BEGIN;

ALTER TABLE public.pvl_garden_mentor_links ENABLE ROW LEVEL SECURITY;

-- SELECT: студент видит свою связку, ментор видит свои связки, админ — всё
CREATE POLICY pvl_garden_mentor_links_select_own_or_mentor_or_admin
  ON public.pvl_garden_mentor_links FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR mentor_id = auth.uid()
    OR is_admin()
  );

-- INSERT/UPDATE/DELETE: только админ (учительская)
CREATE POLICY pvl_garden_mentor_links_insert_admin
  ON public.pvl_garden_mentor_links FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY pvl_garden_mentor_links_update_admin
  ON public.pvl_garden_mentor_links FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY pvl_garden_mentor_links_delete_admin
  ON public.pvl_garden_mentor_links FOR DELETE TO authenticated
  USING (is_admin());

COMMIT;
```

---

## Сырой output psql

```
BEGIN;
BEGIN
ALTER TABLE public.pvl_garden_mentor_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE
CREATE POLICY pvl_garden_mentor_links_select_own_or_mentor_or_admin ...;
CREATE POLICY
CREATE POLICY pvl_garden_mentor_links_insert_admin ...;
CREATE POLICY
CREATE POLICY pvl_garden_mentor_links_update_admin ...;
CREATE POLICY
CREATE POLICY pvl_garden_mentor_links_delete_admin ...;
CREATE POLICY
COMMIT;
COMMIT
```

---

## Верификации после COMMIT

### (a) RLS включён

```
         relname         | rls_enabled
-------------------------+-------------
 pvl_garden_mentor_links | t
(1 row)
```

✅ `rls_enabled=t`.

### (b) 4 политики с правильными cmd

```
                      policyname                       |  cmd
-------------------------------------------------------+--------
 pvl_garden_mentor_links_delete_admin                  | DELETE
 pvl_garden_mentor_links_insert_admin                  | INSERT
 pvl_garden_mentor_links_select_own_or_mentor_or_admin | SELECT
 pvl_garden_mentor_links_update_admin                  | UPDATE
(4 rows)
```

✅ Имена и команды соответствуют ожидаемому.

### (c) Тело SELECT-политики

```
                      policyname                       |                                 qual
-------------------------------------------------------+-----------------------------------------------------------------------
 pvl_garden_mentor_links_select_own_or_mentor_or_admin | ((student_id = auth.uid()) OR (mentor_id = auth.uid()) OR is_admin())
(1 row)
```

✅ Все три ветки на месте:
- `student_id = auth.uid()` — студент видит свою связку (1 строка)
- `mentor_id = auth.uid()` — ментор видит свои связки (3–4 строки)
- `is_admin()` — админ видит все 19

📝 **Заметка.** Здесь, в отличие от 11.1, **нет** вызова `is_mentor_for(...)` — потому что в самой таблице `pvl_garden_mentor_links` ментор уже определяется напрямую через колонку `mentor_id`. Использование `is_mentor_for()` тут привело бы к рекурсии (`is_mentor_for` сам читает эту таблицу).

### (d) Owner-bypass: gen_user видит все 19 строк

```
 links_count
-------------
          19
(1 row)
```

✅ 19 связок (как в v3 и v6). Owner-bypass работает.

---

## Что изменилось в проде

**Было:** `pvl_garden_mentor_links` с RLS=off, 0 политик, 19 строк.

**Стало:** RLS=on, 4 политики (шаблон C, без `is_mentor_for()` чтобы избежать рекурсии), 19 строк.

### Логика политик

```
SELECT: USING (student_id = auth.uid() OR mentor_id = auth.uid() OR is_admin())
INSERT: WITH CHECK (is_admin())
UPDATE: USING + WITH CHECK is_admin()
DELETE: USING (is_admin())
```

### Эффект на роли

| Роль | SELECT | INSERT/UPDATE/DELETE |
|---|---|:---:|
| Студент (`auth.uid() = student_id`) | ✓ свою связку (1 строка) | ✗ |
| Ментор (`auth.uid() = mentor_id`) | ✓ свои связки (3–4 строки) | ✗ |
| Админ (`is_admin()`) | ✓ все 19 | ✓ |
| `gen_user` | ✓ owner-bypass | ✓ |
| `web_anon` | ✗ | ✗ |

### Что увидит каждая роль на 19 строках

Из v6:
- Ментор `492e5d3d-…` видит 4 связки.
- Ментор `1b10d2ef-…` видит 4 связки.
- Ментор `ebd79a0f-…` видит 4 связки (это Ирина — у неё `role='admin'` в profiles, поэтому она ещё проходит через `is_admin()` и видит все 19).
- Ментор `6cf385c3-…` видит 4 связки.
- Ментор `0e779c13-…` видит 3 связки.

Каждый студент видит 1 связку (свою, если есть; 4 студента из 23 без ментора → не видят ничего).

### Эффект на «учительскую»

UI «учительской» (где админ назначает абитуриенток менторам) — это INSERT/UPDATE/DELETE на этой таблице. Шаблон C разрешает CRUD только `is_admin()`. Все 3 админа (Ольга, Анастасия, Ирина) могут пользоваться учительской.

После открытия Caddy — учительская продолжит работать у всех админов. Никто кроме админов не сможет менять связки (даже сам ментор).

### Эффект на функцию `is_mentor_for()`

`is_mentor_for(uuid)` — `SECURITY DEFINER` (создана в фазе 3), поэтому исполняется с правами owner функции (`gen_user`), а `gen_user` через owner-bypass имеет полный SELECT на `pvl_garden_mentor_links` независимо от RLS. Значит `is_mentor_for()` продолжает корректно работать в политиках шаблона B (фазы 10.1–10.3).

✅ Это важное проверочное наблюдение: даже после включения RLS на `pvl_garden_mentor_links` функция `is_mentor_for()` функционально не пострадает.

---

## Уроки

### Урок 12: избегаем рекурсии — не вызываем `is_mentor_for()` в политиках на самой `pvl_garden_mentor_links`

В шаблоне C для `pvl_garden_mentor_links` мы намеренно используем **прямое сравнение** `mentor_id = auth.uid()` вместо `is_mentor_for(student_id)`. Причина:
- `is_mentor_for(student_uuid)` сам делает `SELECT FROM pvl_garden_mentor_links WHERE mentor_id = auth.uid() AND student_id = student_uuid`.
- Если бы политика на `pvl_garden_mentor_links` вызывала `is_mentor_for()`, то при чтении этой таблицы рекурсивно вызывалась бы функция, которая читает ту же таблицу. SECURITY DEFINER + STABLE спасают от ошибки (owner-bypass), но семантически некрасиво.
- Прямое `mentor_id = auth.uid()` короче, проще, без рекурсии.

В таблицах шаблона B (10.1–10.3), где нет mentor-id-колонки, через `is_mentor_for()` идём — там функция полезна.

---

## Статус

**✅ ФАЗА 11.2 ЗАКРЫТА.** `pvl_garden_mentor_links` под шаблоном C. 19 связок на месте, учительская работает только под админом.

## Следующий шаг

**Жду подтверждения «идём в фазу 11.3»** — `pvl_mentors` (1 строка-фикстура «Елена Ментор» с UUID `22222…01`). По правке 2 в v6 применяется **шаблон A** (не C): `select_all` для всех authenticated, CRUD через `is_admin()`. Обоснование: `pvl_mentors.id ≠ auth.uid()` ментора (см. v6 — 0 пересечений с реальными 5 менторами в links), таблица — оторванный справочник.
