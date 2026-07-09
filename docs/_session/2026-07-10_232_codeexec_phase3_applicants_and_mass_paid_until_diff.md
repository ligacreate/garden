# Фаза 3 — exempt APPLIED + diff-on-review: абитуриенты→intern + массовый paid_until

**Дата:** 2026-07-10
**Автор:** codeexec (VS Code)
**Основание:** recon [`_session/230`](2026-07-10_230_codeexec_phase3_paylist_paid_until_reconcile.md), [`_session/231`](2026-07-10_231_codeexec_phase3_exempt_diff_and_answers.md).

---

## 0. Exempt — ✅ ПРИМЕНЕНО

`auto_pause_exempt=true, until=NULL` проставлен: **Елена Кокорина** + **Мария Дегожская** (leader).
`exempt_total` в БД = 2. Власову не трогал (нет профиля). Dry→commit, self-guarded, verify зелёные.

---

## 1. Абитуриенты → intern (4) — DIFF-ON-REVIEW 🔴 (не применён)

### ⚠️ ФЛАГ по модели ролей (проверил перед apply)
Смена `applicant→intern` **меняет доступ**, но не рвёт курс на уровне данных:
- **Курс ПВЛ (данные): доступ СОХРАНЯЕТСЯ.** `pvlRoleResolver` мапит И `applicant`, И `intern` → PVL-роль
  `'student'` ([pvlRoleResolver.js:21-23](../../services/pvlRoleResolver.js)). Стажёр остаётся студентом курса.
- **UI-вход в курс ТЕРЯЕТСЯ.** Кнопка «ПВЛ» в сайдбаре Сада = `canOpenPvlButton = isApplicant`
  ([UserApp.jsx:81](../../views/UserApp.jsx)) — только абитуриентам. Стажёр кнопку **не увидит** (вход в курс
  из сайдбара остаётся лишь у mentor+ через «Учительскую»). Т.е. доступ к курсу есть, а удобной кнопки-входа нет.
- **Стажёр ПОЛУЧАЕТ:** Дашборд, Магазин, «Люди CRM», внесение встреч; лендинг меняется `library→dashboard`.

**Вывод:** промоушен уместен, если эти 4 **закончили/уходят из ПВЛ**. Если ещё активно проходят курс —
после промоушена им будет неудобно в него заходить (нет кнопки). **Реши по каждой: готова ли она в стажёры.**
Diff готов, но **держу до твоего ок** (можно по-именно).

### Данные (id + текущее состояние)
| Профиль (applicant) | id | uid в БД | Действие с uid | paid_until |
|---|---|---|---|---|
| Александра Титова | `a2356b84-84de-4d86-9ca4-f3ab06d1d01d` | 1323439093 ✓ | есть | 2026-08-08 |
| Ирина Петруня | `35019374-d7de-4900-aa9d-1797bcca9769` | 1886607302 ✓ | есть | 2026-08-08 |
| Ольга Разжигаева | `90c9b7c7-db13-41bd-b393-49d79fc571b1` | 1391856263 ✓ | есть | 08-07→08-08 |
| Лилия Малонг | `d302b93d-5d29-4787-82d3-526dfe8c4a15` | — | **проставить 5700227381** | 2026-08-08 |

### План apply (после 🟢, по подтверждённым именам)
1. **SQL (self-guarded):** `role='intern'` четверым + `telegram_user_id=5700227381` Малонг (WHERE uid IS NULL,
   collision-guard). Идемпотентно.
2. **Аудит + paid_until — штатным эндпоинтом** `POST /api/billing/admin/mark-paid` на каждую
   (`plan_code=1m, amount=2000, until_date=2026-08-08, payment_date=2026-07-08, note='промоушен applicant→intern; Лига-оплата 2026-07-08 Prodamus', idempotency_key=manual-<name>-2026-07-08-1m`).
   Создаёт `payment_orders(manual/paid)` + `subscriptions`, ставит paid_until=08-08 (для Разжигаевой поднимет 08-07→08-08).
   > Нюанс: у всех 4 **уже есть реальный Prodamus-платёж** (в CSV). Manual-строка = аудит-маркер промоушена,
   > не новые деньги (в note явно про Prodamus). Если не хочешь дубль-запись оплаты — скажу, оставлю только
   > SQL role+uid, а paid_until проставлю в массовом п.2 (GREATEST). **Реши: нужен ли manual-аудит.**

```sql
-- SQL часть (role + uid Малонг). Не применён.
BEGIN;
UPDATE public.profiles SET role='intern'
 WHERE id IN ('a2356b84-84de-4d86-9ca4-f3ab06d1d01d','35019374-d7de-4900-aa9d-1797bcca9769',
              '90c9b7c7-db13-41bd-b393-49d79fc571b1','d302b93d-5d29-4787-82d3-526dfe8c4a15')
   AND role='applicant';
UPDATE public.profiles SET telegram_user_id=5700227381
 WHERE id='d302b93d-5d29-4787-82d3-526dfe8c4a15' AND telegram_user_id IS NULL;  -- Малонг
ROLLBACK;  -- COMMIT после 🟢
```

---

## 2. Массовый `paid_until = GREATEST(DB, расчёт)` — DIFF-ON-REVIEW 🔴 (не применён)

Все подтверждённые Лига-плательщики роли `intern/leader/mentor` (33). 12-мес исключены (Bucket 5),
абитуриенты — в п.1. **GREATEST → никогда не уменьшает** (Романова DB 08-08 > расчёт 07-09 → остаётся 08-08).

### Нетто-эффект (33): 22 no-op · 1 подъём · 8 прошлых-на-уже-паузе · **2 ⚠ вынесены**
- **1 подъём в будущее:** Елена Бондаренко → `2026-07-17` (платит, active, БД была пуста — защищаем).
- **8 прошлых дат на УЖЕ приостановленных** (paused_manual/expired) — безвредно, документирует «оплачено до».
- **⚠ 2 ВЫНЕСЕНЫ из батча — активны, но расчёт в прошлом → reconcile их запаузит:**
  - **Шилова Мария** (leader, active, посл. Лига-платёж 04-05 → 05-05). В чате. Оплаты 2 мес нет → **бартер/годовик?**
  - **Юлия Габрух** (mentor, active, посл. 05-10 → 06-10). В чате. → **бартер/годовик?**
  - Решение по ним: (а) exempt (если бартер) — тогда в паузу не попадут; (б) включить в массовый апдейт
    (если реально истекли → пусть reconcile паузит). **Не включаю без твоего слова.**

### SQL (31 строка, GREATEST, self-guarded). Не применён.
```sql
\set ON_ERROR_STOP on
\if :{?do_commit}
\else
  \set do_commit false
\endif
BEGIN;
CREATE TEMP TABLE _pu(id uuid, comp date) ON COMMIT DROP;
INSERT INTO _pu(id, comp) VALUES
  ('4250ffac-acd7-4209-bd28-b31bd9c02665', DATE '2026-05-20'),  -- intern Анастасия Ван
  ('6d260793-14b2-44d0-907b-2d2772331231', DATE '2026-06-13'),  -- intern Баженова Наталья
  ('f1233488-2674-45c1-90cb-14b668a94718', DATE '2026-07-13'),  -- intern Екатерина Ярощук
  ('0acb4b95-bb6c-4232-b78b-4a91934d9f67', DATE '2026-07-17'),  -- intern Елена Бондаренко  ← подъём
  ('f8799e7a-6618-473f-92d3-c897b5451cf0', DATE '2026-07-16'),  -- intern Инна Кулиш
  ('c5d88ec4-58ef-4145-a818-2d8518adbe78', DATE '2026-07-27'),  -- intern Мария Бочкарёва
  ('b34b18bf-aca5-4058-a2a0-deab9b4f459d', DATE '2026-07-02'),  -- intern Наталья Ильиных
  ('3ae56fd2-d83b-420c-a742-5198829b0bf6', DATE '2026-07-06'),  -- intern Ольга Ивашова
  ('401ad7f9-8fa0-4df0-8425-ce30efb74097', DATE '2026-07-02'),  -- intern Рухшана
  ('63f48d80-3704-49b9-9dc9-143e51c59228', DATE '2026-06-02'),  -- intern Светлана Исламова
  ('dbbdb716-455d-4446-a533-a4e9400b1ff5', DATE '2026-08-08'),  -- intern Татьяна Рогова
  ('d427f212-9280-46dd-8209-9eeafd4d3d76', DATE '2026-06-24'),  -- intern Юлия Громова
  ('27d87d8b-23fb-4863-8183-9aae5aa3e4b8', DATE '2026-07-13'),  -- intern Яна Соболева
  ('789b6955-a56a-45b4-b430-8ff7182a7436', DATE '2026-06-20'),  -- intern Ярослава Шайтанова
  ('ea1774bf-7ca4-40b8-8975-013ce0f84f6d', DATE '2026-08-01'),  -- leader Анастасия Бондаренко
  ('4d774d19-910c-419b-abb7-fe4e848ee2a1', DATE '2026-07-21'),  -- leader Валерия Трошнева
  ('1dafc14c-4d50-47b0-8d6f-5fc8c2568e28', DATE '2026-08-04'),  -- leader Екатерина Куропятникова
  ('82baf15e-1c10-4743-8705-0542f654812e', DATE '2026-07-24'),  -- leader Елена Аксенова
  ('3a61da26-8576-4ffe-b982-5c15442d2cd8', DATE '2026-05-14'),  -- leader Елена Мельникова
  ('fd3a3ab0-3e25-4034-9504-d2f55755b8f3', DATE '2026-08-06'),  -- leader Елена Соковнина
  ('a39c9031-93c5-40f6-83aa-356bb0d643b3', DATE '2026-07-23'),  -- leader Ирина Чиненова
  ('931f5b82-caa3-4427-a766-470199997d3b', DATE '2026-08-05'),  -- leader Марина Ладыженская
  ('0b2c96cc-9b2a-496a-b5b9-0c7ef87b151f', DATE '2026-08-06'),  -- leader Мария Бардина
  ('58b74756-1d4f-4b40-94af-63f8778f1d79', DATE '2026-07-09'),  -- leader Мария Романова (GREATEST оставит 08-08)
  ('308b6130-85ed-41d3-97db-7227bfac001f', DATE '2026-07-15'),  -- leader Оксана Витовская
  ('ffc69734-6ad6-4671-83fa-b23e5723a93f', DATE '2026-04-10'),  -- leader Ольга Бородина
  ('f8ba746a-0b33-40cf-ab28-a026fa031ecb', DATE '2026-06-12'),  -- leader Ольга Пограницкая
  ('e75cc467-1a55-4cfb-8337-4b48a55c4514', DATE '2026-07-29'),  -- leader Ольга Пономарева
  ('6cf385c3-5d4b-44dc-bcf1-6aa17d50bac7', DATE '2026-07-15'),  -- mentor Василина Лузина
  ('0e779c13-4cf8-48f7-9dd0-caa8da9a0d72', DATE '2026-08-02'),  -- mentor Елена Федотова
  ('628585ef-a6c2-4e1b-b4c6-bf49b5ecc839', DATE '2026-07-16');  -- mentor Наталья Гулякова

\echo === PRE: сколько реально изменится (comp > DB) ===
SELECT count(*) FILTER (WHERE p.paid_until IS NULL OR u.comp > p.paid_until::date) AS will_change
FROM _pu u JOIN public.profiles p USING (id);

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM _pu u LEFT JOIN public.profiles p USING (id)
   WHERE p.id IS NULL OR p.role NOT IN ('intern','leader','mentor');
  IF n <> 0 THEN RAISE EXCEPTION 'GUARD: % строк вне intern/leader/mentor или id нет', n; END IF;
END $$;

UPDATE public.profiles p
SET paid_until = GREATEST(p.paid_until, (u.comp + interval '1 day' - interval '1 second'))
FROM _pu u
WHERE p.id = u.id
  AND (p.paid_until IS NULL OR (u.comp + interval '1 day' - interval '1 second') > p.paid_until);

\echo === POST: активные с paid_until в прошлом (ожидание 0 — иначе reconkile запаузит) ===
SELECT p.name, p.role, p.access_status, p.paid_until
FROM _pu u JOIN public.profiles p USING (id)
WHERE p.access_status='active' AND p.paid_until < now();

\if :do_commit
  \echo '>>> COMMIT <<<'
  COMMIT;
\else
  \echo '>>> DRY-RUN: ROLLBACK <<<'
  ROLLBACK;
\endif
```

> `GREATEST` + `WHERE comp > paid_until` → идемпотентно, только вверх. `paid_until` трактуем концом дня.
> POST-проверка «активные в прошлом» должна дать **0** (2 таких — Шилова/Габрх — намеренно вне батча).

---

## Что нужно от тебя
1. **Абитуриенты:** по каждой из 4 — готова ли в стажёры (потеряет кнопку-вход в ПВЛ)? И нужен ли manual-аудит payment_orders (у них есть Prodamus-платёж).
2. **Массовый paid_until:** ок на 31-строчный GREATEST-апдейт?
3. **Шилова + Габрух:** exempt (бартер) или в массовый апдейт (истекли)?

**Оба блока — НЕ применял. Жду 🟢.**
