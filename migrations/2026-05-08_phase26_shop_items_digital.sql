-- migrations/2026-05-08_phase26_shop_items_digital.sql
--
-- Phase 26: добавляет поле download_url в shop_items для цифровых товаров.
--
-- Контекст FEAT-014: Ольга хочет третий тип товара — цифровой
-- (PDF/архив на Google Drive, Dropbox, etc.) с прямой кнопкой
-- «Скачать» на витрине. При заполнении download_url на витрине
-- показывается «Скачать» с приоритетом над link_url/contact.
-- Поле NULL — товар без цифрового содержимого.
--
-- RUNBOOK 1.3:
--   SELECT public.ensure_garden_grants() ДО COMMIT — защита от Timeweb
--   DDL GRANT-wipeout.
--
-- Apply:
--   ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
--     PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
--     -v ON_ERROR_STOP=1 -f /tmp/2026-05-08_phase26_shop_items_digital.sql'

\set ON_ERROR_STOP on

BEGIN;

ALTER TABLE public.shop_items
    ADD COLUMN IF NOT EXISTS download_url text NULL;

COMMENT ON COLUMN public.shop_items.download_url IS
    'URL внешнего файла для цифровых товаров (PDF/архив на Google Drive, Dropbox, etc.). При заполнении на витрине показывается кнопка "Скачать" с приоритетом над link_url/contact.';

-- ── RUNBOOK 1.3 — safety-net ДО COMMIT ────────────────────────────
SELECT public.ensure_garden_grants();

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- VERIFY (вне транзакции)
-- ─────────────────────────────────────────────────────────────────────

\echo === V1: column download_url существует, NULLABLE, type text ===
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'shop_items'
  AND column_name = 'download_url';

\echo === V2: COMMENT ON COLUMN установлен ===
SELECT col_description(a.attrelid, a.attnum) AS comment
FROM pg_attribute a
WHERE a.attrelid = 'public.shop_items'::regclass
  AND a.attname = 'download_url';

\echo === V3: GRANTs на shop_items сохранены ===
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'shop_items'
  AND grantee IN ('authenticated', 'web_anon')
ORDER BY grantee, privilege_type;
