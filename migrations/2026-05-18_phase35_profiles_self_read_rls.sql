-- migrations/2026-05-18_phase35_profiles_self_read_rls.sql
--
-- BUG-AUTH-PAUSED-USER-LOGIN — hotfix.
--
-- Контекст:
--   После phase31 (FEAT-023, RESTRICTIVE RLS-guards с has_platform_access)
--   юзеры с access_status != 'active' (paused_manual, paused_billing,
--   pending_approval) не могут читать СВОЮ собственную строку в profiles
--   при login. _fetchProfile возвращает null → frontend пытается
--   _ensurePostgrestUser → POST падает (email conflict / RLS) →
--   юзер видит "Не удалось создать пользователя в новой базе".
--
-- Реальные жертвы на 2026-05-18:
--   - mb1@bk.ru (Мария Бардина, leader, paused_manual)
--   - +1 paused_manual
--   - +1 pending_approval
--
-- Фикс:
--   Расширяем RESTRICTIVE SELECT-policy на profiles так, чтобы paused
--   юзер мог читать СВОЮ строку (id = auth.uid()), но не других. Для
--   других — has_platform_access guard остаётся, security не страдает.
--
-- WRITE остаётся жёстким: paused юзер не должен модифицировать данные.

BEGIN;

-- Pre: убедимся что policy существует и старая
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename = 'profiles'
           AND policyname = 'profiles_active_access_guard_select'
           AND qual = 'has_platform_access(auth.uid())'
    ) THEN
        RAISE EXCEPTION 'phase35 pre: profiles_active_access_guard_select не найдена или уже patched';
    END IF;
END $$;

-- Re-create policy с self-row exception
DROP POLICY IF EXISTS profiles_active_access_guard_select ON public.profiles;

CREATE POLICY profiles_active_access_guard_select ON public.profiles
    AS RESTRICTIVE
    FOR SELECT
    TO authenticated
    USING (
        id = auth.uid()
        OR has_platform_access(auth.uid())
    );

-- Post: подтверждение
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename = 'profiles'
           AND policyname = 'profiles_active_access_guard_select'
           AND qual LIKE '%id = auth.uid()%'
    ) THEN
        RAISE EXCEPTION 'phase35 post: policy не получила self-row exception';
    END IF;
    RAISE NOTICE 'phase35 post: OK — paused юзеры теперь могут читать свою строку';
END $$;

-- DDL safety-net (RUNBOOK 1.3)
SELECT public.ensure_garden_grants();

COMMIT;

-- ROLLBACK:
-- BEGIN;
--   DROP POLICY IF EXISTS profiles_active_access_guard_select ON public.profiles;
--   CREATE POLICY profiles_active_access_guard_select ON public.profiles
--       AS RESTRICTIVE FOR SELECT TO authenticated
--       USING (has_platform_access(auth.uid()));
--   SELECT public.ensure_garden_grants();
-- COMMIT;
