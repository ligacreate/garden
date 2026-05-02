---
title: SEC-001 Phase 3 — Хелпер is_mentor_for(uuid) (execution log)
type: execution-log
phase: 3
created: 2026-05-02
status: ✅ COMMITTED (после двух заминок с правами gen_user)
related_doc: docs/MIGRATION_2026-05-02_security_restoration.md
prev_phase: docs/EXEC_2026-05-02_phase2_kb_admin.md
---

# Phase 3 — Создание хелпера `public.is_mentor_for(uuid)` (execution log)

**Время выполнения:** 2026-05-02, 20:15–21:00 MSK (с диагностикой и решением проблем с правами).
**Транзакция:** одна (третья попытка), `BEGIN; … COMMIT;` — успешно.
**Результат:** ✅ Функция создана, работает, верификации (a)/(b)/(c) прошли.

---

## Краткая хронология (важно для будущих чатов)

Фаза 3 не пошла с первого раза — обнаружились две неожиданные особенности окружения Timeweb. Все они **зафиксированы как уроки** для будущих миграций.

### Попытка 1 — `permission denied for schema public`

`gen_user` не имел права `CREATE` на схему `public`. Owner таблиц `public.*` ≠ право `CREATE` на схему. Транзакция автоматически откатилась.

### Попытка 2 — снова `permission denied for schema public` (после первого GRANT)

Под postgres в Timeweb-консоли был выполнен `GRANT CREATE ON SCHEMA public TO gen_user;`, но… в **другой БД** (не `default_db`). Наша SSH-сессия это не увидела. Транзакция снова откатилась.

### Попытка 3 — `CREATE FUNCTION` прошёл, но вызов функции упал `permission denied for table pvl_garden_mentor_links`

Под postgres GRANT теперь точно попал в `default_db` (Ольга подтвердила скриншотом `current_database = default_db, can_create = t`). Функция создалась, COMMIT прошёл. Но при попытке вызвать функцию — ошибка.

Корень: **в Timeweb есть web-форма «Привилегии для gen_user»**, которая работает не как простой `GRANT`, а как **snapshot замены ACL**. При сохранении она делает `REVOKE ALL FROM gen_user; GRANT (только отмеченные галочки) TO gen_user;`. У Ольги в этой форме были отмечены только `CREATE` и `CREATEROLE`. Все галочки на «Доступ к данным» (SELECT/INSERT/UPDATE/DELETE) и «Другое» сняты.

Это:
- Сломало owner-семантику для нашего пути ssh+psql (gen_user — owner таблиц, но без явного GRANT на SELECT не мог читать через PostgreSQL сейчас).
- Сделало `SECURITY DEFINER`-функцию нерабочей: definer = gen_user, но у gen_user отняли SELECT на саму таблицу.
- Потенциально сломало бы PostgREST и garden-auth на проде, если бы Caddy был открыт.

### Решение

Ольга в Timeweb-форме «Привилегии gen_user/default_db» **поставила все галочки** (SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER + USAGE/CREATE/EXECUTE) и сохранила. После этого:

```
has_schema_privilege gen_user public CREATE | t
has_schema_privilege gen_user public USAGE  | t
SELECT count(*) FROM pvl_garden_mentor_links | 19
SELECT count(*) FROM profiles                | 59
SELECT count(*) FROM messages                | 4
SELECT public.is_mentor_for('1085e06d-…')    | false ← без ошибки
```

Все проверки прошли. Функция работает.

---

## SQL фазы 3 (исполнение, попытка 3)

Точно как в [docs/MIGRATION_2026-05-02_security_restoration.md](MIGRATION_2026-05-02_security_restoration.md#фаза-3--хелпер-publicis_mentor_foruuid):

```sql
BEGIN;

CREATE OR REPLACE FUNCTION public.is_mentor_for(student_uuid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.pvl_garden_mentor_links
    WHERE student_id = student_uuid
      AND mentor_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_mentor_for(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_mentor_for(uuid) FROM PUBLIC;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname='public' AND p.proname='is_mentor_for';
  IF n <> 1 THEN RAISE EXCEPTION 'is_mentor_for not created'; END IF;
END $$;

COMMIT;
```

## Сырой output psql (попытка 3 — успешная)

```
BEGIN;
BEGIN
CREATE OR REPLACE FUNCTION public.is_mentor_for(student_uuid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.pvl_garden_mentor_links
    WHERE student_id = student_uuid
      AND mentor_id = auth.uid()
  );
$$;
CREATE FUNCTION
GRANT EXECUTE ON FUNCTION public.is_mentor_for(uuid) TO authenticated;
GRANT
REVOKE EXECUTE ON FUNCTION public.is_mentor_for(uuid) FROM PUBLIC;
REVOKE
DO $$ ... END $$;
DO
COMMIT;
COMMIT
```

---

## Верификации (все после восстановления прав gen_user)

### (a) Функция существует, SECURITY DEFINER, STABLE

```sql
SELECT proname, prosecdef AS security_definer,
       provolatile AS volatility, prorettype::regtype AS returns
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname='is_mentor_for';
```

```
    proname    | security_definer | volatility | returns
---------------+------------------+------------+---------
 is_mentor_for | t                | s          | boolean
(1 row)
```

✅ `prosecdef=t` (SECURITY DEFINER), `provolatile=s` (STABLE), `returns=boolean`.

### (b) EXECUTE-привилегии

```sql
SELECT grantee, privilege_type
FROM information_schema.routine_privileges
WHERE specific_schema='public' AND routine_name='is_mentor_for'
ORDER BY grantee, privilege_type;
```

```
    grantee    | privilege_type
---------------+----------------
 authenticated | EXECUTE
 gen_user      | EXECUTE
(2 rows)
```

✅ `authenticated` имеет EXECUTE — корректно.
✅ `gen_user` имеет EXECUTE — это владелец функции, после восстановления прав получил GRANT в общем пакете. PUBLIC отсутствует (REVOKE сработал). web_anon — не появился (никогда не получал EXECUTE).

### (c) Тестовый вызов под gen_user

```sql
SELECT public.is_mentor_for('1085e06d-34ad-4e7e-b337-56a0c19cc43f') AS test_call;
```

```
 test_call
-----------
 f
(1 row)
```

✅ `false` — корректно. `gen_user` подключился без JWT (`auth.uid()` = NULL), `mentor_id = auth.uid()` ни для кого не сработает, функция вернула `false`.

---

## Что изменилось в проде

### Создано

1. **Функция `public.is_mentor_for(uuid)`** — `SECURITY DEFINER STABLE`, `SET search_path = public, pg_temp`. Тело: `EXISTS (SELECT 1 FROM pvl_garden_mentor_links WHERE student_id = $1 AND mentor_id = auth.uid())`.

2. **GRANT EXECUTE TO authenticated** — `is_mentor_for` доступна всем залогиненным.

3. **REVOKE EXECUTE FROM PUBLIC** — анонимы не могут вызвать.

### Побочные изменения (не часть фазы 3, но связаны)

4. **`gen_user` получил `CREATE` на схему `public`** — был выполнен под postgres `GRANT CREATE ON SCHEMA public TO gen_user;`. Это нужно было для `CREATE FUNCTION`. **После полного завершения миграции (после фазы 14) — отозвать обратно: `REVOKE CREATE ON SCHEMA public FROM gen_user;`** (см. чек-лист ниже).

5. **`gen_user` была восстановлена в полном объёме прав** через Timeweb web-форму «Привилегии gen_user/default_db». Это вернуло то, что было до случайного «обнуления» через ту же форму.

---

## Уроки (для будущих миграций и для CLAUDE.md)

### Урок 1: gen_user — owner таблиц ≠ может всё в схеме

Owner-привилегии в Postgres работают только на уровне таблицы, не на уровне схемы. Для `CREATE FUNCTION public.…` нужен явный `CREATE` на схеме `public`, даже если ты owner всех существующих таблиц в этой схеме.

### Урок 2: GRANT под postgres надо подтверждать в нужной БД

В Timeweb-консоли стандартная БД для postgres-сессии может быть не `default_db`. Перед `GRANT CREATE ON SCHEMA public TO gen_user;` обязательно `\c default_db` или явное указание БД.

Способ проверки в той же сессии:
```sql
SELECT current_database(), has_schema_privilege('gen_user', 'public', 'CREATE');
```

### Урок 3: 🔴 НЕ ИСПОЛЬЗОВАТЬ web-форму «Привилегии gen_user» в Timeweb во время миграции

Эта форма работает как **snapshot ACL**: при сохранении она делает `REVOKE ALL FROM gen_user; GRANT (только что отмечено) TO gen_user;`. Если тебе нужно изменить точечную привилегию, **не используй галочки** — выполни SQL `GRANT ... TO gen_user;` в SQL-консоли. Иначе ты случайно сбросишь все остальные привилегии и всё сломается.

### Урок 4: SECURITY DEFINER + Timeweb-pooler требуют явных GRANT'ов

SECURITY DEFINER-функция исполняется с правами владельца функции. Но если у владельца отозваны GRANT'ы на используемые таблицы (даже при сохранении ownership), функция падает с `permission denied`. На обычном Postgres owner-bypass работал бы; в Timeweb-окружении (через connection pooler) — нет.

Это значит: **для каждой `SECURITY DEFINER`-функции нужно явно гарантировать, что у её владельца есть GRANT'ы на все таблицы в её теле**. Не полагаться на owner-bypass.

---

## Чек-лист после завершения всей миграции (фаза 14+)

- [ ] **Отозвать `CREATE` на схему `public` у `gen_user`:**
  ```sql
  -- Под postgres в default_db:
  REVOKE CREATE ON SCHEMA public FROM gen_user;
  ```
  Это право нужно было только для создания `is_mentor_for`. После завершения миграции лишний privilege.

- [ ] **Запомнить: НЕ открывать Timeweb web-форму «Привилегии gen_user» без необходимости.** Если открыта и сохранена — могут сброситься все галочки кроме отмеченных.

- [ ] **При деплое любых будущих SECURITY DEFINER-функций** — явно проверять, что у `gen_user` есть GRANT'ы на используемые таблицы.

---

## Статус

**✅ ФАЗА 3 ЗАКРЫТА.** Функция `is_mentor_for(uuid)` создана, EXECUTE настроен, верификации (a)/(b)/(c) пройдены. Все будущие фазы (10/11/12) могут использовать её в RLS-политиках.

## Следующий шаг

**Жду подтверждения «идём в фазу 4»** — Lockdown `users_auth` (RLS-on без политик + REVOKE для PUBLIC/web_anon/authenticated).
