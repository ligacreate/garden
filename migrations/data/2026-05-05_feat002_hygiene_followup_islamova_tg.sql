-- FEAT-002 этап 1 — followup: backfill telegram для Светланы Исламовой.
-- Дата: 2026-05-05 (после основной гигиены 2026-05-05_feat002_hygiene.sql, commit e28bfb9)
--
-- Контекст:
--   В основной миграции 2026-05-05 telegram Светланы Исламовой был
--   очищен в '' — потому что в нём лежал VK-линк (https://vk.com/
--   psigraf_swetlana), а не TG. Реальный TG у неё всё-таки есть,
--   Ольга прислала https://t.me/SwetlanaIslamova.
--
--   Также сохраняем VK для UI-backfill после phase 22 (отдельный
--   список в plans/BACKLOG.md → CLEAN-013/История 2026-05-05):
--     vk = https://vk.com/psigraf_swetlana
--
-- Источник истины: docs/RECON_2026-05-04_feat002_data_hygiene.md секция A,
--                  docs/RECON_2026-05-04_feat002_telegram_match.md (Светлана
--                  была в категории "VK в TG-поле, реальный TG нужно достать
--                  отдельно").
--
-- Эффект: active+empty_telegram становится 3 → 2 (LIlia MALONG, Лена Ф,
--          Рита остаются — все CLEAN-013, тестовые/дубль).
--
-- Запуск под gen_user:
--   psql -f migrations/data/2026-05-05_feat002_hygiene_followup_islamova_tg.sql

\set ON_ERROR_STOP on

BEGIN;

UPDATE profiles
SET telegram = 'https://t.me/SwetlanaIslamova'
WHERE id = '63f48d80-3704-49b9-9dc9-143e51c59228'; -- Светлана Исламова

NOTIFY pgrst, 'reload schema';

COMMIT;

-- VERIFY
\echo === Светлана Исламова — telegram заполнен ===
SELECT id, name, telegram, role, status
FROM profiles
WHERE id = '63f48d80-3704-49b9-9dc9-143e51c59228';
-- ожидание: telegram = 'https://t.me/SwetlanaIslamova'

\echo === Active с пустым telegram (после followup) ===
SELECT count(*) AS active_empty_tg
FROM profiles
WHERE status = 'active' AND (telegram IS NULL OR telegram = '');
-- ожидание: 3 (LIlia MALONG, Лена Ф, Рита — все CLEAN-013)
