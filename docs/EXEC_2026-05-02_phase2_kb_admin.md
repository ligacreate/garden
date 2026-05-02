---
title: SEC-001 Phase 2 — Замена hardcoded-Olga в knowledge_base (execution log)
type: execution-log
phase: 2
created: 2026-05-02
status: ✅ COMMITTED
related_doc: docs/MIGRATION_2026-05-02_security_restoration.md
prev_phase: docs/EXEC_2026-05-02_phase1_profiles_cleanup.md
---

# Phase 2 — Замена hardcoded `olga@skrebeyko.com` в `knowledge_base` (execution log)

**Время выполнения:** 2026-05-02, ~20:08 MSK.
**Подключение:** `ssh root@5.129.251.56` → `psql -e -h "$DB_HOST" -U gen_user -d default_db`.
**Транзакция:** одна, `BEGIN; … COMMIT;`.
**Smoke:** прошёл (`DO $$` без RAISE).
**Результат:** ✅ COMMIT, на `knowledge_base` стало 5 политик: 3 старых (`KB_Edit_Auth`, `KB_Insert_Auth`, `KB_View_All`) + 2 новых role-based (`kb_update_admin`, `kb_delete_admin`).

---

## SQL

Точно как в [docs/MIGRATION_2026-05-02_security_restoration.md](MIGRATION_2026-05-02_security_restoration.md#фаза-2--замена-hardcoded-olga-в-knowledge_base), скопировано без изменений:

```sql
BEGIN;

DROP POLICY IF EXISTS "KB_Update_Admin" ON public.knowledge_base;
DROP POLICY IF EXISTS "KB_Delete_Admin" ON public.knowledge_base;

CREATE POLICY kb_update_admin ON public.knowledge_base
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY kb_delete_admin ON public.knowledge_base
  FOR DELETE TO authenticated
  USING (is_admin());

-- Smoke: проверяем, что новые admin-политики появились
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policies
    WHERE schemaname='public' AND tablename='knowledge_base'
      AND policyname IN ('kb_update_admin','kb_delete_admin');
  IF n <> 2 THEN RAISE EXCEPTION 'Expected 2 new KB admin policies, got %', n; END IF;
END $$;

COMMIT;
```

---

## Сырой output psql (с `-e`)

```
BEGIN;
BEGIN
DROP POLICY IF EXISTS "KB_Update_Admin" ON public.knowledge_base;
DROP POLICY
DROP POLICY IF EXISTS "KB_Delete_Admin" ON public.knowledge_base;
DROP POLICY
CREATE POLICY kb_update_admin ON public.knowledge_base
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY
CREATE POLICY kb_delete_admin ON public.knowledge_base
  FOR DELETE TO authenticated
  USING (is_admin());
CREATE POLICY
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policies
    WHERE schemaname='public' AND tablename='knowledge_base'
      AND policyname IN ('kb_update_admin','kb_delete_admin');
  IF n <> 2 THEN RAISE EXCEPTION 'Expected 2 new KB admin policies, got %', n; END IF;
END $$;
DO
COMMIT;
COMMIT
```

**Разбор:**
- 2 × `DROP POLICY` — оба отработали успешно.
- 2 × `CREATE POLICY` — обе отработали успешно.
- `DO $$ … END $$;` — `DO` (smoke прошёл, RAISE не сработал → `n = 2`).
- `COMMIT;` → `COMMIT`. Транзакция применена.

---

## Верификационный SELECT после COMMIT

**SQL:**
```sql
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname='public' AND tablename='knowledge_base'
ORDER BY policyname;
```

**Результат:**
```
   policyname    |  cmd   |                 qual                  |              with_check
-----------------+--------+---------------------------------------+---------------------------------------
 KB_Edit_Auth    | ALL    | (auth.role() = 'authenticated'::text) | (auth.role() = 'authenticated'::text)
 KB_Insert_Auth  | INSERT |                                       | (auth.role() = 'authenticated'::text)
 KB_View_All     | SELECT | true                                  |
 kb_delete_admin | DELETE | is_admin()                            |
 kb_update_admin | UPDATE | is_admin()                            | is_admin()
(5 rows)
```

**Соответствие ожидаемому:**

| Ожидалось | Получено | ✓/✗ |
|---|---|:---:|
| `KB_Edit_Auth` ALL `auth.role() = 'authenticated'` (то же) | ✓ совпало | ✓ |
| `KB_Insert_Auth` INSERT — `auth.role() = 'authenticated'` | ✓ совпало | ✓ |
| `KB_View_All` SELECT `true` — | ✓ совпало | ✓ |
| `kb_delete_admin` DELETE `is_admin()` — | ✓ совпало | ✓ |
| `kb_update_admin` UPDATE `is_admin()` `is_admin()` | ✓ совпало | ✓ |
| Всего: 5 строк | 5 строк | ✓ |

---

## Что изменилось в проде

**Было (до фазы 2):** 5 политик на `public.knowledge_base`, из них:
- `KB_Update_Admin` ALL UPDATE — `(auth.jwt() ->> 'email') = 'olga@skrebeyko.com'`
- `KB_Delete_Admin` ALL DELETE — `(auth.jwt() ->> 'email') = 'olga@skrebeyko.com'`
- `KB_Edit_Auth`, `KB_Insert_Auth`, `KB_View_All` — без изменений.

**Стало (после фазы 2):** 5 политик, hardcoded-Olga заменены на role-based:
- `kb_update_admin` UPDATE — `is_admin()` USING/CHECK
- `kb_delete_admin` DELETE — `is_admin()` USING

**Эффект на пользователей.**
- **Олга (admin):** проходит и через `is_admin()` (старая `KB_*_Admin` тоже бы прошла) — без регрессии.
- **Анастасия Зобнина и Ирина Одинцова (admin):** раньше **не могли** обновлять/удалять записи в `knowledge_base` (политики были привязаны к email Ольги). Теперь могут через `is_admin()`. Это устранение баг-фичи: трое админов получили равные права, как и предполагалось ролью.
- **Не-админ-залогиненные:** UPDATE/DELETE по-прежнему запрещены. Но `KB_Edit_Auth` (ALL для `authenticated`) их пропускает (это исторически широкая политика, не наша задача в этой фазе). Обращу внимание: после смешения через OR `KB_Edit_Auth` фактически перекрывает `kb_update_admin`/`kb_delete_admin` — то есть любая залогиненная UPDATE/DELETE проходит через `KB_Edit_Auth`. Если нужно сузить — отдельная задача.

---

## Замечание (вне scope этой фазы)

Существующая политика **`KB_Edit_Auth` ALL для `auth.role() = 'authenticated'`** — слишком широкая: она пропускает любого залогиненного на любую CRUD-операцию (UPDATE/DELETE/INSERT/SELECT через одну ALL-политику). Через OR со складыванием PERMISSIVE-политик `kb_update_admin` и `kb_delete_admin` фактически становятся «декоративными» — любой залогиненный их обходит через `KB_Edit_Auth`.

Это **не задача фазы 2**, и владелец её не утверждал к изменению. Зафиксирую как отдельную потенциальную задачу:

> **Возможная будущая задача SEC-005:** Сузить `KB_Edit_Auth` (сейчас ALL для всех залогиненных) до конкретных операций или ролей. Иначе только-админ ограничения на UPDATE/DELETE неэффективны.

Это **не блокирует** SEC-001 — основная цель фазы 2 (убрать hardcoded email Olga) достигнута.

---

## Статус

**✅ ФАЗА 2 ЗАКРЫТА.** 2 hardcoded политики удалены, 2 role-based созданы. Верификация пройдена.

## Следующий шаг

**Жду подтверждения «идём в фазу 3»** — создание хелпера `public.is_mentor_for(uuid)` (`SECURITY DEFINER STABLE`) + `GRANT EXECUTE TO authenticated`.
