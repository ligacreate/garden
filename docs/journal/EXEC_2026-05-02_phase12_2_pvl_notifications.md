---
title: SEC-001 Phase 12.2 — pvl_notifications (шаблон D, TEXT) (execution log)
type: execution-log
phase: "12.2"
created: 2026-05-02
status: ✅ COMMITTED
related_doc: docs/MIGRATION_2026-05-02_security_restoration.md
prev_phase: docs/EXEC_2026-05-02_phase12_1_pvl_direct_messages.md
---

# Phase 12.2 — `pvl_notifications` (шаблон D, TEXT) (execution log)

**Время выполнения:** 2026-05-02, ~22:55 MSK.
**Транзакция:** одна, `BEGIN; … COMMIT;` — успешно с первой попытки.
**Результат:** ✅ `pvl_notifications` под защитой шаблона D с OR по 3 колонкам адресации (`user_id`, `recipient_student_id`, `recipient_mentor_id`). 0 строк на текущий момент — фича не активна.

---

## Особенность таблицы

`pvl_notifications` имеет **3 параллельные колонки адресации** (см. v4 задача 2):
- `user_id text` — основной получатель
- `recipient_student_id text` — денормализованная ссылка на студента
- `recipient_mentor_id text` — денормализованная ссылка на ментора

Триггер `pvl_sync_notification_compat` синкает только legacy/new пары контента (`role`/`recipient_role`, `kind`/`type`, `body`/`text`/`title`), но **НЕ адресацию**. Поэтому RLS-политика проверяет все три колонки через OR. Все три — TEXT, поэтому cast `auth.uid()::text`.

---

## SQL

Точно как в [docs/MIGRATION_2026-05-02_security_restoration.md](MIGRATION_2026-05-02_security_restoration.md#122--pvl_notifications-text):

```sql
BEGIN;

ALTER TABLE public.pvl_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY pvl_notifications_select_own_or_admin
  ON public.pvl_notifications FOR SELECT TO authenticated
  USING (
    auth.uid()::text = user_id
    OR auth.uid()::text = recipient_student_id
    OR auth.uid()::text = recipient_mentor_id
    OR is_admin()
  );

-- INSERT: любой залогиненный (создание нотификаций фронтом)
CREATE POLICY pvl_notifications_insert_authenticated
  ON public.pvl_notifications FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- UPDATE: только своих нотификаций (для is_read=true) + админ
CREATE POLICY pvl_notifications_update_own_or_admin
  ON public.pvl_notifications FOR UPDATE TO authenticated
  USING (
    auth.uid()::text = user_id
    OR auth.uid()::text = recipient_student_id
    OR auth.uid()::text = recipient_mentor_id
    OR is_admin()
  )
  WITH CHECK (
    auth.uid()::text = user_id
    OR auth.uid()::text = recipient_student_id
    OR auth.uid()::text = recipient_mentor_id
    OR is_admin()
  );

-- DELETE: только админ
CREATE POLICY pvl_notifications_delete_admin
  ON public.pvl_notifications FOR DELETE TO authenticated
  USING (is_admin());

COMMIT;
```

---

## Сырой output psql

```
BEGIN;
BEGIN
ALTER TABLE public.pvl_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE
CREATE POLICY pvl_notifications_select_own_or_admin ...;
CREATE POLICY
CREATE POLICY pvl_notifications_insert_authenticated ...;
CREATE POLICY
CREATE POLICY pvl_notifications_update_own_or_admin ...;
CREATE POLICY
CREATE POLICY pvl_notifications_delete_admin ...;
CREATE POLICY
COMMIT;
COMMIT
```

---

## Верификации после COMMIT

### (a) RLS включён

```
      relname      | rls_enabled
-------------------+-------------
 pvl_notifications | t
(1 row)
```

✅ `rls_enabled=t`.

### (b) 4 политики с правильными cmd

```
               policyname               |  cmd
----------------------------------------+--------
 pvl_notifications_delete_admin         | DELETE
 pvl_notifications_insert_authenticated | INSERT
 pvl_notifications_select_own_or_admin  | SELECT
 pvl_notifications_update_own_or_admin  | UPDATE
(4 rows)
```

✅ Имена и команды совпадают с ожидаемым.

### (c) Тело SELECT-политики — OR по 3 TEXT-колонкам

```
              policyname               |                                                                    qual
---------------------------------------+---------------------------------------------------------------------------------------------------------------------------------------------
 pvl_notifications_select_own_or_admin | (((auth.uid())::text = user_id) OR ((auth.uid())::text = recipient_student_id) OR ((auth.uid())::text = recipient_mentor_id) OR is_admin())
(1 row)
```

✅ Все 4 ветки на месте:
- `(auth.uid())::text = user_id`
- `(auth.uid())::text = recipient_student_id`
- `(auth.uid())::text = recipient_mentor_id`
- `is_admin()`

Cast `(auth.uid())::text` корректно сохранён Postgres'ом.

### (d) Owner-bypass: 0 строк

```
 notifications_count
---------------------
                   0
(1 row)
```

✅ 0 строк (как в v3) — фича нотификаций ещё не активна.

---

## Что изменилось в проде

**Было:** `pvl_notifications` с RLS=off, 0 политик, 0 строк.

**Стало:** RLS=on, 4 политики (шаблон D с OR по 3 колонкам), 0 строк.

### Логика политик

```
SELECT/UPDATE: USING (auth.uid()::text IN (user_id, recipient_student_id, recipient_mentor_id) OR is_admin())
INSERT:        WITH CHECK (auth.uid() IS NOT NULL)   ← любой залогиненный
DELETE:        USING (is_admin())
```

### Эффект на роли

| Роль | SELECT/UPDATE | INSERT | DELETE |
|---|---|:---:|:---:|
| Получатель в любой из 3 колонок | ✓ свои нотификации | ✓ | ✗ |
| Любой залогиненный (не получатель) | ✗ | ✓ | ✗ |
| Админ | ✓ все | ✓ | ✓ |
| `gen_user` | ✓ owner-bypass | ✓ | ✓ |
| `web_anon` | ✗ | ✗ | ✗ |

### Тонкие моменты

1. **INSERT широкий.** Любой залогиненный может создать нотификацию для кого угодно (через указание `user_id` / `recipient_student_id` / `recipient_mentor_id`). Это сознательное решение: нотификации создаёт фронт от имени системы (например, «студент сдал ДЗ → нотификация ментору»). Потенциально может быть использовано для спама, но в закрытом сообществе из 23 студентов и 3 админов это приемлемый риск.

2. **UPDATE для всех колонок.** Политика разрешает UPDATE любого поля строки (не только `is_read`). Это означает, что получатель может изменить, например, `body` или `title` своей нотификации. ⚠ Зафиксировано в v3 как «требует решения». Если нужна column-level защита (только `is_read`/`read_at`) — отдельная задача через column-level GRANT.

3. **DELETE только админ.** Получатель не может удалить нотификацию — только пометить прочитанной. Это для аудита.

### Эффект на фичу нотификаций

Фича пока не активна (0 строк). При активации:
- Фронт создаёт нотификации через `pvlPostgrestApi.listNotifications()` / `createAuditLog()` — все идут под `authenticated`.
- Получатель видит свои нотификации через любую из 3 колонок.
- Админ видит все нотификации в проде.
- Никто не может удалить (кроме админа).

---

## Уроки

### Урок 14: Triple-OR на параллельных колонках адресации

Когда таблица имеет несколько денормализованных «получатель»-колонок (legacy-наследие частичных миграций), безопасный паттерн — OR по всем колонкам. Альтернативы:
- Дождаться завершения миграции (когда `recipient_*_id` будут схлопнуты в один `user_id`) и убрать лишние OR — это в CLEAN-007 (BACKLOG).
- Сейчас — широкий OR обеспечивает корректность независимо от того, какая из 3 колонок заполнена.

Производительность не страдает — на 0 строк сейчас, при активации можно индексировать `user_id`, `recipient_student_id`, `recipient_mentor_id` отдельно (индексы уже есть, см. v3 задача 1).

---

## Статус

**✅ ФАЗА 12.2 ЗАКРЫТА.** `pvl_notifications` под шаблоном D с OR по 3 TEXT-колонкам. 0 строк, защита готова к активации фичи.

## Следующий шаг

**Жду подтверждения «идём в фазу 12.3»** — `pvl_homework_status_history`. Особенность: **append-only** (только SELECT и INSERT, **без UPDATE/DELETE-политик** — отсутствие политики = запрет под RLS). История изменений статусов ДЗ должна быть immutable. Owner определяется через `submission_id → pvl_student_homework_submissions.student_id` (JOIN, аналогично 10.3).
