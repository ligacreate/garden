-- FEAT-002 followup — нормализация http:// → https:// в profiles.telegram.
-- Дата: 2026-05-06 (перед релизом FEAT-002 этап 4 в meetings)
--
-- Контекст:
--   Перед релизом этапа 4 в meetings (две кнопки контакта на карточке
--   встречи) meetings-стратег выявил расхождение с canonical-контрактом
--   host_telegram через curl по api.skrebeyko.ru/events.
--
--   Нашлось:
--   - 2 profiles с telegram = 'http://t.me/...' (без s):
--     · Мария Бардина  (0b2c96cc-9b2a-496a-b5b9-0c7ef87b151f)
--     · Рухшана         (401ad7f9-8fa0-4df0-8425-ce30efb74097)
--   - 31 event с host_telegram = 'http://...' (от их meeting'ов через
--     phase 22 backfill).
--
--   Из них 2 upcoming events Рухшаны (id 273, 274) — без фикса остались
--   бы без CTA-кнопки на проде.
--
--   Источник проблемы: автонормализация TG (lib/contactNormalize.js,
--   FEAT-002 этап 3) приводит http:// → https:// при сохранении ИЗ
--   ФОРМЫ. Existing записи (которые ведущие никогда не правили через
--   форму) остались с http://. Это была дыра в этапе 1 гигиены —
--   фильтр RECON засчитывал http:// как «full_url валиден».
--
-- Эффект:
--   - profiles.telegram у 2 ведущих → https://t.me/...
--   - phase 22 trigger on_profile_contacts_change_resync_events
--     автоматически пересинкивает events.host_telegram у их 31 встречи
--     (DELETE + re-fire через no-op UPDATE meetings).
--   - Финальное состояние: 149 canonical / 9 empty / 0 http в events.
--
-- Apply: psql под gen_user, прогнан стратегом 2026-05-06.
--
-- Связано:
--   plans/BACKLOG.md (История 2026-05-06)
--   migrations/2026-05-05_phase22_vk_field_and_event_contacts.sql (trigger)
--   lib/contactNormalize.js (нормализатор для будущих сохранений)

\set ON_ERROR_STOP on

BEGIN;

UPDATE profiles
SET telegram = REPLACE(telegram, 'http://t.me/', 'https://t.me/')
WHERE telegram LIKE 'http://t.me/%';

COMMIT;

-- VERIFY (вне транзакции)

\echo === V1: ни одного http:// в profiles.telegram ===
SELECT count(*) AS profiles_http_remaining
FROM profiles
WHERE telegram ILIKE 'http://%';
-- ожидание: 0

\echo === V2: ни одного http:// в events.host_telegram (через trigger) ===
SELECT count(*) AS events_http_remaining
FROM events
WHERE host_telegram ILIKE 'http://%';
-- ожидание: 0

\echo === V3: финальное распределение events.host_telegram ===
SELECT
  CASE
    WHEN host_telegram = '' OR host_telegram IS NULL THEN 'empty'
    WHEN host_telegram LIKE 'https://t.me/%'         THEN 'canonical https://t.me/'
    WHEN host_telegram LIKE 'http://t.me/%'          THEN 'http (non-canonical)'
    ELSE 'other'
  END AS bucket,
  count(*)
FROM events
GROUP BY bucket
ORDER BY bucket;
-- ожидание: только canonical и empty buckets, без http и other
