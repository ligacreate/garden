-- migrations/2026-05-14_phase28b_treasury_ugc.sql
--
-- FEAT-019 MVP — батч от 2026-05-14: переход с админ-only публикации
-- на UGC. Любая ведущая может опубликовать СВОЮ практику.
-- Семена +40 за первую публикацию (вариант B, через триггер).
--
-- Что меняет миграция:
--   1. Колонка seeds_awarded boolean NOT NULL DEFAULT false +
--      бэкфилл true для уже-опубликованных (на момент apply 0 шт.,
--      но защита от повторного награждения по факту публикации).
--   2. Ослабляет триггер protect_practice_publish_flag:
--      владелец может toggle is_published на СВОЕЙ практике;
--      админ — на любой; чужой — нет (RAISE 42501).
--   3. Новый триггер award_seeds_on_first_publish:
--      AFTER INSERT OR UPDATE OF is_published.
--      Условие: NEW.is_published = true И seeds_awarded был false.
--      Действия: UPDATE seeds_awarded := true; PERFORM
--      increment_user_seeds(ARRAY[user_id], 40).
--      Гарантия «один раз»: после первого начисления seeds_awarded
--      становится true и больше не сбрасывается (даже если автор
--      снимет с публикации и переопубликует).
--
-- Чего НЕ делает (отдельные задачи):
--   - DROP COLUMN time (text) — после уверенности, что нигде не читается.
--   - Модерационная очередь, маркетплейс, FTS, forks_count.
--
-- Зависит от: phase28 (is_published, published_at, RLS Update_Admin/
-- View_Admin/View_Published, триггер protect_practice_publish_flag,
-- forked_from FK).
--
-- RUNBOOK 1.3: SELECT public.ensure_garden_grants(); ДО COMMIT.
--
-- Apply:
--   ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
--     PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
--     -v ON_ERROR_STOP=1 -f /tmp/2026-05-14_phase28b_treasury_ugc.sql'
--
-- Откат (отдельной миграцией):
--   - DROP TRIGGER trg_award_seeds_on_publish
--   - DROP FUNCTION public.award_seeds_on_first_publish()
--   - CREATE OR REPLACE FUNCTION protect_practice_publish_flag (старая
--     admin-only версия из phase28)
--   - ALTER TABLE practices DROP COLUMN seeds_awarded
--   - SELECT public.ensure_garden_grants();

\set ON_ERROR_STOP on

BEGIN;

-- ── 1. Колонка seeds_awarded ──────────────────────────────────────
ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS seeds_awarded boolean NOT NULL DEFAULT false;

-- Бэкфилл: уже-опубликованные на момент apply считаются «семена выданы»,
-- чтобы триггер не ретроспективно начислил при следующем UPDATE.
-- Сегодня на проде их 0 (V7 phase28), но логика идемпотентная.
UPDATE public.practices
   SET seeds_awarded = true
 WHERE is_published = true AND seeds_awarded = false;

-- ── 2. Ослабляем триггер защиты publish-флага ─────────────────────
-- Владелец может ставить is_published / published_at на СВОЕЙ.
-- Админ — на любой. Чужой — нет.
CREATE OR REPLACE FUNCTION public.protect_practice_publish_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF (NEW.is_published IS DISTINCT FROM OLD.is_published
        OR NEW.published_at IS DISTINCT FROM OLD.published_at)
       AND auth.uid() IS DISTINCT FROM OLD.user_id
       AND NOT public.is_admin() THEN
        RAISE EXCEPTION
          'publication flag can be toggled only by owner or admin (practice id=%)',
          OLD.id
          USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

-- Триггер уже создан в phase28 (BEFORE UPDATE OF is_published, published_at).
-- CREATE OR REPLACE FUNCTION выше переопределяет тело — пересоздавать
-- сам триггер не нужно.

-- ── 3. Триггер начисления семян +40 за первую публикацию ──────────
CREATE OR REPLACE FUNCTION public.award_seeds_on_first_publish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Условие срабатывания — общее для INSERT и UPDATE:
    -- запись опубликована и семена ранее не начислялись.
    IF NEW.is_published = true
       AND COALESCE(NEW.seeds_awarded, false) = false
       AND NEW.user_id IS NOT NULL THEN

        -- Помечаем raw row, чтобы повторная публикация не дала +40.
        -- UPDATE seeds_awarded НЕ триггерит этот же триггер (он на
        -- AFTER INSERT OR UPDATE OF is_published — seeds_awarded
        -- не входит в OF-список).
        UPDATE public.practices
           SET seeds_awarded = true
         WHERE id = NEW.id;

        -- increment_user_seeds(uuid[], int) — SECURITY DEFINER,
        -- сигнатура подтверждена.
        PERFORM public.increment_user_seeds(ARRAY[NEW.user_id], 40);
    END IF;
    RETURN NULL;  -- AFTER trigger — return value игнорируется.
END;
$$;

DROP TRIGGER IF EXISTS trg_award_seeds_on_publish ON public.practices;
CREATE TRIGGER trg_award_seeds_on_publish
    AFTER INSERT OR UPDATE OF is_published
    ON public.practices
    FOR EACH ROW
    EXECUTE FUNCTION public.award_seeds_on_first_publish();

-- ── RUNBOOK 1.3 — safety-net ДО COMMIT ────────────────────────────
SELECT public.ensure_garden_grants();

COMMIT;

-- ─────────────────────────────────────────────────────────────────
-- VERIFY (вне транзакции)
-- ─────────────────────────────────────────────────────────────────

\echo === V1: колонка seeds_awarded на месте, NOT NULL DEFAULT false ===
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'practices'
  AND column_name = 'seeds_awarded';
-- ожидание: 1 строка, boolean, NO, false.

\echo === V2: бэкфилл — нет опубликованных с seeds_awarded=false ===
SELECT count(*) AS published_unawarded
FROM public.practices
WHERE is_published = true AND seeds_awarded = false;
-- ожидание: 0.

\echo === V3: protect_practice_publish_flag переопределён (owner+admin) ===
SELECT pg_get_functiondef(oid)::text ~ 'auth\.uid\(\) IS DISTINCT FROM OLD\.user_id' AS owner_clause_present
FROM pg_proc WHERE proname='protect_practice_publish_flag' AND pronamespace='public'::regnamespace;
-- ожидание: t.

\echo === V4: триггер trg_award_seeds_on_publish активен ===
SELECT tgname, tgenabled,
       pg_get_triggerdef(oid) AS triggerdef
FROM pg_trigger
WHERE tgrelid = 'public.practices'::regclass
  AND tgname = 'trg_award_seeds_on_publish';
-- ожидание: 1 строка, tgenabled='O', AFTER INSERT OR UPDATE OF is_published.

\echo === V5: смок-INSERT не падает + триггер ставит seeds_awarded=true ===
DO $$
DECLARE
    v_test_user uuid;
    v_pid bigint;
    v_seeds_before int;
    v_seeds_after int;
    v_awarded boolean;
BEGIN
    -- Берём первого админа для безопасного теста (он admin → triggers ОК).
    SELECT id INTO v_test_user FROM public.profiles WHERE role = 'admin' LIMIT 1;
    IF v_test_user IS NULL THEN
        RAISE NOTICE 'V5 SKIP: нет админа в profiles для смок-теста';
        RETURN;
    END IF;

    SELECT seeds INTO v_seeds_before FROM public.profiles WHERE id = v_test_user;

    INSERT INTO public.practices(user_id, title, type, is_published)
    VALUES (v_test_user, '__phase28b_smoke__', 'Тест', true)
    RETURNING id INTO v_pid;

    SELECT seeds_awarded INTO v_awarded FROM public.practices WHERE id = v_pid;
    SELECT seeds INTO v_seeds_after FROM public.profiles WHERE id = v_test_user;

    RAISE NOTICE 'V5 smoke: pid=%, seeds_awarded=%, seeds: %->% (delta=%)',
      v_pid, v_awarded, v_seeds_before, v_seeds_after, (v_seeds_after - v_seeds_before);

    -- Cleanup
    DELETE FROM public.practices WHERE id = v_pid;
    -- Откатываем семена админу, чтобы не ломать его баланс
    UPDATE public.profiles SET seeds = v_seeds_before WHERE id = v_test_user;
END $$;
-- ожидание NOTICE: seeds_awarded=t, delta=40.

\echo === V6: GRANTs не слетели (RUNBOOK 1.3, ожидание 158 / 4) ===
SELECT
  (SELECT count(*) FROM information_schema.role_table_grants
     WHERE grantee='authenticated' AND table_schema='public') AS auth_grants,
  (SELECT count(*) FROM information_schema.role_table_grants
     WHERE grantee='web_anon'      AND table_schema='public') AS anon_grants;
