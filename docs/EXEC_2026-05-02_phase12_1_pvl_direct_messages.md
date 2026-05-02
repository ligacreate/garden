---
title: SEC-001 Phase 12.1 — pvl_direct_messages (шаблон D, UUID) (execution log)
type: execution-log
phase: "12.1"
created: 2026-05-02
status: ✅ COMMITTED
related_doc: docs/MIGRATION_2026-05-02_security_restoration.md
prev_phase: docs/EXEC_2026-05-02_phase11_3_pvl_mentors.md
---

# Phase 12.1 — `pvl_direct_messages` (шаблон D, UUID) (execution log)

**Время выполнения:** 2026-05-02, ~22:50 MSK.
**Транзакция:** одна, `BEGIN; … COMMIT;` — успешно с первой попытки.
**Результат:** ✅ `pvl_direct_messages` под защитой шаблона D: переписку видят участники и админ, писать может только автор-участник, править — автор/админ, удалять — только админ.

---

## Особенность таблицы

`pvl_direct_messages` — личная переписка ментор↔студент. Поля:
- `mentor_id uuid` — ментор-участник
- `student_id uuid` — студент-участник
- `author_user_id uuid` — кто написал сообщение

Все три без FK (см. v3). Шаблон D предполагает проверку **участия** в диалоге для SELECT и **авторства + участия** для INSERT.

---

## SQL

Точно как в [docs/MIGRATION_2026-05-02_security_restoration.md](MIGRATION_2026-05-02_security_restoration.md#121--pvl_direct_messages-uuid):

```sql
BEGIN;

ALTER TABLE public.pvl_direct_messages ENABLE ROW LEVEL SECURITY;

-- SELECT: участники диалога (ментор/студент) или админ
CREATE POLICY pvl_direct_messages_select_participant_or_admin
  ON public.pvl_direct_messages FOR SELECT TO authenticated
  USING (
    auth.uid() = mentor_id
    OR auth.uid() = student_id
    OR is_admin()
  );

-- INSERT: автор должен совпадать с auth.uid() и быть участником диалога
CREATE POLICY pvl_direct_messages_insert_own
  ON public.pvl_direct_messages FOR INSERT TO authenticated
  WITH CHECK (
    author_user_id = auth.uid()
    AND (auth.uid() = mentor_id OR auth.uid() = student_id)
  );

-- UPDATE: только автор может править свои + админ
CREATE POLICY pvl_direct_messages_update_author_or_admin
  ON public.pvl_direct_messages FOR UPDATE TO authenticated
  USING (author_user_id = auth.uid() OR is_admin())
  WITH CHECK (author_user_id = auth.uid() OR is_admin());

-- DELETE: только админ
CREATE POLICY pvl_direct_messages_delete_admin
  ON public.pvl_direct_messages FOR DELETE TO authenticated
  USING (is_admin());

COMMIT;
```

---

## Сырой output psql

```
BEGIN;
BEGIN
ALTER TABLE public.pvl_direct_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE
CREATE POLICY pvl_direct_messages_select_participant_or_admin ...;
CREATE POLICY
CREATE POLICY pvl_direct_messages_insert_own ...;
CREATE POLICY
CREATE POLICY pvl_direct_messages_update_author_or_admin ...;
CREATE POLICY
CREATE POLICY pvl_direct_messages_delete_admin ...;
CREATE POLICY
COMMIT;
COMMIT
```

---

## Верификации после COMMIT

### (a) RLS включён

```
       relname       | rls_enabled
---------------------+-------------
 pvl_direct_messages | t
(1 row)
```

✅ `rls_enabled=t`.

### (b) 4 политики с правильными cmd

```
                   policyname                    |  cmd
-------------------------------------------------+--------
 pvl_direct_messages_delete_admin                | DELETE
 pvl_direct_messages_insert_own                  | INSERT
 pvl_direct_messages_select_participant_or_admin | SELECT
 pvl_direct_messages_update_author_or_admin      | UPDATE
(4 rows)
```

✅ Имена и команды совпадают с ожидаемым.

### (c) Тело SELECT-политики (3 ветки участников)

```
                   policyname                    |                                 qual
-------------------------------------------------+-----------------------------------------------------------------------
 pvl_direct_messages_select_participant_or_admin | ((auth.uid() = mentor_id) OR (auth.uid() = student_id) OR is_admin())
(1 row)
```

✅ Все три ветки на месте: ментор-участник, студент-участник, админ.

### (d) Тело INSERT-политики (автор + участие)

```
           policyname           |                                         with_check
--------------------------------+---------------------------------------------------------------------------------------------
 pvl_direct_messages_insert_own | ((author_user_id = auth.uid()) AND ((auth.uid() = mentor_id) OR (auth.uid() = student_id)))
(1 row)
```

✅ Обе проверки на месте:
- `author_user_id = auth.uid()` — нельзя писать «от чужого имени»
- `(auth.uid() = mentor_id OR auth.uid() = student_id)` — нельзя писать в чужой диалог

### (e) Owner-bypass: 25 строк

```
 direct_messages_count
-----------------------
                    25
(1 row)
```

✅ 25 сообщений (как в v3). `gen_user` через owner-bypass читает все.

---

## Что изменилось в проде

**Было:** `pvl_direct_messages` с RLS=off, 0 политик, 25 сообщений.

**Стало:** RLS=on, 4 политики (шаблон D), 25 сообщений (без изменений).

### Логика политик

```
SELECT: USING (auth.uid() = mentor_id OR auth.uid() = student_id OR is_admin())
INSERT: WITH CHECK (author_user_id = auth.uid()
                    AND (auth.uid() = mentor_id OR auth.uid() = student_id))
UPDATE: USING+WITH CHECK (author_user_id = auth.uid() OR is_admin())
DELETE: USING (is_admin())
```

### Эффект на роли

| Роль | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|:---:|
| Ментор-участник диалога | ✓ свои диалоги | ✓ от своего имени | ✓ свои сообщения | ✗ |
| Студент-участник | ✓ свои диалоги | ✓ от своего имени | ✓ свои сообщения | ✗ |
| Не-участник (любой залогиненный) | ✗ | ✗ | ✗ | ✗ |
| Админ | ✓ все | ✗ если не участник | ✓ любые | ✓ |
| `gen_user` | ✓ owner-bypass | ✓ | ✓ | ✓ |
| `web_anon` | ✗ | ✗ | ✗ | ✗ |

⚠ **Тонкий момент про админа.** Админ **не может** INSERT'ить сообщения «от имени студента» через политику D — `WITH CHECK` требует `author_user_id = auth.uid()` (написать может только за себя) **И** `auth.uid() = mentor_id OR student_id` (нужно быть участником). Если админ не упомянут в `mentor_id`/`student_id` — INSERT для него тоже заблокирован.

Это поведение из ТЗ: «личная переписка не должна вестись админом за других». Если в будущем админу нужно «вмешательство в диалог» — отдельная админ-политика INSERT через `is_admin()`.

### Эффект на бекенд

`gen_user` через owner-bypass продолжит читать всю переписку (например, для системных задач, audit). Нужно держать в голове, что бекенд по факту имеет полный доступ — **FORCE RLS** в SEC-004 это закроет.

---

## Уроки

### Урок 13: для шаблона D INSERT нужно две независимых проверки

Не просто `author_user_id = auth.uid()` (это защита от подмены автора), но и `auth.uid() IN (mentor_id, student_id)` (это защита от запихивания себя в чужой диалог). Без второй проверки злоумышленник мог бы:
1. Создать сообщение с `author_user_id = auth.uid()` (ОК — он автор).
2. Указать `mentor_id` и `student_id` совершенно других людей (где он не упомянут).
3. Сообщение «вступит» в чужой диалог как «системное от участника» с фейковым `author`.

`AND` между двумя проверками гарантирует, что злоумышленник не может ни писать «не от своего имени», ни «не в своих диалогах».

---

## Статус

**✅ ФАЗА 12.1 ЗАКРЫТА.** `pvl_direct_messages` под шаблоном D. 25 сообщений на месте, переписка защищена.

## Следующий шаг

**Жду подтверждения «идём в фазу 12.2»** — `pvl_notifications` (TEXT-id, OR по 3 колонкам адресации `user_id`/`recipient_student_id`/`recipient_mentor_id`). Триггер `pvl_sync_notification_compat` синкает только legacy/new контент, не адресацию (см. v4).
