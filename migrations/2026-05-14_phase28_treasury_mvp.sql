-- migrations/2026-05-14_phase28_treasury_mvp.sql
--
-- FEAT-019 MVP «Сокровищница». В Practice добавляются поля под
-- публикацию и форк. Раздел Сокровищница = режим публикации
-- существующей таблицы practices (флаг is_published), не отдельная
-- сущность.
--
-- Что делает миграция:
--   1. Колонки: is_published, published_at, forked_from,
--      forked_from_author_name.
--   2. Partial-индексы для выборки опубликованных и форков.
--   3. RLS:
--      - Practices_View_Published — все authenticated читают
--        опубликованные практики.
--      - Practices_View_Admin     — админ читает любую (нужен
--        для AdminPracticesView, фаза 4).
--      - Practices_Update_Admin   — админ меняет любую практику
--        (для публикации / снятия чужих практик).
--   4. Триггер protect_practice_publish_flag — обычный пользователь
--      не может выставить себе is_published / published_at через
--      DevTools. Только админ.
--
-- Чего НЕ делает (фаза 2):
--   - расширенные классификаторы (practice_type, intensity и т.д.);
--   - модерационная очередь, семена за публикацию;
--   - is_for_sale / price / purchase_log (маркетплейс);
--   - forks_count, full-text search.
--
-- ON DELETE SET NULL для forked_from: если оригинал удалили, копия
-- сохраняется, атрибуция остаётся в forked_from_author_name (text-кэш).
--
-- RUNBOOK 1.3: SELECT public.ensure_garden_grants(); ДО COMMIT.
--
-- Apply:
--   ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
--     PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
--     -v ON_ERROR_STOP=1 -f /tmp/2026-05-14_phase28_treasury_mvp.sql'
--
-- Откат (если потребуется, отдельной миграцией):
--   - DROP POLICY  Practices_View_Published / View_Admin / Update_Admin
--   - DROP TRIGGER trg_protect_practice_publish_flag
--   - DROP FUNCTION public.protect_practice_publish_flag()
--   - DROP INDEX   idx_practices_is_published / idx_practices_forked_from
--   - ALTER TABLE … DROP COLUMN is_published / published_at /
--     forked_from / forked_from_author_name
--   - SELECT public.ensure_garden_grants();

\set ON_ERROR_STOP on

BEGIN;

-- ── 1. Новые колонки ──────────────────────────────────────────────
ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS is_published            boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS published_at            timestamptz,
  ADD COLUMN IF NOT EXISTS forked_from             bigint
    REFERENCES public.practices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS forked_from_author_name text;

-- ── 2. Partial-индексы ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_practices_is_published
  ON public.practices (is_published)
  WHERE is_published = true;

CREATE INDEX IF NOT EXISTS idx_practices_forked_from
  ON public.practices (forked_from)
  WHERE forked_from IS NOT NULL;

-- ── 3. RLS: публичное чтение опубликованных ───────────────────────
DROP POLICY IF EXISTS "Practices_View_Published" ON public.practices;
CREATE POLICY "Practices_View_Published" ON public.practices
  FOR SELECT
  TO authenticated
  USING (is_published = true);

-- ── 4. RLS: админ читает любую практику (под AdminPracticesView) ──
DROP POLICY IF EXISTS "Practices_View_Admin" ON public.practices;
CREATE POLICY "Practices_View_Admin" ON public.practices
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- ── 5. RLS: админ может UPDATE любую (для публикации чужих) ───────
DROP POLICY IF EXISTS "Practices_Update_Admin" ON public.practices;
CREATE POLICY "Practices_Update_Admin" ON public.practices
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── 6. Триггер: только админ может трогать is_published / published_at
-- Без этого триггера обычная ведущая через DevTools может PATCH
-- ?id=eq.<своя_практика> body={"is_published": true} — Practices_
-- Update_Own даст ей UPDATE на свою запись, без column-level RLS.
-- Триггер — самый чистый защитник: атомарно, не зависит от GRANT'ов
-- (которые сбивает Timeweb после DDL).
CREATE OR REPLACE FUNCTION public.protect_practice_publish_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF (NEW.is_published IS DISTINCT FROM OLD.is_published
        OR NEW.published_at IS DISTINCT FROM OLD.published_at)
       AND NOT public.is_admin() THEN
        RAISE EXCEPTION
          'publication flag is admin-only (practice id=%)',
          OLD.id
          USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_practice_publish_flag ON public.practices;
CREATE TRIGGER trg_protect_practice_publish_flag
  BEFORE UPDATE OF is_published, published_at
  ON public.practices
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_practice_publish_flag();

-- ── RUNBOOK 1.3 — safety-net ДО COMMIT ────────────────────────────
SELECT public.ensure_garden_grants();

COMMIT;

-- ─────────────────────────────────────────────────────────────────
-- VERIFY (вне транзакции)
-- ─────────────────────────────────────────────────────────────────

\echo === V1: новые колонки на месте ===
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'practices'
  AND column_name IN (
    'is_published','published_at','forked_from','forked_from_author_name'
  )
ORDER BY column_name;
-- ожидание: 4 строки.

\echo === V2: новые политики на practices ===
SELECT policyname, cmd, roles::text, qual
FROM pg_policies
WHERE schemaname='public' AND tablename='practices'
  AND policyname IN (
    'Practices_View_Published',
    'Practices_View_Admin',
    'Practices_Update_Admin'
  )
ORDER BY policyname;
-- ожидание: 3 строки.

\echo === V3: partial-индексы созданы ===
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname='public' AND tablename='practices'
  AND indexname IN (
    'idx_practices_is_published',
    'idx_practices_forked_from'
  )
ORDER BY indexname;
-- ожидание: 2 строки с WHERE в indexdef.

\echo === V4: триггер защиты publish-флага активен ===
SELECT tgname, tgenabled,
       pg_get_triggerdef(oid) AS triggerdef
FROM pg_trigger
WHERE tgrelid = 'public.practices'::regclass
  AND tgname = 'trg_protect_practice_publish_flag';
-- ожидание: 1 строка, tgenabled='O' (включен), BEFORE UPDATE OF is_published, published_at.

\echo === V5: FK forked_from → practices(id) ON DELETE SET NULL ===
SELECT
  tc.constraint_name,
  kcu.column_name,
  ccu.table_schema || '.' || ccu.table_name AS references,
  rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints rc
  ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
WHERE tc.constraint_type='FOREIGN KEY'
  AND tc.table_schema='public' AND tc.table_name='practices'
  AND kcu.column_name='forked_from';
-- ожидание: 1 строка, references='public.practices', delete_rule='SET NULL'.

\echo === V6: GRANTs не слетели (RUNBOOK 1.3, ожидание 158 / 4) ===
SELECT
  (SELECT count(*) FROM information_schema.role_table_grants
     WHERE grantee='authenticated' AND table_schema='public') AS auth_grants,
  (SELECT count(*) FROM information_schema.role_table_grants
     WHERE grantee='web_anon'      AND table_schema='public') AS anon_grants;

\echo === V7: смок — до первой публикации 0 опубликованных ===
SELECT count(*) AS published_total
FROM public.practices WHERE is_published = true;
-- ожидание: 0.
