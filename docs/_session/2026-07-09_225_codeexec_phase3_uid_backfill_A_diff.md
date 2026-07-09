# DIFF-on-review — Фаза 3: бэкфилл `profiles.telegram_user_id` (блок A, 13)

**Дата:** 2026-07-09
**Автор:** codeexec (VS Code)
**Статус:** 🔴 НЕ применён. Жду 🟢 Оли.
**Основание:** точные username-матчи из [recon 224](2026-07-09_224_codeexec_phase3_roster_scrape_username_match.md), блок A.
**Скоуп:** только 13 профилей блока A. Аномалии (B2) и остаток — НЕ трогаю.

---

## Что делает

Идемпотентно проставляет числовой `telegram_user_id` тем 13 Лига-профилям, чей `@username`
(`profiles.telegram`) **точно** совпал с участником ростера канала+чата. Пишем **по `id`**,
только там где сейчас `telegram_user_id IS NULL`.

### Гарантии идемпотентности / безопасности
- `WHERE p.telegram_user_id IS NULL` — повторный прогон ничего не перезапишет (0 rows).
- Пишем строго по 13 явным `id` через `VALUES`-CTE. Никаких `WHERE role`/массовых апдейтов.
- Уникальный partial-index `uq_profiles_telegram_user_id (telegram_user_id) WHERE ... IS NOT NULL`
  защитит от двойного присвоения одного uid — при коллизии транзакция откатится целиком.
  Пред-проверка коллизий уже пройдена (recon: «нет коллизий»), но guard оставлен в БД.
- **`telegram_linked_at` НЕ трогаем** (оставляем NULL). Семантика: это **recon-бэкфилл из ростера,
  а не self-link юзера через `/start LINK-…`**. `telegram_user_id IS NOT NULL` = «привязан»
  (см. COMMENT колонки, phase32); timestamp самопривязки ставить нельзя — иначе отчёты сочтут
  это действием пользователя. Провенанс фиксируем **этим документом + SQL-комментариями** (без
  записи в `billing_webhook_logs`: у таблицы нет UNIQUE `(provider,external_id)` → `ON CONFLICT`
  невозможен, а колонка там `payload_json`; аудит-строку намеренно НЕ пишем, чтобы не раздувать скоуп).
- Всё в одной транзакции: pre-check → collision-check → update → post-check.

---

## SQL (apply-ready, но НЕ применён)

```sql
-- Фаза 3 — бэкфилл telegram_user_id для 13 точных username-матчей (recon 224/225).
-- Read-safe, идемпотентно. Применять ТОЛЬКО после 🟢.
BEGIN;

-- Маппинг id → числовой user_id (источник: скрейп канала -1002377682177 + чата -1002432957741).
CREATE TEMP TABLE _uid_backfill(id uuid, telegram_user_id bigint) ON COMMIT DROP;
INSERT INTO _uid_backfill(id, telegram_user_id) VALUES
  ('f1233488-2674-45c1-90cb-14b668a94718', 145135994),  -- intern Екатерина Ярощук @furiouspike
  ('0acb4b95-bb6c-4232-b78b-4a91934d9f67', 116426446),  -- intern Елена Бондаренко @soleilbo
  ('dbbdb716-455d-4446-a533-a4e9400b1ff5', 648561289),  -- intern Татьяна Рогова @rogova_tatyana
  ('27d87d8b-23fb-4863-8183-9aae5aa3e4b8', 317330995),  -- intern Яна Соболева @soboleva_yana
  ('4d774d19-910c-419b-abb7-fe4e848ee2a1', 572723166),  -- leader Валерия Трошнева @troshnevalera
  ('1dafc14c-4d50-47b0-8d6f-5fc8c2568e28', 1312640155), -- leader Екатерина Куропятникова @katerinakurop
  ('a39c9031-93c5-40f6-83aa-356bb0d643b3', 349611939),  -- leader Ирина Чиненова @irinachinenova
  ('0b2c96cc-9b2a-496a-b5b9-0c7ef87b151f', 459549984),  -- leader Мария Бардина @bardina_mariya
  ('d27cd649-8320-41d9-b6aa-abc65646c492', 375661337),  -- leader Мария Дегожская @my_metodolog
  ('58b74756-1d4f-4b40-94af-63f8778f1d79', 1026394092), -- leader Мария Романова @mari_rroma
  ('e75cc467-1a55-4cfb-8337-4b48a55c4514', 313772206),  -- leader Ольга Пономарева @olyalad
  ('4a661537-b425-41b8-b69c-19abcef2c9d2', 292090432),  -- leader Шилова Мария @m_shilova
  ('628585ef-a6c2-4e1b-b4c6-bf49b5ecc839', 678092523);  -- mentor Наталья Гулякова @natalisuro

-- V0 (pre): все 13 существуют, роль ∈ Лига, uid сейчас NULL. Ожидание: 13 строк, все null_now=t.
\echo === V0 PRE: целевые 13 (ожидание 13 строк, telegram_user_id пуст) ===
SELECT p.id, p.name, p.role, p.telegram,
       (p.telegram_user_id IS NULL) AS null_now,
       b.telegram_user_id AS will_set
FROM _uid_backfill b JOIN public.profiles p USING (id)
ORDER BY p.role, p.name;

-- V0b: коллизии — не занят ли какой-то из 13 uid другим профилем. Ожидание: 0 строк.
\echo === V0b PRE: коллизии uid с другими профилями (ожидание 0) ===
SELECT b.telegram_user_id, p.id AS taken_by, p.name
FROM _uid_backfill b JOIN public.profiles p ON p.telegram_user_id = b.telegram_user_id
WHERE p.id <> b.id;

-- UPDATE (идемпотентно: только где NULL).
UPDATE public.profiles p
SET telegram_user_id = b.telegram_user_id
FROM _uid_backfill b
WHERE p.id = b.id
  AND p.telegram_user_id IS NULL;

-- V1 (post): 13 профилей теперь с проставленным uid. Ожидание: 13, все = целевому.
\echo === V1 POST: 13 проставлены (ожидание match=t у всех 13) ===
SELECT p.name, p.role, p.telegram_user_id,
       (p.telegram_user_id = b.telegram_user_id) AS match
FROM _uid_backfill b JOIN public.profiles p USING (id)
ORDER BY p.role, p.name;

-- V2: общее покрытие Лига-ролей. Ожидание: filled=21, null=20.
\echo === V2: покрытие telegram_user_id по Лига-ролям (ожидание filled=21) ===
SELECT count(*) FILTER (WHERE telegram_user_id IS NOT NULL) AS filled,
       count(*) FILTER (WHERE telegram_user_id IS NULL)     AS still_null
FROM public.profiles WHERE role IN ('intern','leader','mentor');

-- COMMIT;  -- ← снять комментарий только на apply после 🟢. Пока — ROLLBACK при dryrun.
ROLLBACK;
```

---

## План применения (после 🟢)

1. Прогнать как есть (`ROLLBACK` в конце) → dryrun: убедиться V0=13/null, V0b=0, V1 match, V2 filled=21.
2. Заменить финальный `ROLLBACK;` на `COMMIT;` → применить одним `psql -f` (один ssh-коннект, fail2ban).
3. Отчёт об apply → `_session/226`.

## Проверки схемы (сделаны, вопросов к Оле нет)
- Пред-проверка коллизий 13 uid против всех профилей — **чисто** (recon 224).
- `uq_profiles_telegram_user_id` (partial-unique) присутствует — БД-guard от двойного присвоения.
- Аудит-строку в `billing_webhook_logs` **не пишем** осознанно (нет UNIQUE `(provider,external_id)`
  → идемпотентный `ON CONFLICT` невозможен; провенанс — этот документ).

**Не применяю до 🟢.**
