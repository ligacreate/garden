-- Кубик ведущей — Ф1: участницы курса + закрытый вход в материалы.
--
-- ПОЧЕМУ ОТДЕЛЬНАЯ ТАБЛИЦА, А НЕ ФЛАГ В profiles
--   На profiles живёт permissive-политика profiles_update_own (UPDATE своей
--   строки) плюс table-level GRANT UPDATE для authenticated. Колоночных
--   ограничений нет — RLS их и не умеет. Значит флаг «участница Кубика» в
--   profiles участница поставила бы себе сама одним PATCH через PostgREST.
--   Отдельная таблица с admin-only записью закрывает это структурно.
--
-- ПОРЯДОК ВНУТРИ ФАЙЛА ВАЖЕН: таблица → функции (тело ссылается на таблицу)
--   → политики (ссылаются на функции).
--
-- Идемпотентно: IF NOT EXISTS / DROP POLICY IF EXISTS. Безопасно гонять повторно.
--
-- Откат: см. блок «ОТКАТ» в конце файла.

\set ON_ERROR_STOP on

BEGIN;

-- ── 1. Таблица участниц ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cube_participants (
    user_id  uuid        PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    added_at timestamptz NOT NULL DEFAULT now(),
    added_by uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
    note     text
);

COMMENT ON TABLE public.cube_participants IS
  'Участницы курса «Кубик ведущей». Отмечает администратор вручную из админки — оплата первого потока ручная. '
  'Запись admin-only: флаг в profiles был бы самоназначаемым (profiles_update_own + table-level GRANT UPDATE).';

ALTER TABLE public.cube_participants ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cube_participants TO authenticated;

-- ── 2. RLS-хелперы ──────────────────────────────────────────────────────────
-- Стиль зеркалит has_platform_access (phase31): sql, STABLE, SECURITY DEFINER,
-- фиксированный search_path.

-- Куратор / ментор / администратор — те, кто ведёт курс и читает работы.
-- Отличается от is_mentor_for(uuid): та отвечает «ментор ли я вот этой ученице»,
-- здесь нужна роль вообще.
CREATE OR REPLACE FUNCTION public.is_course_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE p.id = auth.uid()
       AND p.role IN ('mentor', 'curator', 'admin')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_course_staff() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_cube_participant()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cube_participants c WHERE c.user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_cube_participant() TO authenticated;

-- ── 3. Политики cube_participants ───────────────────────────────────────────
-- Permissive заводим на ВСЕ четыре команды осознанно. В Postgres команда без
-- permissive-политики запрещена всем (restrictive только сужает), и запись
-- «молча затрагивает 0 строк», показывая на фронте ложный успех — ровно то,
-- что ловили на news и превентивно закрывали на course_progress
-- (2026-07-23_course_progress_own_write_policies.sql).

DROP POLICY IF EXISTS cube_participants_select_own ON public.cube_participants;
CREATE POLICY cube_participants_select_own
  ON public.cube_participants FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS cube_participants_select_staff ON public.cube_participants;
CREATE POLICY cube_participants_select_staff
  ON public.cube_participants FOR SELECT TO authenticated
  USING (public.is_course_staff());

DROP POLICY IF EXISTS cube_participants_insert_admin ON public.cube_participants;
CREATE POLICY cube_participants_insert_admin
  ON public.cube_participants FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS cube_participants_update_admin ON public.cube_participants;
CREATE POLICY cube_participants_update_admin
  ON public.cube_participants FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS cube_participants_delete_admin ON public.cube_participants;
CREATE POLICY cube_participants_delete_admin
  ON public.cube_participants FOR DELETE TO authenticated
  USING (public.is_admin());

-- RESTRICTIVE-гвард платформенного доступа — как на остальных гейтнутых
-- таблицах (phase31). Форма command-specific, а не FOR ALL: FOR ALL гейтит и
-- SELECT тоже, на этом уже спотыкались в phase46 (profiles).
DROP POLICY IF EXISTS cube_participants_active_access_guard_select ON public.cube_participants;
CREATE POLICY cube_participants_active_access_guard_select
  ON public.cube_participants AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.has_platform_access(auth.uid()));

DROP POLICY IF EXISTS cube_participants_active_access_guard_insert ON public.cube_participants;
CREATE POLICY cube_participants_active_access_guard_insert
  ON public.cube_participants AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.has_platform_access(auth.uid()));

DROP POLICY IF EXISTS cube_participants_active_access_guard_update ON public.cube_participants;
CREATE POLICY cube_participants_active_access_guard_update
  ON public.cube_participants AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.has_platform_access(auth.uid()))
  WITH CHECK (public.has_platform_access(auth.uid()));

DROP POLICY IF EXISTS cube_participants_active_access_guard_delete ON public.cube_participants;
CREATE POLICY cube_participants_active_access_guard_delete
  ON public.cube_participants AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.has_platform_access(auth.uid()));

-- ── 4. Гейт на материалы курса в knowledge_base ─────────────────────────────
-- Единственное место, где трогаем общую таблицу. Политика RESTRICTIVE и только
-- FOR SELECT: она может лишь сузить выдачу, а первое условие пропускает все
-- строки, у которых category не равна названию курса — то есть весь остальной
-- контент библиотеки не задет вообще.
--
-- IS DISTINCT FROM, а не <>: у материала без категории category = NULL, и
-- обычное сравнение дало бы NULL → строка исчезла бы из выдачи.
--
-- Название курса зашито строкой. Оно же в COURSES (CourseLibraryView.jsx) и в
-- COURSE_TITLES (AdminPanel.jsx) — привязка материала к курсу в этой платформе
-- идёт по совпадению текста. Переименуют курс — надо переписать и политику.

DROP POLICY IF EXISTS knowledge_base_cube_course_gate ON public.knowledge_base;
CREATE POLICY knowledge_base_cube_course_gate
  ON public.knowledge_base AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    category IS DISTINCT FROM 'Кубик ведущей'
    OR public.is_cube_participant()
    OR public.is_course_staff()
  );

-- RUNBOOK §1.3 — после любой schema-changing миграции, ДО COMMIT. Timeweb
-- сносил кастомные GRANT'ы вскоре после DDL (два P0 за май 2026). Функция
-- идемпотентна и только выдаёт права, ничего не отзывает.
-- Про сами cube_*-таблицы функция пока не знает — их в неё добавляет
-- 2026-07-27_cube_grants_safety_net.sql, третьим шагом.
SELECT public.ensure_garden_grants();

COMMIT;

-- PostgREST кэширует схему: без перезагрузки новые таблицы ему не видны.
NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFY (вне транзакции)
-- ─────────────────────────────────────────────────────────────────────────────

\echo === V1: таблица cube_participants и её колонки ===
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'cube_participants'
ORDER BY ordinal_position;

\echo === V2: политики cube_participants (ожидание: 5 permissive + 4 restrictive) ===
SELECT policyname, cmd, permissive, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'cube_participants'
ORDER BY permissive DESC, cmd;

\echo === V3: хелперы зарегистрированы и EXECUTE выдан (ожидание: обе t) ===
SELECT p.proname,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('is_course_staff', 'is_cube_participant');

\echo === V4: гейт на knowledge_base (ожидание: одна RESTRICTIVE SELECT-политика) ===
SELECT policyname, cmd, permissive, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'knowledge_base'
ORDER BY permissive DESC, cmd;

\echo === V5: остальная библиотека не задета — сколько материалов вне курса ===
SELECT count(*) FILTER (WHERE category IS DISTINCT FROM 'Кубик ведущей') AS other_materials,
       count(*) FILTER (WHERE category = 'Кубик ведущей')                AS cube_materials
FROM public.knowledge_base;

-- ─────────────────────────────────────────────────────────────────────────────
-- ОТКАТ (если гейт повёл себя не так, как ждали)
-- ─────────────────────────────────────────────────────────────────────────────
--   DROP POLICY IF EXISTS knowledge_base_cube_course_gate ON public.knowledge_base;
--   NOTIFY pgrst, 'reload schema';
-- Этого достаточно: библиотека сразу возвращается к прежнему поведению.
-- Полный откат Ф1 (только если курс отменяется):
--   DROP TABLE IF EXISTS public.cube_participants;      -- сначала cube_cells, если уже накачена
--   DROP FUNCTION IF EXISTS public.is_cube_participant();
--   DROP FUNCTION IF EXISTS public.is_course_staff();
