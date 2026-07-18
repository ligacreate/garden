-- migrations/2026-07-18_phase46_profiles_writeguard_split.sql
--
-- BUG-AUTH-PAUSED-EXPIRED-LOGIN — root fix (замкнутые не входят).
--
-- Симптом:
--   paused_expired юзер (напр. muza_skorpi@mail.ru / d427f212, Громова)
--   при login видит «Не удалось создать пользователя в новой базе».
--   _fetchProfile(authUser.id) → null → _ensurePostgrestUser → POST →
--   42501 (write guard) → throw.
--
-- Корневая причина (owner layer = RLS policy на profiles):
--   phase35 добавил self-row exception в SELECT-guard
--   profiles_active_access_guard_select:
--       ((id = auth.uid()) OR has_platform_access(auth.uid()))
--   НО рядом живёт profiles_active_access_guard_write (phase31),
--   созданный как RESTRICTIVE **FOR ALL** → его USING
--   has_platform_access(auth.uid()) применяется и к SELECT.
--   RESTRICTIVE склеиваются по AND, поэтому эффективно на чтение:
--       ((id=uid) OR hpa)  AND  (hpa)   ==   hpa
--   → у замкнутых (hpa=false) своя строка НЕ читается, self-row
--   из phase35 аннулируется. Active/admin (hpa=true) не задеты —
--   поэтому баг был замаскирован до массового появления
--   paused_expired (жёсткий замок Лиги, 2026-07-12).
--
--   Доказано read-only на проде (ROLLBACK-тест 2026-07-18):
--     - guard_write присутствует → own_row = 0
--     - guard_write удалён      → own_row = 1 (и всего 1 = только своя)
--
-- Фикс:
--   Расщепить FOR ALL write-guard на command-specific политики
--   (INSERT / UPDATE / DELETE). SELECT перестаёт гейтиться write-guard'ом
--   и остаётся под profiles_active_access_guard_select (self-row OR hpa).
--   Защита записи сохраняется полностью: замкнутый НЕ может
--   INSERT/UPDATE/DELETE (hpa=false в USING/WITH CHECK).
--
-- Security (не регрессирует, «269 держится»):
--   - SELECT: permissive (auth.uid() IS NOT NULL) AND guard_select
--     ((id=uid) OR hpa) → замкнутый видит ТОЛЬКО свою строку, чужие 0,
--     другие таблицы 0 (их select-guard'ы без self-row).
--   - INSERT/UPDATE/DELETE: hpa-only → замкнутый писать не может.
--
-- Scope: правим ТОЛЬКО profiles. Остальные 39 таблиц с FOR ALL
--   write-guard'ом self-row exception на select не имеют (замкнутым
--   их читать и не нужно) → их не трогаем.

\set ON_ERROR_STOP on

BEGIN;

-- Pre: guard_write существует и он именно FOR ALL с ожидаемым qual
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname='public' AND tablename='profiles'
           AND policyname='profiles_active_access_guard_write'
           AND cmd='ALL'
           AND qual='has_platform_access(auth.uid())'
    ) THEN
        RAISE EXCEPTION 'phase46 pre: profiles_active_access_guard_write (FOR ALL) не найдена или уже изменена — остановка';
    END IF;
END $$;

-- Снять FOR ALL write-guard (он же гейтил SELECT)
DROP POLICY IF EXISTS profiles_active_access_guard_write ON public.profiles;

-- Пересоздать как write-only (SELECT больше не задет)
CREATE POLICY profiles_active_access_guard_insert ON public.profiles
    AS RESTRICTIVE FOR INSERT TO authenticated
    WITH CHECK (has_platform_access(auth.uid()));

CREATE POLICY profiles_active_access_guard_update ON public.profiles
    AS RESTRICTIVE FOR UPDATE TO authenticated
    USING (has_platform_access(auth.uid()))
    WITH CHECK (has_platform_access(auth.uid()));

CREATE POLICY profiles_active_access_guard_delete ON public.profiles
    AS RESTRICTIVE FOR DELETE TO authenticated
    USING (has_platform_access(auth.uid()));

-- Post: FOR ALL guard ушёл, три write-only появились, select-guard цел
DO $$
DECLARE v_writeall int; v_split int; v_select int;
BEGIN
    SELECT count(*) INTO v_writeall FROM pg_policies
     WHERE tablename='profiles' AND policyname='profiles_active_access_guard_write';
    SELECT count(*) INTO v_split FROM pg_policies
     WHERE tablename='profiles' AND policyname IN (
       'profiles_active_access_guard_insert',
       'profiles_active_access_guard_update',
       'profiles_active_access_guard_delete');
    SELECT count(*) INTO v_select FROM pg_policies
     WHERE tablename='profiles' AND policyname='profiles_active_access_guard_select'
       AND qual LIKE '%id = auth.uid()%';
    IF v_writeall <> 0 OR v_split <> 3 OR v_select <> 1 THEN
        RAISE EXCEPTION 'phase46 post: неожиданное состояние политик (writeall=%, split=%, select=%)',
            v_writeall, v_split, v_select;
    END IF;
    RAISE NOTICE 'phase46 post: OK — write-guard расщеплён, SELECT под self-row guard';
END $$;

-- DDL safety-net (RUNBOOK 1.3 — Timeweb GRANT-wipe после DDL)
SELECT public.ensure_garden_grants();

COMMIT;

-- ROLLBACK:
-- BEGIN;
--   DROP POLICY IF EXISTS profiles_active_access_guard_insert ON public.profiles;
--   DROP POLICY IF EXISTS profiles_active_access_guard_update ON public.profiles;
--   DROP POLICY IF EXISTS profiles_active_access_guard_delete ON public.profiles;
--   CREATE POLICY profiles_active_access_guard_write ON public.profiles
--       AS RESTRICTIVE FOR ALL TO authenticated
--       USING (has_platform_access(auth.uid()))
--       WITH CHECK (has_platform_access(auth.uid()));
--   SELECT public.ensure_garden_grants();
-- COMMIT;
