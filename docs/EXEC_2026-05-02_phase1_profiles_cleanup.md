---
title: SEC-001 Phase 1 — Чистка 10 дублей политик profiles (execution log)
type: execution-log
phase: 1
created: 2026-05-02
status: ✅ COMMITTED
related_doc: docs/MIGRATION_2026-05-02_security_restoration.md
prev_phase: docs/EXEC_2026-05-02_phase0_preflight.md
---

# Phase 1 — Чистка 10 дублей политик `profiles` (execution log)

**Время выполнения:** 2026-05-02, ~20:05 MSK.
**Подключение:** `ssh root@5.129.251.56` → `psql -e -h "$DB_HOST" -U gen_user -d default_db`.
**Транзакция:** одна, `BEGIN; … COMMIT;`.
**Smoke:** прошёл (`DO $$` без RAISE).
**Результат:** ✅ COMMIT, осталось ровно 4 политики на `public.profiles`.

---

## SQL

Точно как в [docs/MIGRATION_2026-05-02_security_restoration.md](MIGRATION_2026-05-02_security_restoration.md#фаза-1--чистка-10-дублей-политик-profiles), скопировано без изменений:

```sql
BEGIN;

-- SELECT-дубли с qual=true (3 шт.)
DROP POLICY IF EXISTS "Map_View_All" ON public.profiles;
DROP POLICY IF EXISTS "Public View" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;

-- UPDATE-дубли по auth.uid()=id (3 шт., оставляем profiles_update_own)
DROP POLICY IF EXISTS "Self Update" ON public.profiles;
DROP POLICY IF EXISTS "User_Edit_Self" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;

-- INSERT-дубли по auth.uid()=id (2 шт., оставляем profiles_insert_own)
DROP POLICY IF EXISTS "User_Insert_Self" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;

-- Hardcoded olga@skrebeyko.com (2 шт., замена is_admin() уже покрыта profiles_update_admin)
DROP POLICY IF EXISTS "Olga Power" ON public.profiles;
DROP POLICY IF EXISTS "Olga_Power_Profiles" ON public.profiles;

-- Smoke: остаётся ровно 4 политики
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename='profiles';
  IF n <> 4 THEN RAISE EXCEPTION 'Expected 4 profiles policies, got %', n; END IF;
END $$;

COMMIT;
```

---

## Сырой output psql (с `-e`, echo queries)

```
BEGIN;
BEGIN
DROP POLICY IF EXISTS "Map_View_All" ON public.profiles;
DROP POLICY
DROP POLICY IF EXISTS "Public View" ON public.profiles;
DROP POLICY
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
DROP POLICY
DROP POLICY IF EXISTS "Self Update" ON public.profiles;
DROP POLICY
DROP POLICY IF EXISTS "User_Edit_Self" ON public.profiles;
DROP POLICY
DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;
DROP POLICY
DROP POLICY IF EXISTS "User_Insert_Self" ON public.profiles;
DROP POLICY
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
DROP POLICY
DROP POLICY IF EXISTS "Olga Power" ON public.profiles;
DROP POLICY
DROP POLICY IF EXISTS "Olga_Power_Profiles" ON public.profiles;
DROP POLICY
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename='profiles';
  IF n <> 4 THEN RAISE EXCEPTION 'Expected 4 profiles policies, got %', n; END IF;
END $$;
DO
COMMIT;
COMMIT
```

**Разбор:**
- Каждый `DROP POLICY` отработал успешно (10 раз `DROP POLICY` в ответе).
- `DO $$ … END $$;` отработал без ошибки → ответ `DO` (если бы был `RAISE EXCEPTION`, было бы `ERROR: Expected 4 profiles policies, got X` и автоматический `ROLLBACK`).
- `COMMIT` → `COMMIT`. Транзакция применена.

---

## Верификационный SELECT после COMMIT

**SQL:**
```sql
SELECT policyname, cmd FROM pg_policies
WHERE schemaname='public' AND tablename='profiles'
ORDER BY policyname;
```

**Результат:**
```
          policyname           |  cmd
-------------------------------+--------
 profiles_insert_own           | INSERT
 profiles_select_authenticated | SELECT
 profiles_update_admin         | UPDATE
 profiles_update_own           | UPDATE
(4 rows)
```

**Соответствие ожидаемому:**

| Ожидалось | Получено | ✓/✗ |
|---|---|:---:|
| `profiles_insert_own` INSERT | `profiles_insert_own` INSERT | ✓ |
| `profiles_select_authenticated` SELECT | `profiles_select_authenticated` SELECT | ✓ |
| `profiles_update_admin` UPDATE | `profiles_update_admin` UPDATE | ✓ |
| `profiles_update_own` UPDATE | `profiles_update_own` UPDATE | ✓ |
| Всего: 4 строки | 4 строки | ✓ |

---

## Что изменилось в проде

**Было (до фазы 1):** 14 политик на `public.profiles`, включая:
- 3 SELECT с `qual=true` (открывали profiles всем, в том числе `web_anon`)
- 3 UPDATE-дубля по `auth.uid()=id`
- 2 INSERT-дубля
- 2 ALL-политики с hardcoded `olga@skrebeyko.com`
- 4 «правильных» политики

**Стало (после фазы 1):** 4 политики на `public.profiles`:
- `profiles_select_authenticated` — `USING (auth.uid() IS NOT NULL)`
- `profiles_insert_own` — `WITH CHECK (auth.uid() = id)`
- `profiles_update_own` — `USING/CHECK (auth.uid() = id)`
- `profiles_update_admin` — `USING/CHECK (is_admin())`

**Эффект на анонимных пользователей.** Раньше `Map_View_All` / `Public View` / `Public profiles are viewable by everyone.` пропускали всех (`qual=true`). Теперь под `web_anon` (без JWT) `auth.uid()` = NULL, политика `profiles_select_authenticated` не пропустит. **Анонимный SELECT на `profiles` теперь возвращает 0 строк.**

**Эффект на залогиненных.** `profiles_select_authenticated` (`auth.uid() IS NOT NULL`) пропускает любого залогиненного, политики складываются по OR — модель «доверенного сообщества» (Вариант A решения владельца) сохраняется. Никаких функциональных изменений для пользователей в кабинете.

**Эффект на admin.** Hardcoded `Olga Power` / `Olga_Power_Profiles` (ALL для одного email) больше нет. `profiles_update_admin` через `is_admin()` (см. [migrations/22_profiles_default_applicant_role.sql](migrations/22_profiles_default_applicant_role.sql) контекст и v1) покрывает 3 действующих админов, а не одного. Регрессии нет.

---

## Статус

**✅ ФАЗА 1 ЗАКРЫТА.** 10 политик удалены, 4 оставшиеся работают. Верификация пройдена.

## Следующий шаг

**Жду подтверждения «идём в фазу 2»** — замена hardcoded `olga@skrebeyko.com` в `KB_Update_Admin` / `KB_Delete_Admin` на role-based через `is_admin()`.
