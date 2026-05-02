---
title: SEC-001 Phase 12.3 — pvl_homework_status_history (append-only) (execution log)
type: execution-log
phase: "12.3"
created: 2026-05-02
status: ✅ COMMITTED
related_doc: docs/MIGRATION_2026-05-02_security_restoration.md
prev_phase: docs/EXEC_2026-05-02_phase12_2_pvl_notifications.md
---

# Phase 12.3 — `pvl_homework_status_history` (через JOIN, append-only) (execution log)

**Время выполнения:** 2026-05-02, ~23:05 MSK.
**Транзакция:** одна, `BEGIN; … COMMIT;` — успешно со второй попытки (первая не дошла до Postgres из-за zsh-парсинга).
**Результат:** ✅ `pvl_homework_status_history` под защитой шаблона D (append-only): SELECT через JOIN на parent + INSERT с проверкой автора. UPDATE/DELETE невозможны (нет политик → RLS блокирует).

---

## Хронология

### Попытка 1 — zsh parse error на локальной машине

При запуске через `ssh ... psql -e ... <<'EOF' ... EOF` локальный zsh упал с `parse error near ')'`. SSH-команда даже не дошла до сервера, никаких изменений в БД.

Причина: моя обёртка с двойным экранированием `'"'"'` для одинарных кавычек внутри single-quoted SSH-аргумента некорректно интерпретировалась zsh из-за круглых скобок в SQL-блоке.

### Попытка 2 — через SQL-файл и scp

Записал SQL в `/tmp/phase12_3.sql` через Write tool, скопировал на сервер через `scp`, выполнил `psql -f /tmp/phase12_3.sql`. Прошло без проблем.

---

## Особенность таблицы

`pvl_homework_status_history` — журнал изменений статусов ДЗ. **Append-only**: должен сохранять полную историю без правок и удалений.

- Owner определяется через JOIN: `submission_id → pvl_student_homework_submissions.student_id`.
- INSERT-политика дополнительно проверяет `changed_by = auth.uid()` (защита от подмены автора правки).
- UPDATE/DELETE намеренно **не имеют политик** — в Postgres отсутствие политики для CMD под RLS = запрет.

---

## SQL

Точно как в [docs/MIGRATION_2026-05-02_security_restoration.md](MIGRATION_2026-05-02_security_restoration.md#123--pvl_homework_status_history-через-join):

```sql
BEGIN;

ALTER TABLE public.pvl_homework_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY pvl_homework_status_history_select
  ON public.pvl_homework_status_history FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pvl_student_homework_submissions s
      WHERE s.id = submission_id
        AND (s.student_id = auth.uid() OR is_admin() OR public.is_mentor_for(s.student_id))
    )
  );

CREATE POLICY pvl_homework_status_history_insert
  ON public.pvl_homework_status_history FOR INSERT TO authenticated
  WITH CHECK (
    changed_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.pvl_student_homework_submissions s
      WHERE s.id = submission_id
        AND (s.student_id = auth.uid() OR is_admin() OR public.is_mentor_for(s.student_id))
    )
  );

-- UPDATE/DELETE: НЕ создаём политики. RLS без политики = запрет.

COMMIT;
```

---

## Сырой output psql

```
BEGIN;
BEGIN
ALTER TABLE public.pvl_homework_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE
CREATE POLICY pvl_homework_status_history_select ...;
CREATE POLICY
CREATE POLICY pvl_homework_status_history_insert ...;
CREATE POLICY
COMMIT;
COMMIT
```

---

## Верификации после COMMIT

### (a) RLS включён

```
           relname           | rls_enabled
-----------------------------+-------------
 pvl_homework_status_history | t
(1 row)
```

✅ `rls_enabled=t`.

### (b) Ровно 2 политики (без UPDATE/DELETE)

```
             policyname             |  cmd
------------------------------------+--------
 pvl_homework_status_history_insert | INSERT
 pvl_homework_status_history_select | SELECT
(2 rows)
```

✅ Только SELECT и INSERT. **UPDATE и DELETE отсутствуют** — это сознательно, append-only.

### (c) Тела политик

```
 pvl_homework_status_history_select | (EXISTS ( SELECT 1
                                    |    FROM pvl_student_homework_submissions s
                                    |   WHERE ((s.id = pvl_homework_status_history.submission_id)
                                    |          AND ((s.student_id = auth.uid()) OR is_admin() OR is_mentor_for(s.student_id))
                                    |    ...

 pvl_homework_status_history_insert | with_check =
                                    | ((changed_by = auth.uid()) AND (EXISTS ( SELECT 1
                                    |    FROM pvl_student_homework_submissions s
                                    |   WHERE ((s.id = pvl_homework_status_history.submission_id)
                                    |          AND ((s.student_id = auth.uid()) OR is_admin() OR is_mentor_for(s.student_id))
                                    |    ...
```

✅ SELECT — EXISTS на parent с правом владения через 3 ветки (own/admin/mentor).
✅ INSERT — `changed_by = auth.uid()` AND EXISTS (то же самое).

Postgres квалифицировал `submission_id` как `pvl_homework_status_history.submission_id` — нормальное disambiguation.

### (d) Owner-bypass: 110 строк

```
 history_count
---------------
           110
(1 row)
```

✅ 110 записей истории (как в v3). Owner-bypass работает.

---

## Что изменилось в проде

**Было:** `pvl_homework_status_history` с RLS=off, 0 политик, 110 строк.

**Стало:** RLS=on, **2 политики** (SELECT и INSERT, без UPDATE/DELETE), 110 строк (без изменений).

### Логика политик

```
SELECT: USING (EXISTS на pvl_student_homework_submissions с (own OR admin OR mentor))
INSERT: WITH CHECK (changed_by = auth.uid() AND EXISTS (...))
UPDATE: ❌ нет политики → RLS блокирует
DELETE: ❌ нет политики → RLS блокирует
```

### Эффект на роли

| Роль | SELECT | INSERT | UPDATE | DELETE |
|---|:---:|:---:|:---:|:---:|
| Студент (parent.student_id = auth.uid()) | ✓ свою историю | ✓ запись с changed_by=self | ✗ | ✗ |
| Ментор (is_mentor_for(parent.student_id)) | ✓ историю своих студентов | ✓ запись с changed_by=self | ✗ | ✗ |
| Админ | ✓ всю | ✓ запись с changed_by=self | ✗ | ✗ |
| `gen_user` | ✓ owner-bypass | ✓ | ✓ | ✓ |
| `web_anon` | ✗ | ✗ | ✗ | ✗ |

⚠ **Append-only действует и для админа.** Даже админ не может через PostgREST UPDATE/DELETE на этой таблице — нет политики. Если когда-нибудь нужно «исправить» запись истории — только под gen_user (owner-bypass) или postgres напрямую через psql.

### Эффект на бекенд

Фронт через `pvlPostgrestApi.appendHomeworkStatusHistory()` (см. [services/pvlPostgrestApi.js:459](../services/pvlPostgrestApi.js#L459)) делает только INSERT. UPDATE/DELETE на этой таблице нигде в коде нет — append-only паттерн уже соблюдается в коде.

После открытия Caddy:
- Студент при сдаче ДЗ → автоматический INSERT с `changed_by = auth.uid()`. Работает.
- Ментор при проверке ДЗ → INSERT с `changed_by = auth.uid()`. Работает.
- Никто не может перезаписать или удалить старые записи (immutable audit).

---

## Шаблон D — итог фазы 12

| Подфаза | Таблица | Шаблон | Политик | Особенность |
|---|---|---|---:|---|
| 12.1 | `pvl_direct_messages` | D (UUID) | 4 | Personal chat, 25 строк |
| 12.2 | `pvl_notifications` | D (TEXT) | 4 | OR по 3 колонкам, 0 строк |
| 12.3 | `pvl_homework_status_history` | D (JOIN, append-only) | **2** | Только SELECT+INSERT, 110 строк |
| **Итого** | **3 таблицы** | | **10 политик** | |

---

## Уроки

### Урок 15: append-only через отсутствие политик

В Postgres RLS: если для какой-то CMD (UPDATE, DELETE) **нет ни одной политики** на таблице с RLS=on — операция запрещена для всех ролей кроме owner. Это лучше, чем явная политика `USING (false)`, потому что:
- Меньше шумящих политик в `pg_policies`.
- Owner всё равно проходит через owner-bypass (если нужен системный fix истории).
- Если когда-нибудь **нужно** разрешить UPDATE/DELETE — добавить политику. Сейчас — однозначный запрет.

В нашем случае это даёт immutable audit log на уровне БД (не только на уровне кода).

### Урок 16: zsh-проблемы с heredoc — обходим через scp + psql -f

Сложные SQL-блоки с круглыми скобками + одинарные кавычки + heredoc через ssh могут падать в zsh с `parse error near ')'`. Решение:
1. Записать SQL в локальный файл через Write tool.
2. `scp` на сервер.
3. `ssh ... psql -f /tmp/file.sql`.

Это надёжнее, чем многоуровневое экранирование. Использовать в будущих фазах с длинными SQL-блоками. Для коротких inline-SQL продолжаю использовать heredoc — он работает.

---

## Промежуточный итог по миграции

| Фаза | Что | Защищено таблиц | Политик создано |
|---|---|:---:|:---:|
| 1 | profiles cleanup | (без изменений) | -10 |
| 2 | knowledge_base hardcoded | (без изменений) | +2 |
| 3 | is_mentor_for(uuid) | (функция) | — |
| 4–7 | lockdown (4 таблицы) | +5 | 0 |
| 8 | birthday_templates | +1 | +4 |
| 9 | PVL шаблон A (8 таблиц) | +8 | +32 |
| 10.1–10.3 | PVL шаблон B (9 таблиц) | +7 (+2 уже on) | +36 |
| 11.1–11.3 | PVL шаблон C (3 таблицы) | +3 | +12 |
| **12.1–12.3** | **PVL шаблон D (3 таблицы)** | **+3** | **+10** |
| **Итого 12 фаз** | | **27 таблиц под RLS** | **+88, -10** |

---

## Статус

**✅ ФАЗА 12.3 ЗАКРЫТА. Шаблон D завершён.** `pvl_homework_status_history` — append-only. 110 записей истории на месте.

## Следующий шаг

**Жду подтверждения «идём в фазу 13»** — PVL шаблон E (`pvl_audit_log`, единственная таблица). Похожий append-only паттерн: SELECT только админ, INSERT всем authenticated, **UPDATE/DELETE без политик** = запрет (write-once log).
