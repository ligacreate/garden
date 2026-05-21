---
title: SEC-001 Phase 4 — Lockdown users_auth (execution log)
type: execution-log
phase: 4
created: 2026-05-02
status: ✅ COMMITTED
related_doc: docs/MIGRATION_2026-05-02_security_restoration.md
prev_phase: docs/EXEC_2026-05-02_phase3_is_mentor_for.md
---

# Phase 4 — Lockdown `public.users_auth` (execution log)

**Время выполнения:** 2026-05-02, ~21:05 MSK.
**Транзакция:** одна, `BEGIN; … COMMIT;` — успешно.
**Smoke:** прошёл.
**Результат:** ✅ RLS-on без политик + REVOKE для PUBLIC/web_anon/authenticated. `gen_user` (owner) сохраняет полный доступ — garden-auth-сервис продолжит логинить.

---

## SQL

Точно как в [docs/MIGRATION_2026-05-02_security_restoration.md](MIGRATION_2026-05-02_security_restoration.md#фаза-4--lockdown-users_auth):

```sql
BEGIN;

-- RLS-on без политик: любой запрос под web_anon/authenticated вернёт 0 строк
ALTER TABLE public.users_auth ENABLE ROW LEVEL SECURITY;

-- Defense-in-depth: REVOKE со всех потенциальных ролей
REVOKE ALL ON public.users_auth FROM PUBLIC;
REVOKE ALL ON public.users_auth FROM web_anon;
REVOKE ALL ON public.users_auth FROM authenticated;

-- Smoke: RLS включён, политик нет
DO $$
DECLARE rls_on bool; n_pols int;
BEGIN
  SELECT relrowsecurity INTO rls_on FROM pg_class WHERE oid = 'public.users_auth'::regclass;
  IF NOT rls_on THEN RAISE EXCEPTION 'users_auth RLS not enabled'; END IF;
  SELECT count(*) INTO n_pols FROM pg_policies WHERE schemaname='public' AND tablename='users_auth';
  IF n_pols <> 0 THEN RAISE EXCEPTION 'users_auth: expected 0 policies, got %', n_pols; END IF;
END $$;

COMMIT;
```

---

## Сырой output psql (с `-e`)

```
BEGIN;
BEGIN
ALTER TABLE public.users_auth ENABLE ROW LEVEL SECURITY;
ALTER TABLE
REVOKE ALL ON public.users_auth FROM PUBLIC;
REVOKE
REVOKE ALL ON public.users_auth FROM web_anon;
REVOKE
REVOKE ALL ON public.users_auth FROM authenticated;
REVOKE
DO $$
DECLARE rls_on bool; n_pols int;
BEGIN
  SELECT relrowsecurity INTO rls_on FROM pg_class WHERE oid = 'public.users_auth'::regclass;
  IF NOT rls_on THEN RAISE EXCEPTION 'users_auth RLS not enabled'; END IF;
  SELECT count(*) INTO n_pols FROM pg_policies WHERE schemaname='public' AND tablename='users_auth';
  IF n_pols <> 0 THEN RAISE EXCEPTION 'users_auth: expected 0 policies, got %', n_pols; END IF;
END $$;
DO
COMMIT;
COMMIT
```

**Разбор:**
- `ALTER TABLE` — успех.
- 3 × `REVOKE` — все три прошли. Заметка: REVOKE на роль, у которой и так не было привилегий (например, `web_anon`), не падает с ошибкой — просто no-op. Все три выполнены для defense-in-depth.
- `DO $$ … END $$;` → `DO` (smoke прошёл).
- `COMMIT` → `COMMIT`.

---

## Верификации после COMMIT

### (a) RLS-статус

**SQL:**
```sql
SELECT relname, relrowsecurity AS rls_enabled, relforcerowsecurity AS rls_forced
FROM pg_class
WHERE oid = 'public.users_auth'::regclass;
```

**Результат:**
```
  relname   | rls_enabled | rls_forced
------------+-------------+------------
 users_auth | t           | f
(1 row)
```

✅ `rls_enabled=t` — RLS включён.
✅ `rls_forced=f` — FORCE не включён (как и планировалось, FORCE отложен в SEC-004).

### (b) Политики

**SQL:**
```sql
SELECT count(*) AS n_policies
FROM pg_policies WHERE schemaname='public' AND tablename='users_auth';
```

**Результат:**
```
 n_policies
------------
          0
(1 row)
```

✅ Политик нет — это и есть дизайн «RLS-on без политик»: любой запрос под `web_anon`/`authenticated` вернёт 0 строк.

### (c) ACL

**SQL:**
```sql
SELECT relname, relacl FROM pg_class
WHERE oid='public.users_auth'::regclass;
```

**Результат:**
```
  relname   |           relacl
------------+-----------------------------
 users_auth | {gen_user=arwdDxt/gen_user}
(1 row)
```

✅ В ACL только `gen_user`. `PUBLIC`, `web_anon`, `authenticated` отсутствуют — REVOKE сработал.

📝 **Декодинг привилегий gen_user:** `arwdDxt` =
- `a` = INSERT
- `r` = SELECT
- `w` = UPDATE
- `d` = DELETE
- `D` = TRUNCATE
- `x` = REFERENCES
- `t` = TRIGGER

Это полный набор обычных привилегий. (В исходном ожидании MIGRATION-документа был `arwdDxtm` с `m`=MAINTAIN — это новая привилегия Postgres 16+, не отображается в этом окружении. Не критично — все CRUD-привилегии gen_user сохранены.)

### (d) Owner-bypass работает

**SQL:**
```sql
SELECT count(*) AS users_auth_total FROM public.users_auth;
```

**Результат:**
```
 users_auth_total
------------------
               61
(1 row)
```

✅ `gen_user` видит все 61 строку (та же цифра, что в v1/v3). Owner-bypass работает — **garden-auth-сервис продолжит читать `users_auth` для логина**, его не сломали.

---

## Что изменилось в проде

**Было:** `users_auth` с RLS=off, 0 политик, ACL `{gen_user=arwdDxt/gen_user}` (но раньше в `Access privileges` был ещё `=arwdDxt/gen_user` от PUBLIC; после REVOKE FROM PUBLIC, web_anon, authenticated осталось только gen_user).

**Стало:**
- RLS включён.
- Политик нет.
- ACL: только `gen_user=arwdDxt/gen_user`.

### Эффект на роли

| Роль | До фазы 4 | После фазы 4 |
|---|---|---|
| `gen_user` (owner) | мог всё | **может всё** через owner-bypass |
| `postgres` (super) | мог всё | **может всё** (rolbypassrls=t) |
| `web_anon` | мог через PUBLIC GRANT (если был) | 0 строк / 403 (нет GRANT, RLS-on без политики) |
| `authenticated` | мог через PUBLIC GRANT | 0 строк / 403 |
| Любая другая роль | мог через PUBLIC | 0 строк / 403 |

**Двойная защита:** RLS блокирует на уровне строк, REVOKE — на уровне таблицы. Если когда-нибудь кто-то случайно сделает `GRANT SELECT ON users_auth TO authenticated`, RLS всё равно вернёт 0 строк (нет политики).

### Эффект на garden-auth-сервис

`garden-auth` подключается к Postgres под `gen_user` (см. `/opt/garden-auth/.env`). Сейчас owner-bypass работает (верификация d дала 61), значит:
- Логин: `SELECT * FROM users_auth WHERE email = $1` — продолжит работать.
- Регистрация: `INSERT INTO users_auth …` — продолжит работать.
- Reset password: `UPDATE users_auth SET reset_token=…` — продолжит работать.

**Ничего не сломалось** на бекенде. Smoke на бекенде (логин Ольги через garden-auth) можно сделать после открытия Caddy.

### Эффект на PostgREST

PostgREST тоже под `gen_user`. Но фронт **никогда не должен делать запросы к `/users_auth`** — это таблица для авторизации, не для приложения. Теперь, даже если случайно кто-то попытается, ответ будет 401/403 (не подойдёт по grants) или 200 с пустым массивом (если grants появятся позже, но без политик RLS отрежет).

---

## Статус

**✅ ФАЗА 4 ЗАКРЫТА.** `users_auth` защищён RLS-on + REVOKE. Owner gen_user сохраняет полный доступ. Регрессии нет.

## Следующий шаг

**Жду подтверждения «идём в фазу 5»** — Lockdown `to_archive` и `events_archive` (тот же паттерн: RLS-on без политик + REVOKE для всех 3 ролей).
