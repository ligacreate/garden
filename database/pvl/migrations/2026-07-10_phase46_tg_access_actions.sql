-- Фаза 3 (live) — журнал действий TG-доступа + идемпотентность.
-- ЧЕРНОВИК на ревью. НЕ ПРИМЕНЯТЬ до 🟢 миграции.
--
-- МОДЕЛЬ ДОСТУПА (проверено на проде 2026-07-10):
--   push-server коннектится как gen_user = ВЛАДЕЛЕЦ всех public.*-таблиц. Владелец имеет полный
--   доступ и НЕ затрагивается daily ACL-wipe Timeweb (16:10 МСК), который снимает гранты только
--   у authenticated/web_anon. Таблица серверная, PII (telegram_user_id), НЕ PostgREST-facing →
--   грантов authenticated/web_anon НЕТ, в ensure_garden_grants() НЕ добавляем.
--   Образец: public.tg_notifications_queue (тоже owner-only, тоже вне ensure_garden_grants).
-- Применять как gen_user (иначе владельцем станет не та роль).

\set ON_ERROR_STOP on
BEGIN;

CREATE TABLE IF NOT EXISTS public.tg_access_actions (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  profile_id        uuid REFERENCES public.profiles(id),
  telegram_user_id  bigint NOT NULL,
  resource          text NOT NULL CHECK (resource IN ('channel','chat')),
  action            text NOT NULL CHECK (action IN ('kick','admit_invite','admit_approve','unban')),
  reason            text NOT NULL,
  paid_until_snap   timestamptz,
  status            text NOT NULL DEFAULT 'planned'
                    CHECK (status IN ('planned','executed','failed','skipped')),
  dedup_key         text NOT NULL,
  invite_link       text,
  tg_response       jsonb,
  batch_id          text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  executed_at       timestamptz
);

-- Идемпотентность: одно ИСПОЛНЕННОЕ действие на (action,uid,resource,эпизод-оплаты).
-- dedup_key = action:uid:resource:YYYY-MM-DD(paid_until). Смена оплаты → новый эпизод → снова можно.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tg_access_actions_dedup
  ON public.tg_access_actions(dedup_key) WHERE status = 'executed';

-- Быстрый разбор планового батча (для confirm-эндпоинта).
CREATE INDEX IF NOT EXISTS ix_tg_access_actions_planned
  ON public.tg_access_actions(status, batch_id) WHERE status = 'planned';

COMMENT ON TABLE public.tg_access_actions IS
  'Фаза 3: журнал действий TG-доступа (kick/admit) + идемпотентность. Owner-only, PII. Не PostgREST.';

-- Защита: явно снять всё с PUBLIC (дефолта и так нет; owner-права остаются). Гранты authenticated/web_anon НЕ выдаём.
REVOKE ALL ON public.tg_access_actions FROM PUBLIC;

COMMIT;

-- ─────────────────────────── VERIFY (вне транзакции) ───────────────────────────
\echo === V1: таблица + 2 частичных индекса ===
SELECT to_regclass('public.tg_access_actions') AS tbl,
       (SELECT count(*) FROM pg_indexes WHERE tablename='tg_access_actions'
         AND indexname IN ('uq_tg_access_actions_dedup','ix_tg_access_actions_planned')) AS idx_cnt;  -- ожид: tbl не NULL, idx_cnt=2

\echo === V2: CHECK-констрейнты resource/action/status ===
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid='public.tg_access_actions'::regclass AND contype='c' ORDER BY conname;

\echo === V3: гранты — ТОЛЬКО gen_user (нет authenticated/web_anon) ===
SELECT grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
  FROM information_schema.role_table_grants WHERE table_name='tg_access_actions' GROUP BY grantee ORDER BY grantee;

\echo === V4: dedup-smoke (в откатываемой транзакции) — второй executed с тем же ключом падает ===
BEGIN;
INSERT INTO public.tg_access_actions(telegram_user_id,resource,action,reason,status,dedup_key)
  VALUES (999999,'chat','kick','smoke','executed','SMOKE-DEDUP');
DO $$
BEGIN
  INSERT INTO public.tg_access_actions(telegram_user_id,resource,action,reason,status,dedup_key)
    VALUES (999999,'chat','kick','smoke','executed','SMOKE-DEDUP');
  RAISE WARNING 'V4 FAIL: дубль executed прошёл!';
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'V4 OK: второй executed заблокирован уникальным индексом';
END $$;
ROLLBACK;  -- тестовые строки не сохраняем
