-- migrations/2026-05-15_phase29_prodamus_path_c.sql
--
-- FEAT-015 Path C — Prodamus webhook integration без RESTRICTIVE policies.
-- План: plans/2026-05-15-feat015-prodamus-c.md
-- Recon: docs/journal/RECON_2026-05-15_feat015_prodamus.md
--
-- Что делает:
--   1. Берёт из миграции 21 (НЕ applied на проде) только колонки, индексы,
--      таблицы subscriptions / billing_webhook_logs и trigger touch_*.
--   2. ДОБАВЛЯЕТ новые колонки auto_pause_exempt + _until + _note и partial-
--      индексы под них.
--   3. Backfill: access_status='active' (фиксируем default), exempt=true для
--      ролей admin/applicant/intern (~31 профиль).
--   4. Bridge trigger trg_sync_status_from_access_status (BEFORE UPDATE OF
--      access_status) — синхронизирует profiles.status, чтобы существующий
--      on_profile_status_change_resync_events продолжал работать.
--
-- Чего НЕ делает (отличие от полного 21):
--   - НЕТ helper public.has_platform_access().
--   - НЕТ RESTRICTIVE policies на 13 таблицах.
--   - session_version колонка создаётся (часть 21), но bumping в push-server
--     остаётся «холостым» — хорошо для будущего Path B, не вредит сейчас.
--
-- Зависит от: phase21 (триггер on_profile_status_change_resync_events на status).
--
-- RUNBOOK 1.3: SELECT public.ensure_garden_grants(); ДО COMMIT.
--
-- Apply:
--   ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
--     PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
--     -v ON_ERROR_STOP=1 -f /tmp/2026-05-15_phase29_prodamus_path_c.sql'
--
-- Откат (отдельной миграцией):
--   - DROP TRIGGER trg_sync_status_from_access_status
--   - DROP FUNCTION sync_status_from_access_status()
--   - DROP TRIGGER trg_touch_subscriptions_updated_at
--   - DROP FUNCTION touch_subscriptions_updated_at()
--   - DROP TABLE billing_webhook_logs, subscriptions
--   - ALTER TABLE profiles DROP CONSTRAINT/COLUMN ... (все 12 новых)
--   - SELECT public.ensure_garden_grants()

\set ON_ERROR_STOP on

BEGIN;

-- ── 1. Колонки из миграции 21 (без has_platform_access и RESTRICTIVE) ────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS access_status            text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS subscription_status      text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS paid_until               timestamptz,
  ADD COLUMN IF NOT EXISTS prodamus_subscription_id text,
  ADD COLUMN IF NOT EXISTS prodamus_customer_id     text,
  ADD COLUMN IF NOT EXISTS last_payment_at          timestamptz,
  ADD COLUMN IF NOT EXISTS last_prodamus_event      text,
  ADD COLUMN IF NOT EXISTS last_prodamus_payload    jsonb,
  ADD COLUMN IF NOT EXISTS bot_renew_url            text,
  ADD COLUMN IF NOT EXISTS session_version          integer NOT NULL DEFAULT 1;

-- ── 2. CHECK constraints ─────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_access_status_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_access_status_check
      CHECK (access_status IN ('active', 'paused_expired', 'paused_manual'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_subscription_status_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_subscription_status_check
      CHECK (subscription_status IN ('active', 'overdue', 'deactivated', 'finished'));
  END IF;
END $$;

-- ── 3. Индексы из миграции 21 ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS profiles_access_status_idx           ON public.profiles (access_status);
CREATE INDEX IF NOT EXISTS profiles_subscription_status_idx     ON public.profiles (subscription_status);
CREATE INDEX IF NOT EXISTS profiles_paid_until_idx              ON public.profiles (paid_until);
CREATE INDEX IF NOT EXISTS profiles_prodamus_subscription_id_idx ON public.profiles (prodamus_subscription_id);
CREATE INDEX IF NOT EXISTS profiles_prodamus_customer_id_idx     ON public.profiles (prodamus_customer_id);

-- ── 4. НОВЫЕ колонки auto_pause_exempt (FEAT-015 Path C) ────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS auto_pause_exempt        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_pause_exempt_until  date,
  ADD COLUMN IF NOT EXISTS auto_pause_exempt_note   text;

-- Partial index для admin-вью «Без автопаузы».
CREATE INDEX IF NOT EXISTS idx_profiles_auto_pause_exempt
  ON public.profiles (auto_pause_exempt)
  WHERE auto_pause_exempt = true;

-- Partial index для cron auto-expire по auto_pause_exempt_until.
CREATE INDEX IF NOT EXISTS idx_profiles_auto_pause_exempt_until
  ON public.profiles (auto_pause_exempt_until)
  WHERE auto_pause_exempt_until IS NOT NULL;

-- ── 5. Backfill ──────────────────────────────────────────────────────────
-- 5a. access_status='active' для всех (default уже стоит, но фиксируем
-- состояние явно — на случай, если кто-то добавит NULL в будущем).
UPDATE public.profiles
   SET access_status = 'active'
 WHERE access_status IS NULL;

-- 5b. auto_pause_exempt=true для не-платящих ролей.
-- Pre-flight 2026-05-15: 31 профиль (admin=3 + applicant=15 + intern=13).
-- Менторы и leader'ы платят — не помечаем.
UPDATE public.profiles
   SET auto_pause_exempt = true,
       auto_pause_exempt_note = 'backfill phase29: роль не платит подписку'
 WHERE role IN ('admin', 'applicant', 'intern')
   AND auto_pause_exempt = false;

-- ── 6. Таблицы subscriptions + billing_webhook_logs (из миграции 21) ────
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                       bigserial PRIMARY KEY,
  user_id                  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider                 text NOT NULL DEFAULT 'prodamus',
  provider_subscription_id text,
  status                   text NOT NULL DEFAULT 'active',
  paid_until               timestamptz,
  last_payment_at          timestamptz,
  ended_at                 timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_provider_subscription_uidx
  ON public.subscriptions (provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx  ON public.subscriptions(status);

CREATE TABLE IF NOT EXISTS public.billing_webhook_logs (
  id              bigserial PRIMARY KEY,
  provider        text NOT NULL,
  event_name      text,
  external_id     text,
  payload_json    jsonb NOT NULL,
  signature_valid boolean NOT NULL DEFAULT false,
  is_processed    boolean NOT NULL DEFAULT false,
  error_text      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_webhook_logs_provider_external_uidx
  ON public.billing_webhook_logs (provider, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS billing_webhook_logs_provider_created_idx
  ON public.billing_webhook_logs (provider, created_at DESC);

-- ── 7. Триггер touch_subscriptions_updated_at (из миграции 21) ──────────
CREATE OR REPLACE FUNCTION public.touch_subscriptions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER trg_touch_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_subscriptions_updated_at();

-- ── 8. Bridge trigger: access_status → status (Path C ключевая идея) ────
-- Без этого триггера webhook поменяет access_status, а profiles.status
-- останется прежним → существующий on_profile_status_change_resync_events
-- (AFTER UPDATE OF status) не сработает → events ведущей не исчезнут из
-- публичного фида.
--
-- BEFORE UPDATE OF access_status — мы переписываем NEW.status ДО того, как
-- изменение применится. Это активирует AFTER UPDATE OF status триггер
-- автоматически (он сравнит OLD.status и NEW.status).
--
-- Не используем AFTER + рекурсивный UPDATE — это создавало бы две UPDATE-
-- операции вместо одной.
CREATE OR REPLACE FUNCTION public.sync_status_from_access_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.access_status IN ('paused_expired', 'paused_manual') THEN
        NEW.status := 'suspended';
    ELSIF NEW.access_status = 'active' THEN
        NEW.status := 'active';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_status_from_access_status ON public.profiles;
CREATE TRIGGER trg_sync_status_from_access_status
  BEFORE UPDATE OF access_status
  ON public.profiles
  FOR EACH ROW
  WHEN (OLD.access_status IS DISTINCT FROM NEW.access_status)
  EXECUTE FUNCTION public.sync_status_from_access_status();

-- ── RUNBOOK 1.3 — safety-net ДО COMMIT ──────────────────────────────────
SELECT public.ensure_garden_grants();

COMMIT;

-- ─────────────────────────────────────────────────────────────────
-- VERIFY (вне транзакции)
-- ─────────────────────────────────────────────────────────────────

\echo === V1: новые колонки на месте (12 шт.) ===
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
  AND column_name IN (
    'access_status','subscription_status','paid_until',
    'prodamus_subscription_id','prodamus_customer_id','last_payment_at',
    'last_prodamus_event','last_prodamus_payload','bot_renew_url','session_version',
    'auto_pause_exempt','auto_pause_exempt_until','auto_pause_exempt_note'
  )
ORDER BY column_name;
-- ожидание: 13 строк (12 новых + 0 переписанных).

\echo === V2: backfill auto_pause_exempt — 31 профиль ===
SELECT
  count(*) FILTER (WHERE auto_pause_exempt) AS exempt_total,
  count(*) FILTER (WHERE auto_pause_exempt AND role = 'admin')     AS exempt_admin,
  count(*) FILTER (WHERE auto_pause_exempt AND role = 'applicant') AS exempt_applicant,
  count(*) FILTER (WHERE auto_pause_exempt AND role = 'intern')    AS exempt_intern,
  count(*) FILTER (WHERE NOT auto_pause_exempt AND role = 'leader') AS paying_leader,
  count(*) FILTER (WHERE NOT auto_pause_exempt AND role = 'mentor') AS paying_mentor
FROM public.profiles;
-- ожидание: exempt_total=31 (admin=3, applicant=15, intern=13);
-- paying_leader=18, paying_mentor=7.

\echo === V3: access_status backfill — все active или paused ===
SELECT access_status, count(*)
FROM public.profiles
GROUP BY access_status
ORDER BY count(*) DESC;
-- ожидание: active=56, без NULL.

\echo === V4: таблицы subscriptions + billing_webhook_logs созданы ===
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('subscriptions', 'billing_webhook_logs')
ORDER BY table_name;
-- ожидание: 2 строки.

\echo === V5: bridge trigger trg_sync_status_from_access_status активен ===
SELECT tgname, tgenabled,
       pg_get_triggerdef(oid) AS triggerdef
FROM pg_trigger
WHERE tgrelid = 'public.profiles'::regclass
  AND tgname = 'trg_sync_status_from_access_status';
-- ожидание: 1 строка, tgenabled='O', BEFORE UPDATE OF access_status.

\echo === V6: смок bridge — UPDATE access_status='paused_expired' → status='suspended' ===
DO $$
DECLARE
    v_test_user uuid;
    v_status_before text;
    v_status_after  text;
BEGIN
    -- Берём первого admin (не платит, exempt — но триггер всё равно
    -- сработает, мы тестируем чисто механику, потом откатываем).
    SELECT id, status INTO v_test_user, v_status_before
    FROM public.profiles WHERE role = 'admin' LIMIT 1;
    IF v_test_user IS NULL THEN
        RAISE NOTICE 'V6 SKIP: нет админа для теста';
        RETURN;
    END IF;

    UPDATE public.profiles
       SET access_status = 'paused_expired'
     WHERE id = v_test_user;

    SELECT status INTO v_status_after FROM public.profiles WHERE id = v_test_user;
    RAISE NOTICE 'V6 smoke (bridge access_status=paused_expired): status %->%', v_status_before, v_status_after;

    -- Откат
    UPDATE public.profiles
       SET access_status = 'active',
           status = v_status_before
     WHERE id = v_test_user;
END $$;
-- ожидание NOTICE: status active->suspended.

\echo === V7: GRANTs не слетели (RUNBOOK 1.3, ожидание 158/4 ± дельта phase28) ===
SELECT
  (SELECT count(*) FROM information_schema.role_table_grants
     WHERE grantee='authenticated' AND table_schema='public') AS auth_grants,
  (SELECT count(*) FROM information_schema.role_table_grants
     WHERE grantee='web_anon'      AND table_schema='public') AS anon_grants;
-- ожидание: auth_grants ≥ 158 (стало больше — 2 новых таблицы), anon_grants 4.
