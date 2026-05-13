-- migrations/2026-05-13_phase27_public_fk_to_profiles.sql
--
-- Phase 27: переезд 5 FK из public с auth.users(id) на public.profiles(id).
--
-- BUG-GOALS-FK-SUPABASE-LEGACY. Корневая причина — наследие Supabase:
-- goals/practices/notifications/news/scenarios через FK смотрят на
-- auth.users, который наша auth-инфра больше не пополняет. Все
-- пользователи, зарегистрированные после переезда на свой auth,
-- живут только в public.users_auth + public.profiles, и любая запись
-- в эти 5 таблиц падает с 23503 (goals_user_id_fkey и т.д.).
--
-- Контракт ON DELETE — дифференцированный, по продуктовому смыслу
-- (см. phase24: course_progress = CASCADE, meetings = NO ACTION + ручная
-- развязка в RPC):
--   goals.user_id          → CASCADE   (личное)
--   practices.user_id      → CASCADE   (личное)
--   notifications.user_id  → CASCADE   (личное)
--   news.author_id         → SET NULL  (публикация переживает автора)
--   scenarios.user_id      → SET NULL  (публичные выживают; приватные
--                                       удаляются явно в admin_delete_user_full)
--
-- Pre-flight:
--   - Сирот по 5 таблицам не должно быть. Проверка внутри транзакции;
--     при обнаружении — RAISE EXCEPTION → полный rollback.
--   - ALTER COLUMN ... DROP NOT NULL для news.author_id и scenarios.user_id —
--     обязательное условие SET NULL. Команда идемпотентна.
--
-- RUNBOOK 1.3: SELECT public.ensure_garden_grants() ДО COMMIT.
--
-- Apply:
--   ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
--     PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
--     -v ON_ERROR_STOP=1 -f /tmp/2026-05-13_phase27_public_fk_to_profiles.sql'
--
-- Откат (после COMMIT, если потребуется): отдельная миграция, возвращает
-- ON DELETE NO ACTION. FK на auth.users НЕ восстанавливать — это и был баг.

\set ON_ERROR_STOP on

BEGIN;

-- ── Pre-flight: убедимся, что переезд не оставит сирот ─────────────
DO $$
DECLARE
    v_orphan_goals         int;
    v_orphan_practices     int;
    v_orphan_notifications int;
    v_orphan_news          int;
    v_orphan_scenarios     int;
BEGIN
    SELECT count(*) INTO v_orphan_goals
      FROM public.goals g
      LEFT JOIN public.profiles p ON p.id = g.user_id
      WHERE p.id IS NULL;

    SELECT count(*) INTO v_orphan_practices
      FROM public.practices pr
      LEFT JOIN public.profiles p ON p.id = pr.user_id
      WHERE p.id IS NULL;

    SELECT count(*) INTO v_orphan_notifications
      FROM public.notifications n
      LEFT JOIN public.profiles p ON p.id = n.user_id
      WHERE p.id IS NULL;

    SELECT count(*) INTO v_orphan_news
      FROM public.news n
      LEFT JOIN public.profiles p ON p.id = n.author_id
      WHERE n.author_id IS NOT NULL AND p.id IS NULL;

    SELECT count(*) INTO v_orphan_scenarios
      FROM public.scenarios s
      LEFT JOIN public.profiles p ON p.id = s.user_id
      WHERE s.user_id IS NOT NULL AND p.id IS NULL;

    IF v_orphan_goals + v_orphan_practices + v_orphan_notifications
       + v_orphan_news + v_orphan_scenarios > 0 THEN
        RAISE EXCEPTION
          'phase27 pre-flight: orphans detected (goals=%, practices=%, notifications=%, news=%, scenarios=%). Resolve before re-running.',
          v_orphan_goals, v_orphan_practices, v_orphan_notifications,
          v_orphan_news, v_orphan_scenarios
        USING ERRCODE = '23503';
    END IF;
END $$;

-- ── 1. goals.user_id → profiles(id), ON DELETE CASCADE ────────────
ALTER TABLE public.goals
    DROP CONSTRAINT IF EXISTS goals_user_id_fkey;
ALTER TABLE public.goals
    ADD CONSTRAINT goals_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- ── 2. practices.user_id → profiles(id), ON DELETE CASCADE ────────
ALTER TABLE public.practices
    DROP CONSTRAINT IF EXISTS practices_user_id_fkey;
ALTER TABLE public.practices
    ADD CONSTRAINT practices_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- ── 3. notifications.user_id → profiles(id), ON DELETE CASCADE ────
ALTER TABLE public.notifications
    DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;
ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- ── 4. news.author_id → profiles(id), ON DELETE SET NULL ──────────
ALTER TABLE public.news
    ALTER COLUMN author_id DROP NOT NULL;
ALTER TABLE public.news
    DROP CONSTRAINT IF EXISTS news_author_id_fkey;
ALTER TABLE public.news
    ADD CONSTRAINT news_author_id_fkey
    FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ── 5. scenarios.user_id → profiles(id), ON DELETE SET NULL ───────
ALTER TABLE public.scenarios
    ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.scenarios
    DROP CONSTRAINT IF EXISTS scenarios_user_id_fkey;
ALTER TABLE public.scenarios
    ADD CONSTRAINT scenarios_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ── 6. admin_delete_user_full: чистка приватных сценариев ─────────
-- Публичные сценарии и новости уходят в SET NULL через FK. Приватные
-- сценарии личного значения для других пользователей не имеют —
-- удаляем явно перед DELETE FROM profiles. Аналог meetings в phase24.
CREATE OR REPLACE FUNCTION public.admin_delete_user_full(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor uuid := auth.uid();
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'p_user_id is null' USING ERRCODE = '22023';
    END IF;
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'forbidden: admin role required' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.pvl_audit_log (
        id, actor_user_id, action, entity_type, entity_id, payload, created_at
    ) VALUES (
        gen_random_uuid()::text,
        v_actor::text,
        'admin_delete_user_full',
        'profile',
        p_user_id::text,
        jsonb_build_object(
            'summary', 'Admin hard-deleted user profile',
            'deleted_user_id', p_user_id
        ),
        now()
    );

    -- 1. meetings: FK без CASCADE → иначе FK violation на шаге 7
    DELETE FROM public.meetings WHERE user_id = p_user_id;

    -- 2. pvl_direct_messages: нет FK
    DELETE FROM public.pvl_direct_messages
    WHERE author_user_id = p_user_id
       OR mentor_id      = p_user_id
       OR student_id     = p_user_id;

    -- 3. pvl_garden_mentor_links: нет FK
    DELETE FROM public.pvl_garden_mentor_links
    WHERE student_id = p_user_id OR mentor_id = p_user_id;

    -- 4. pvl_students: каскадирует на 7 дочерних PVL-таблиц
    DELETE FROM public.pvl_students WHERE id = p_user_id;

    -- 5. users_auth: нет FK
    DELETE FROM public.users_auth WHERE id = p_user_id;

    -- 6. phase27: приватные сценарии удаляем явно. Публичные уйдут
    --    в SET NULL через scenarios_user_id_fkey.
    DELETE FROM public.scenarios
    WHERE user_id = p_user_id AND is_public IS NOT TRUE;

    -- 7. profiles: каскадирует на course_progress + (phase27) goals,
    --    practices, notifications. news.author_id и публичные
    --    scenarios.user_id уйдут в SET NULL через FK.
    DELETE FROM public.profiles WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_user_full(uuid) TO authenticated;

-- ── RUNBOOK 1.3 — safety-net ДО COMMIT ────────────────────────────
SELECT public.ensure_garden_grants();

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- VERIFY (вне транзакции)
-- ─────────────────────────────────────────────────────────────────────

\echo === V1: все 5 FK теперь смотрят на public.profiles(id) с нужным on_delete ===
SELECT
  tc.table_name      AS src_table,
  kcu.column_name    AS fk_column,
  tc.constraint_name AS constraint_name,
  ccu.table_schema || '.' || ccu.table_name AS references,
  rc.delete_rule     AS on_delete
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.table_schema    = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
 AND ccu.table_schema    = tc.table_schema
JOIN information_schema.referential_constraints rc
  ON rc.constraint_name   = tc.constraint_name
 AND rc.constraint_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema    = 'public'
  AND tc.table_name IN ('goals','practices','notifications','news','scenarios')
  AND kcu.column_name IN ('user_id','author_id')
ORDER BY tc.table_name;
-- ожидание: 5 строк; references = 'public.profiles';
-- on_delete = CASCADE для goals/practices/notifications,
-- SET NULL для news/scenarios.

\echo === V2: ни одного FK в public больше не смотрит на auth.users ===
SELECT
  c.conname,
  c.conrelid::regclass AS src_table
FROM pg_constraint c
JOIN pg_class      r ON r.oid = c.confrelid
JOIN pg_namespace  n ON n.oid = r.relnamespace
WHERE c.contype = 'f'
  AND n.nspname = 'auth'
  AND r.relname = 'users'
  AND c.connamespace = 'public'::regnamespace;
-- ожидание: 0 строк.

\echo === V3: GRANTs не слетели (RUNBOOK 1.3, ожидание 158 / 4) ===
SELECT
  (SELECT count(*) FROM information_schema.role_table_grants
     WHERE grantee='authenticated' AND table_schema='public') AS auth_grants,
  (SELECT count(*) FROM information_schema.role_table_grants
     WHERE grantee='web_anon' AND table_schema='public') AS anon_grants;

\echo === V4: смок — после переключения сирот нет ===
SELECT
  (SELECT count(*) FROM public.goals g
     LEFT JOIN public.profiles p ON p.id = g.user_id
     WHERE p.id IS NULL) AS orphan_goals,
  (SELECT count(*) FROM public.practices pr
     LEFT JOIN public.profiles p ON p.id = pr.user_id
     WHERE p.id IS NULL) AS orphan_practices,
  (SELECT count(*) FROM public.notifications n
     LEFT JOIN public.profiles p ON p.id = n.user_id
     WHERE p.id IS NULL) AS orphan_notifications,
  (SELECT count(*) FROM public.news n
     LEFT JOIN public.profiles p ON p.id = n.author_id
     WHERE n.author_id IS NOT NULL AND p.id IS NULL) AS orphan_news,
  (SELECT count(*) FROM public.scenarios s
     LEFT JOIN public.profiles p ON p.id = s.user_id
     WHERE s.user_id IS NOT NULL AND p.id IS NULL) AS orphan_scenarios;
-- ожидание: все нули.

\echo === V5: admin_delete_user_full актуальна, SECURITY DEFINER, EXECUTE для authenticated ===
SELECT proname, prosecdef AS is_definer,
       pg_get_function_arguments(oid) AS args,
       pg_get_function_result(oid)    AS returns
FROM pg_proc
WHERE proname='admin_delete_user_full' AND pronamespace='public'::regnamespace;
SELECT grantee, privilege_type
FROM information_schema.role_routine_grants
WHERE specific_schema='public' AND routine_name='admin_delete_user_full'
  AND grantee='authenticated';
