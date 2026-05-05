-- FEAT-002 этап 1 — гигиена profiles.telegram + meetings.payment_link.
-- Дата: 2026-05-05
-- Источники истины:
--   docs/RECON_2026-05-04_feat002_data_hygiene.md   (зоопарк)
--   docs/RECON_2026-05-04_feat002_telegram_match.md (Telethon match)
--
-- 28 UPDATE на profiles.telegram (10 high + 4 medium + 4 manual + 7
-- нормализация B + 3 локальные A) + 17 UPDATE на meetings.payment_link
-- (4 VK, 10 Мельниковой, 3 прочих) = 45 UPDATE одной транзакцией.
--
-- Запуск под gen_user:
--   psql -f migrations/data/2026-05-05_feat002_hygiene.sql
--
-- ON_ERROR_STOP — если любой UPDATE упал, транзакция откатывается.

\set ON_ERROR_STOP on

BEGIN;

-- ════════════════════════════════════════════════════════════════════
-- I. profiles.telegram — 28 UPDATE
-- ════════════════════════════════════════════════════════════════════

-- 🟢 High Telethon match (10):
UPDATE profiles SET telegram='https://t.me/aleksandra_v_titova' WHERE id='a2356b84-84de-4d86-9ca4-f3ab06d1d01d'; -- Александра Титова
UPDATE profiles SET telegram='https://t.me/TroshneValera'        WHERE id='4d774d19-910c-419b-abb7-fe4e848ee2a1'; -- Валерия Трошнева
UPDATE profiles SET telegram='https://t.me/LuzinaVasilina'       WHERE id='6cf385c3-5d4b-44dc-bcf1-6aa17d50bac7'; -- Василина Лузина
UPDATE profiles SET telegram='https://t.me/Furiouspike'          WHERE id='f1233488-2674-45c1-90cb-14b668a94718'; -- Екатерина Ярощук
UPDATE profiles SET telegram='https://t.me/my_metodolog'         WHERE id='d27cd649-8320-41d9-b6aa-abc65646c492'; -- Мария Дегожская
UPDATE profiles SET telegram='https://t.me/natalisuro'           WHERE id='628585ef-a6c2-4e1b-b4c6-bf49b5ecc839'; -- Наталья Гулякова
UPDATE profiles SET telegram='https://t.me/NatalyaMakhneva'      WHERE id='2f7abb9c-ceff-43a5-baaf-3ed14fd85b78'; -- Наталья Махнёва
UPDATE profiles SET telegram='https://t.me/ksanushka2005'        WHERE id='308b6130-85ed-41d3-97db-7227bfac001f'; -- Оксана Витовская
UPDATE profiles SET telegram='https://t.me/olgasadovnik08'       WHERE id='746c80bc-ddec-4189-8b95-dcc386161f1f'; -- Ольга Садовникова
UPDATE profiles SET telegram='https://t.me/M_Shilova'            WHERE id='4a661537-b425-41b8-b69c-19abcef2c9d2'; -- Шилова Мария

-- 🟡 Medium Telethon match с подтверждением Ольги (4):
UPDATE profiles SET telegram='https://t.me/Veronnika_Luto' WHERE id='b90d5f86-3b0e-4f99-8d37-7b32dcf9c401'; -- Вероника Лютова
UPDATE profiles SET telegram='https://t.me/DianaZernova'   WHERE id='0e978b3b-bb91-413d-8d5f-d0383b7abb65'; -- Диана Зернова
UPDATE profiles SET telegram='https://t.me/Lena_leto18'    WHERE id='fd3a3ab0-3e25-4034-9504-d2f55755b8f3'; -- Елена Соковнина
UPDATE profiles SET telegram='https://t.me/Liliia545'      WHERE id='d302b93d-5d29-4787-82d3-526dfe8c4a15'; -- Лилия Мaлонг

-- 🆕 Manual (Ольга нашла руками, плюс TG из payment_link Романовой) (4):
UPDATE profiles SET telegram='https://t.me/kolotilova_svetlana' WHERE id='df6d3afc-1c5b-4d68-af6f-4eb646c1f5f9'; -- Колотилова Светлана Николаевна
UPDATE profiles SET telegram='https://t.me/BorodinaOS'          WHERE id='ffc69734-6ad6-4671-83fa-b23e5723a93f'; -- Ольга Бородина
UPDATE profiles SET telegram='https://t.me/KOLKOVA_E_A'         WHERE id='011fc1cc-d755-4482-a947-7daf08fe57e7'; -- Елена Колкова
UPDATE profiles SET telegram='https://t.me/mari_rroma'          WHERE id='58b74756-1d4f-4b40-94af-63f8778f1d79'; -- Мария Романова (TG из её payment_link встречи 204, тримм)

-- 🔠 Нормализация B-секции (@username/bare → канонический формат) (7):
UPDATE profiles SET telegram='https://t.me/AngelikaTara'    WHERE id='9fb65c2a-4541-4fef-8b8b-3b93d8f6b881'; -- Анжелика Тарасова
UPDATE profiles SET telegram='https://t.me/Nataly300570'    WHERE id='6d260793-14b2-44d0-907b-2d2772331231'; -- Баженова Наталья
UPDATE profiles SET telegram='https://t.me/dasha_starosta'  WHERE id='147aea39-d127-4e31-a66d-dbd47e1c84be'; -- Дарья Старостина
UPDATE profiles SET telegram='https://t.me/ElenaKurdyukova' WHERE id='5aa62776-6229-4270-9886-33316ff035c6'; -- Елена Курдюкова
UPDATE profiles SET telegram='https://t.me/Inna_Kulish'     WHERE id='f8799e7a-6618-473f-92d3-c897b5451cf0'; -- Инна Кулиш — расщепление composite "@Inna_Kulish      https://vk.me/psiholog_kulish": VK уйдёт в profiles.vk через UI после phase 22
UPDATE profiles SET telegram='https://t.me/Olga_Ivashova'   WHERE id='3ae56fd2-d83b-420c-a742-5198829b0bf6'; -- Ольга Ивашова
UPDATE profiles SET telegram='https://t.me/irinavitt_p'     WHERE id='35019374-d7de-4900-aa9d-1797bcca9769'; -- Ирина Петруня

-- 🔧 Локальные правки секции A (3):
UPDATE profiles SET telegram='https://t.me/helen_kokorina'  WHERE id='1924217f-f24d-450b-947f-e0339ef82fc8'; -- Елена Кокорина (был ' https://t.me/helen_kokorina' с ведущим пробелом)
UPDATE profiles SET telegram='https://t.me/MarinaShulga87'  WHERE id='d128a7a3-2c1d-4ba9-92fa-cd72d69f9837'; -- Марина Шульга (был 't.me/MarinaShulga87' без https://)
UPDATE profiles SET telegram=''                              WHERE id='63f48d80-3704-49b9-9dc9-143e51c59228'; -- Светлана Исламова (был VK 'https://vk.com/psigraf_swetlana' — перенесём в profiles.vk через UI после phase 22)

-- ════════════════════════════════════════════════════════════════════
-- II. meetings.payment_link — 17 UPDATE (всё → '')
-- ════════════════════════════════════════════════════════════════════

-- D.1 — 4 VK (после phase 22 уйдут в profiles.vk через UI):
UPDATE meetings SET payment_link='' WHERE id=49;  -- Колотилова, vk.com/kolotilovasvetann (запоминаем для VK-backfill)
UPDATE meetings SET payment_link='' WHERE id=211; -- Инна Кулиш, vk.me/psiholog_kulish
UPDATE meetings SET payment_link='' WHERE id=212; -- Инна Кулиш, vk.me/psiholog_kulish
UPDATE meetings SET payment_link='' WHERE id=222; -- Юлия Громова, vk.com/id42003360 (запоминаем для VK-backfill)

-- D.2 — 10 встреч Мельниковой (suspended) с @AneleRay:
UPDATE meetings SET payment_link='' WHERE id IN (54, 55, 56, 57, 58, 59, 110, 111, 112, 113);

-- D.2 — 3 прочих:
UPDATE meetings SET payment_link='' WHERE id=102; -- Инна Кулиш, MTS-link, прошедшая
UPDATE meetings SET payment_link='' WHERE id=204; -- Мария Романова, https://t.me/mari_rroma (с пробелом). TG уже перенесён в её profiles.telegram выше
UPDATE meetings SET payment_link='' WHERE id=103; -- Ольга Скребейко, лендинг издательства, прошедшая

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- VERIFY (вне транзакции)
-- ════════════════════════════════════════════════════════════════════

\echo === V1: profiles.telegram canonical https://t.me/* для 27 (28 минус Светлана Исламова с telegram='') ===
SELECT count(*) AS v1_telegram_canonical FROM profiles WHERE id IN (
  'a2356b84-84de-4d86-9ca4-f3ab06d1d01d','4d774d19-910c-419b-abb7-fe4e848ee2a1',
  '6cf385c3-5d4b-44dc-bcf1-6aa17d50bac7','f1233488-2674-45c1-90cb-14b668a94718',
  'd27cd649-8320-41d9-b6aa-abc65646c492','628585ef-a6c2-4e1b-b4c6-bf49b5ecc839',
  '2f7abb9c-ceff-43a5-baaf-3ed14fd85b78','308b6130-85ed-41d3-97db-7227bfac001f',
  '746c80bc-ddec-4189-8b95-dcc386161f1f','4a661537-b425-41b8-b69c-19abcef2c9d2',
  'b90d5f86-3b0e-4f99-8d37-7b32dcf9c401','0e978b3b-bb91-413d-8d5f-d0383b7abb65',
  'fd3a3ab0-3e25-4034-9504-d2f55755b8f3','d302b93d-5d29-4787-82d3-526dfe8c4a15',
  'df6d3afc-1c5b-4d68-af6f-4eb646c1f5f9','ffc69734-6ad6-4671-83fa-b23e5723a93f',
  '011fc1cc-d755-4482-a947-7daf08fe57e7','58b74756-1d4f-4b40-94af-63f8778f1d79',
  '9fb65c2a-4541-4fef-8b8b-3b93d8f6b881','6d260793-14b2-44d0-907b-2d2772331231',
  '147aea39-d127-4e31-a66d-dbd47e1c84be','5aa62776-6229-4270-9886-33316ff035c6',
  'f8799e7a-6618-473f-92d3-c897b5451cf0','3ae56fd2-d83b-420c-a742-5198829b0bf6',
  '35019374-d7de-4900-aa9d-1797bcca9769','1924217f-f24d-450b-947f-e0339ef82fc8',
  'd128a7a3-2c1d-4ba9-92fa-cd72d69f9837'
) AND telegram LIKE 'https://t.me/%';
-- ожидание: 27

\echo === V2: meetings.payment_link очищен для 17 id ===
SELECT count(*) AS v2_meetings_cleared FROM meetings WHERE id IN (
  49, 54, 55, 56, 57, 58, 59, 102, 103, 110, 111, 112, 113, 204, 211, 212, 222
) AND (payment_link IS NULL OR payment_link='');
-- ожидание: 17

\echo === V3: Светлана Исламова telegram='' (контроль очистки VK) ===
SELECT id, telegram FROM profiles WHERE id='63f48d80-3704-49b9-9dc9-143e51c59228';
-- ожидание: telegram=''

\echo === V4: Инна Кулиш — расщепление сработало (TG без VK-части) ===
SELECT id, telegram FROM profiles WHERE id='f8799e7a-6618-473f-92d3-c897b5451cf0';
-- ожидание: telegram='https://t.me/Inna_Kulish'
