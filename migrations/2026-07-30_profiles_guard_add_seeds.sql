-- migrations/2026-07-30_profiles_guard_add_seeds.sql
--
-- Второй шаг гварда привилегированных колонок profiles: добавляем seeds.
--
-- ПРИМЕНЯТЬ ТОЛЬКО ПОСЛЕ того, как начисление своих семян уедет с клиента
-- на сервер. Сегодня семена себе дописывает фронт: views/UserApp.jsx
-- вызывает onUpdateUser({ ...user, seeds }) в одиннадцати местах (встреча
-- создана/проведена, практика, сценарий, урок, клиент), плюс пересчёт
-- баланса при загрузке и списание при удалении встречи. Всё это идёт
-- клиентским PATCH /profiles под authenticated — гвард отобьёт его 403,
-- и семена перестанут начисляться.
--
-- Отдельная задача-предшественник: plans/2026-07-27-семена-на-сервер.md
--
-- Проверка готовности перед накатом (в UserApp не должно остаться записи
-- seeds через onUpdateUser):
--   grep -n "onUpdateUser({ ...user, seeds" views/UserApp.jsx
--   → пусто; вместо этого один хелпер поверх RPC awardSeeds()
--
-- Триггер и его WHEN уже перечисляют seeds (см. миграцию от 2026-07-27),
-- поэтому здесь меняется ровно один список.

\set ON_ERROR_STOP on

BEGIN;

-- Pre: базовый гвард уже стоит
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgrelid = 'public.profiles'::regclass
           AND tgname = 'trg_profiles_privileged_write_guard'
    ) THEN
        RAISE EXCEPTION 'add_seeds pre: базового гварда нет — сначала 2026-07-27_profiles_privileged_write_guard.sql';
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.profiles_privileged_columns()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $function$
    SELECT ARRAY[
        'role',
        'access_status',
        'subscription_status',
        'paid_until',
        'auto_pause_exempt',
        'email',
        'seeds'
    ]::text[];
$function$;

-- Post
DO $$
DECLARE v_cols text[];
BEGIN
    v_cols := public.profiles_privileged_columns();
    IF NOT ('seeds' = ANY(v_cols)) THEN
        RAISE EXCEPTION 'add_seeds post: seeds не попал в набор: %', v_cols;
    END IF;
    RAISE NOTICE 'add_seeds post: OK — колонки: %', array_to_string(v_cols, ', ');
END $$;

SELECT public.ensure_garden_grants();

COMMIT;

-- ROLLBACK: вернуть список без seeds (CREATE OR REPLACE FUNCTION
-- public.profiles_privileged_columns() из миграции 2026-07-27).
