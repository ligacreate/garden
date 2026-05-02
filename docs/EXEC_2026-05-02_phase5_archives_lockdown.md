---
title: SEC-001 Phase 5 — Lockdown to_archive и events_archive (execution log)
type: execution-log
phase: 5
created: 2026-05-02
status: ✅ COMMITTED
related_doc: docs/MIGRATION_2026-05-02_security_restoration.md
prev_phase: docs/EXEC_2026-05-02_phase4_users_auth_lockdown.md
---

# Phase 5 — Lockdown `to_archive` и `events_archive` (execution log)

**Время выполнения:** 2026-05-02, ~21:10 MSK.
**Транзакция:** одна, `BEGIN; … COMMIT;` — успешно.
**Smoke:** прошёл (обе таблицы RLS-on).
**Результат:** ✅ Архивные таблицы закрыты тем же паттерном, что и `users_auth`: RLS-on без политик + REVOKE.

---

## SQL

Точно как в [docs/MIGRATION_2026-05-02_security_restoration.md](MIGRATION_2026-05-02_security_restoration.md#фаза-5--lockdown-to_archive-и-events_archive):

```sql
BEGIN;

ALTER TABLE public.to_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.to_archive FROM PUBLIC;
REVOKE ALL ON public.to_archive FROM web_anon;
REVOKE ALL ON public.to_archive FROM authenticated;

ALTER TABLE public.events_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.events_archive FROM PUBLIC;
REVOKE ALL ON public.events_archive FROM web_anon;
REVOKE ALL ON public.events_archive FROM authenticated;

-- Smoke
DO $$
DECLARE rls_on bool;
BEGIN
  SELECT relrowsecurity INTO rls_on FROM pg_class WHERE oid = 'public.to_archive'::regclass;
  IF NOT rls_on THEN RAISE EXCEPTION 'to_archive RLS not enabled'; END IF;
  SELECT relrowsecurity INTO rls_on FROM pg_class WHERE oid = 'public.events_archive'::regclass;
  IF NOT rls_on THEN RAISE EXCEPTION 'events_archive RLS not enabled'; END IF;
END $$;

COMMIT;
```

---

## Сырой output psql (с `-e`)

```
BEGIN;
BEGIN
ALTER TABLE public.to_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE
REVOKE ALL ON public.to_archive FROM PUBLIC;
REVOKE
REVOKE ALL ON public.to_archive FROM web_anon;
REVOKE
REVOKE ALL ON public.to_archive FROM authenticated;
REVOKE
ALTER TABLE public.events_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE
REVOKE ALL ON public.events_archive FROM PUBLIC;
REVOKE
REVOKE ALL ON public.events_archive FROM web_anon;
REVOKE
REVOKE ALL ON public.events_archive FROM authenticated;
REVOKE
DO $$ ... END $$;
DO
COMMIT;
COMMIT
```

**Разбор:**
- 2 × `ALTER TABLE … ENABLE ROW LEVEL SECURITY` — обе прошли.
- 6 × `REVOKE` — все прошли (REVOKE no-op, если привилегии не было).
- `DO $$ … END $$;` → `DO` (smoke прошёл).
- `COMMIT` → `COMMIT`.

---

## Верификации после COMMIT

### RLS-status и ACL обеих таблиц

**SQL:**
```sql
SELECT relname, relrowsecurity AS rls_enabled, relacl
FROM pg_class
WHERE oid IN ('public.to_archive'::regclass, 'public.events_archive'::regclass)
ORDER BY relname;
```

**Результат:**
```
    relname     | rls_enabled |           relacl
----------------+-------------+-----------------------------
 events_archive | t           | {gen_user=arwdDxt/gen_user}
 to_archive     | t           | {gen_user=arwdDxt/gen_user}
(2 rows)
```

✅ **Обе таблицы:**
- `rls_enabled=t` — RLS включён
- ACL содержит **только gen_user** — никаких PUBLIC/web_anon/authenticated

### Owner-bypass (числа сходятся с v2)

**SQL:**
```sql
SELECT count(*) AS to_archive_count FROM public.to_archive;
SELECT count(*) AS events_archive_count FROM public.events_archive;
```

**Результат:**
```
 to_archive_count
------------------
               63

 events_archive_count
----------------------
                   72
```

✅ **63** строк в `to_archive`, **72** в `events_archive` — ровно как в v2 раздел «Полный список 28 таблиц без RLS». Owner-bypass работает, данные не потеряны.

---

## Что изменилось в проде

**Было:** Обе таблицы с RLS=off, 0 политик. ACL `to_archive` и `events_archive` — `{gen_user=arwdDxt/gen_user}` (после вчерашнего REVOKE FROM PUBLIC).

**Стало:** RLS=on, политик нет, ACL не изменился (REVOKE'и были no-op'ами). Двойная защита активна.

### Эффект на данные

- 63 строки в `to_archive` — на месте, доступны через `gen_user`.
- 72 строки в `events_archive` — на месте.

### Эффект на роли

| Роль | `to_archive` / `events_archive` |
|---|---|
| `gen_user` (owner) | полный доступ через owner-bypass |
| `postgres` (super) | полный доступ |
| `web_anon` | 0 строк / 403 |
| `authenticated` | 0 строк / 403 |

### Эффект на боевые потоки

Никакого. Эти таблицы — `to_archive` и `events_archive` — никем не читаются в текущем фронте/бекенде (см. v2 заметки про legacy/archive). Если когда-нибудь понадобится запрос — только под `gen_user` или `postgres`.

📝 **На будущее:** в CLEAN-007 (BACKLOG) есть пункт про DROP `to_archive` (без PK, явно мусор). Эта фаза не удаляет таблицы — только закрывает их от случайного доступа.

---

## Статус

**✅ ФАЗА 5 ЗАКРЫТА.** Архивные таблицы под двойной защитой, данные на месте, gen_user доступ сохранён.

## Следующий шаг

**Жду подтверждения «идём в фазу 6»** — `messages`: DELETE 4 тестовых строк от 2026-03-17 + RLS-on без политик + REVOKE. Включает важный rollback-блок с восстановлением 4 строк и `ALTER SEQUENCE messages_id_seq RESTART WITH 5`.
