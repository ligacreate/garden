---
title: SEC-001 Phase 7 — push_subscriptions: RLS-on lockdown (execution log)
type: execution-log
phase: 7
created: 2026-05-02
status: ✅ COMMITTED
related_doc: docs/MIGRATION_2026-05-02_security_restoration.md
prev_phase: docs/EXEC_2026-05-02_phase6_messages_lockdown.md
---

# Phase 7 — `push_subscriptions`: RLS-on без политик (execution log)

**Время выполнения:** 2026-05-02, ~21:35 MSK.
**Транзакция:** одна, `BEGIN; … COMMIT;` — успешно с первой попытки.
**Smoke:** прошёл.
**Результат:** ✅ `push_subscriptions` под защитой RLS-on + REVOKE. Таблица пуста (фича web-push не активна).

---

## SQL

Точно как в [docs/MIGRATION_2026-05-02_security_restoration.md](MIGRATION_2026-05-02_security_restoration.md#фаза-7--push_subscriptions-rls-on-без-политик):

```sql
BEGIN;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_subscriptions FROM PUBLIC;
REVOKE ALL ON public.push_subscriptions FROM web_anon;
REVOKE ALL ON public.push_subscriptions FROM authenticated;

-- Smoke
DO $$
DECLARE rls_on bool;
BEGIN
  SELECT relrowsecurity INTO rls_on FROM pg_class WHERE oid='public.push_subscriptions'::regclass;
  IF NOT rls_on THEN RAISE EXCEPTION 'push_subscriptions RLS not enabled'; END IF;
END $$;

COMMIT;
```

---

## Сырой output psql (с `-e`)

```
BEGIN;
BEGIN
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE
REVOKE ALL ON public.push_subscriptions FROM PUBLIC;
REVOKE
REVOKE ALL ON public.push_subscriptions FROM web_anon;
REVOKE
REVOKE ALL ON public.push_subscriptions FROM authenticated;
REVOKE
DO $$ ... END $$;
DO
COMMIT;
COMMIT
```

**Разбор:**
- `ALTER TABLE` — успех.
- 3 × `REVOKE` — все прошли.
- `DO` — smoke прошёл.
- `COMMIT` — транзакция применена.

---

## Верификации после COMMIT

### RLS-status и ACL

**SQL:**
```sql
SELECT relname, relrowsecurity AS rls_enabled, relacl
FROM pg_class WHERE oid='public.push_subscriptions'::regclass;
```

**Результат:**
```
      relname       | rls_enabled |           relacl
--------------------+-------------+-----------------------------
 push_subscriptions | t           | {gen_user=arwdDxt/gen_user}
(1 row)
```

✅ `rls_enabled=t`, ACL только gen_user (PUBLIC/web_anon/authenticated отозваны).

### Политики

```
 n_policies
------------
          0
```

✅ 0 политик — дизайн «RLS-on без политик».

### Row count

```
 push_subs_count
-----------------
               0
```

✅ Таблица пуста (как и было в v3 — фича web-push не активна, никто не подписан).

---

## Что изменилось в проде

**Было:** `push_subscriptions` с RLS=off, 0 политик, 0 строк, ACL `{gen_user=arwdDxt/gen_user}` (после вчерашнего REVOKE FROM PUBLIC из SEC-001 этап 0).

**Стало:** RLS=on, политик нет, 0 строк, ACL без изменений.

### Эффект на роли

| Роль | После фазы 7 |
|---|---|
| `gen_user` (owner) | полный доступ через owner-bypass |
| `postgres` (super) | полный доступ |
| `web_anon` | 0 строк / 403 |
| `authenticated` | 0 строк / 403 |

### Эффект на фичу web-push

Фича сейчас неактивна (0 строк). Когда её включат:
- Push-сервер ходит к БД через свой connection (см. push-server в репо). Если там используется `gen_user` — owner-bypass позволит читать/писать.
- Если push-сервер будет ходить под другой ролью — потребуется явно дать `GRANT INSERT, UPDATE ON push_subscriptions TO <push_role>` и написать RLS-политики (`user_id = auth.uid()` для пользовательских подписок).
- Это вне scope SEC-001. Сейчас защита просто блокирует случайный SELECT под `web_anon`/`authenticated`.

### Что важно при будущей активации web-push

📝 **Заметка на будущее:** при включении web-push нужно:
1. Решить, под какой ролью ходит push-сервер.
2. Если под `gen_user` — ничего дополнительно делать не надо (owner-bypass).
3. Если под `authenticated` (фронт пишет подписки напрямую) — нужны RLS-политики:
   - `user_id = auth.uid()` для всех CRUD.
   - `endpoint` уникален — это уже есть в схеме (UNIQUE constraint).

---

## Статус

**✅ ФАЗА 7 ЗАКРЫТА.** `push_subscriptions` под RLS-on + REVOKE. Готово к будущей активации фичи (после написания политик в отдельной задаче).

## Следующий шаг

**Жду подтверждения «идём в фазу 8»** — `birthday_templates`: RLS + **4 политики** (SELECT для всех authenticated, CRUD только админу через `is_admin()`). Это первая фаза с CREATE POLICY, не просто lockdown.
