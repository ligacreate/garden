-- Кубик ведущей — Ф2: личные ячейки кубика.
--
-- МОДЕЛЬ
--   Кубик = шесть граней по девять ячеек, всего 54 ячейки на участницу.
--   Грань 1–6 — неделя курса (Почерк, Круг, Упаковка, Приглашения, Проба пера, Ритм).
--   Позиция 0–8 — место в сетке три на три:
--       0 1 2  — «знаю»   (верхний ряд)
--       3 4 5  — «говорю» слева и справа, 4 — неподвижный центр грани
--       6 7 8  — «делаю»  (нижний ряд)
--   Смысл позиций живёт в коде (views/CubeView.jsx), в базе — только числа:
--   подписи граней и рядов фиксированные и меняются вместе с кодом, а не данными.
--
-- ПУСТЫЕ ЯЧЕЙКИ — НОРМА. Правило курса: квадрат нельзя придумать, его можно
--   только добыть. Поэтому здесь нет ни счётчиков, ни признака «готово»,
--   ни процента заполнения — ни в схеме, ни в интерфейсе.
--
-- Идемпотентно: IF NOT EXISTS / DROP POLICY IF EXISTS. Безопасно гонять повторно.
-- Зависимость: 2026-07-27_cube_participants_and_gate.sql (хелпер is_course_staff).
--
-- Откат: см. блок «ОТКАТ» в конце файла.

\set ON_ERROR_STOP on

BEGIN;

-- ── 1. Таблица ──────────────────────────────────────────────────────────────
-- Колонка названа pos, а не position: position в Postgres — ключевое слово
-- функции position(x in y), в запросах читается двусмысленно.
CREATE TABLE IF NOT EXISTS public.cube_cells (
    user_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    face       smallint    NOT NULL,
    pos        smallint    NOT NULL,
    title      text        NOT NULL DEFAULT '',
    body       text        NOT NULL DEFAULT '',
    filled_at  timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, face, pos),
    CONSTRAINT cube_cells_face_check CHECK (face BETWEEN 1 AND 6),
    CONSTRAINT cube_cells_pos_check  CHECK (pos  BETWEEN 0 AND 8)
);

COMMENT ON TABLE public.cube_cells IS
  'Личные ячейки кубика участницы курса «Кубик ведущей». 6 граней × 9 позиций = 54 ячейки на человека. '
  'Первичный ключ (user_id, face, pos) — он же цель upsert из приложения.';

COMMENT ON COLUMN public.cube_cells.title IS
  'Заголовок квадрата, два-четыре слова.';
COMMENT ON COLUMN public.cube_cells.body IS
  'Разворот «добыто: когда, где».';
COMMENT ON COLUMN public.cube_cells.filled_at IS
  'Когда квадрат ДОБЫЛИ впервые — историческая метка, не признак состояния. '
  'Признак «ячейка заполнена» выводится из непустых title/body и нигде не хранится копией: '
  'вторая запись про одно и то же рано или поздно разъезжается с первой.';

-- ── 2. Триггер: updated_at и первая отметка о добыче ────────────────────────
CREATE OR REPLACE FUNCTION public.trg_cube_cells_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at := now();

    -- Ставим один раз, при первом непустом содержимом. Обратно не снимаем:
    -- «когда добыла» — факт из прошлого, он не отменяется тем, что текст стёрли.
    IF NEW.filled_at IS NULL
       AND (btrim(COALESCE(NEW.title, '')) <> '' OR btrim(COALESCE(NEW.body, '')) <> '')
    THEN
        NEW.filled_at := now();
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cube_cells_touch ON public.cube_cells;
CREATE TRIGGER trg_cube_cells_touch
    BEFORE INSERT OR UPDATE ON public.cube_cells
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_cube_cells_touch();

-- ── 3. Права и RLS ──────────────────────────────────────────────────────────
ALTER TABLE public.cube_cells ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cube_cells TO authenticated;

-- Участница читает и пишет только своё. Куратор, ментор и администратор
-- читают всё — они ведут курс. Наружу и другим участницам не уходит ничего:
-- web_anon грантов на таблицу нет, чужой SELECT не проходит ни по одной политике.
--
-- Permissive на все четыре команды — обязательно. Пропущенная команда в
-- Postgres запрещена всем, и приложение получит «сохранено» на запись, которая
-- затронула ноль строк. Так уже было на news и почти случилось на course_progress.

DROP POLICY IF EXISTS cube_cells_select_own ON public.cube_cells;
CREATE POLICY cube_cells_select_own
  ON public.cube_cells FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS cube_cells_select_staff ON public.cube_cells;
CREATE POLICY cube_cells_select_staff
  ON public.cube_cells FOR SELECT TO authenticated
  USING (public.is_course_staff());

DROP POLICY IF EXISTS cube_cells_insert_own ON public.cube_cells;
CREATE POLICY cube_cells_insert_own
  ON public.cube_cells FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS cube_cells_update_own ON public.cube_cells;
CREATE POLICY cube_cells_update_own
  ON public.cube_cells FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS cube_cells_delete_own ON public.cube_cells;
CREATE POLICY cube_cells_delete_own
  ON public.cube_cells FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Запись остаётся строго своей: куратору дан только SELECT, отдельной
-- permissive-политики на запись у персонала нет и заводить её не нужно —
-- чужой кубик не редактируют.

-- RESTRICTIVE-гвард платформенного доступа, как на остальных гейтнутых
-- таблицах (phase31), в command-specific форме (phase46).
DROP POLICY IF EXISTS cube_cells_active_access_guard_select ON public.cube_cells;
CREATE POLICY cube_cells_active_access_guard_select
  ON public.cube_cells AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.has_platform_access(auth.uid()));

DROP POLICY IF EXISTS cube_cells_active_access_guard_insert ON public.cube_cells;
CREATE POLICY cube_cells_active_access_guard_insert
  ON public.cube_cells AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.has_platform_access(auth.uid()));

DROP POLICY IF EXISTS cube_cells_active_access_guard_update ON public.cube_cells;
CREATE POLICY cube_cells_active_access_guard_update
  ON public.cube_cells AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.has_platform_access(auth.uid()))
  WITH CHECK (public.has_platform_access(auth.uid()));

DROP POLICY IF EXISTS cube_cells_active_access_guard_delete ON public.cube_cells;
CREATE POLICY cube_cells_active_access_guard_delete
  ON public.cube_cells AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.has_platform_access(auth.uid()));

-- RUNBOOK §1.3 — обязательный вызов после DDL, ДО COMMIT.
SELECT public.ensure_garden_grants();

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFY (вне транзакции)
-- ─────────────────────────────────────────────────────────────────────────────

\echo === V1: колонки cube_cells ===
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'cube_cells'
ORDER BY ordinal_position;

\echo === V2: политики (ожидание: 5 permissive — 2 SELECT, INSERT, UPDATE, DELETE; 4 restrictive) ===
SELECT policyname, cmd, permissive, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'cube_cells'
ORDER BY permissive DESC, cmd;

\echo === V3: КРИТИЧНО — permissive есть на все четыре команды (ожидание: 4 строки, ни одного 0) ===
SELECT cmd, count(*) AS permissive_policies
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'cube_cells' AND permissive = 'PERMISSIVE'
GROUP BY cmd
ORDER BY cmd;

\echo === V4: триггер на месте ===
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgrelid = 'public.cube_cells'::regclass AND NOT tgisinternal;

\echo === V5: smoke на триггер, внутри ROLLBACK — данные не остаются ===
-- ON CONFLICT, а не голый INSERT: при повторном прогоне миграции ячейка (1,4)
-- у этого профиля уже может существовать, и ON_ERROR_STOP уронил бы скрипт.
BEGIN;
  INSERT INTO public.cube_cells (user_id, face, pos, title, body)
  SELECT id, 1, 4, 'проверка триггера', '' FROM public.profiles LIMIT 1
  ON CONFLICT (user_id, face, pos) DO UPDATE SET title = excluded.title;

  SELECT face, pos, title,
         filled_at  IS NOT NULL AS filled_at_set,
         updated_at IS NOT NULL AS updated_at_set
  FROM public.cube_cells WHERE title = 'проверка триггера';
ROLLBACK;

-- ─────────────────────────────────────────────────────────────────────────────
-- ОТКАТ
-- ─────────────────────────────────────────────────────────────────────────────
--   DROP TABLE IF EXISTS public.cube_cells;
--   DROP FUNCTION IF EXISTS public.trg_cube_cells_touch();
--   NOTIFY pgrst, 'reload schema';
-- Внимание: DROP TABLE уносит записи участниц. До старта курса это пусто и
-- безопасно, после старта — сначала выгрузить.
