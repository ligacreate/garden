# DIFF на ревью — Пакет сверки Лиги (WRITES 1+2) + READS 3,4

**Дата:** 2026-07-09
**Автор:** codeexec
**Основание:** 🟢 Ольги на пакет по отчёту 215. Тарифы: 2000=1мес(30д), 5500=3мес(90д), 10000=6мес(180д).
**Статус:** DIFF — НЕ применено. Применяю только после 🟢 на этот файл.
**Гардрейл:** enforcement таргетит только Лигу (leader/mentor/intern); applicant/admin не паузим. Канал/чат не трогаем.

---

## ⚠️ ДВА РЕШЕНИЯ ДО ПРИМЕНЕНИЯ (backfill)

Из 8 бэкфилл-плательщиков **6 встают в будущее** (доступ ок), а **2 оплачены «в прошлое»** — если проставить их реальный `paid_until`, ночной reconcile тут же переведёт их в `paused_expired` (как Шилова):

| Кто | Посл. платёж | paid_until | Итог |
|---|---|---|---|
| Юлия Габрух (mentor) | 10.05 | **09.06.2026** | ⚠ истёк ~месяц → авто-пауза |
| Мария Романова (leader) | 09.06 | **09.07.2026 (сегодня)** | ⚠ граница → авто-пауза сегодня-завтра |

**Вопрос:** по этим двоим — (A) проставить реальную прошлую дату (примут статус «истёк», доступ снимется — честно, но они в чате Лиги), или (B) пропустить бэкфилл (оставить `paid_until=NULL`, доступ не трогаем, ждём их следующей оплаты)? **Рекомендую (B)** — они в ростере, резкая авто-пауза без предупреждения нежелательна; когда доплатят — webhook/бэкфилл проставит корректно. Ниже в DIFF 1 они вынесены отдельным блоком и **по умолчанию закомментированы**.

---

## DIFF 1 — Backfill `paid_until` (список A, 8 плательщиков)

Идемпотентно: `WHERE ... AND paid_until IS NULL`. Матч по email.

### 1a. 6 актуальных (встают в будущее — доступ остаётся active) — ПРИМЕНЯЕМ
```sql
-- Разжигаева Ольга (applicant*, посл.платёж 08.07 +30д)  *роль курсовая, но платит Лигу — backfill безвреден
update public.profiles set paid_until = '2026-08-07 23:59:59+03', last_payment_at = coalesce(last_payment_at,'2026-07-08')
 where lower(email)='razzhigvzhik@mail.ru' and paid_until is null;
-- Гулякова Наталья (mentor, 16.06 +30д)
update public.profiles set paid_until = '2026-07-16 23:59:59+03', last_payment_at = coalesce(last_payment_at,'2026-06-16')
 where lower(email)='natalisuro2014@gmail.com' and paid_until is null;
-- Бочкарёва Мария (intern, 27.06 +30д)
update public.profiles set paid_until = '2026-07-27 23:59:59+03', last_payment_at = coalesce(last_payment_at,'2026-06-27')
 where lower(email)='marira811@gmail.com' and paid_until is null;
-- Кулиш Инна (intern, 16.06 +30д)
update public.profiles set paid_until = '2026-07-16 23:59:59+03', last_payment_at = coalesce(last_payment_at,'2026-06-16')
 where lower(email)='kulish-inn@yandex.ru' and paid_until is null;
-- Ярощук Екатерина (intern, 13.06 +30д)
update public.profiles set paid_until = '2026-07-13 23:59:59+03', last_payment_at = coalesce(last_payment_at,'2026-06-13')
 where lower(email)='e.yaroschuk@gmail.com' and paid_until is null;
-- Трошнева Валерия (leader, 21.06 +30д)
update public.profiles set paid_until = '2026-07-21 23:59:59+03', last_payment_at = coalesce(last_payment_at,'2026-06-21')
 where lower(email)='klishevich-lera@mail.ru' and paid_until is null;
```
> Примечание: Гулякова/Кулиш (16.07), Ярощук (13.07), Трошнева (21.07) — уже близко к истечению; после бэкфилла reconcile их **не** тронет (дата в будущем), но им скоро продлеваться.

### 1b. 2 «в прошлое» — ПО РЕШЕНИЮ (по умолчанию НЕ применяем, вариант B)
```sql
-- Юлия Габрух (mentor, 10.05 +30д → 09.06 ИСТЁК)
-- update public.profiles set paid_until = '2026-06-09 23:59:59+03', last_payment_at = coalesce(last_payment_at,'2026-05-10')
--  where lower(email)='lyulya777@inbox.ru' and paid_until is null;
-- Мария Романова (leader, 09.06 +30д → 09.07 граница)
-- update public.profiles set paid_until = '2026-07-09 23:59:59+03', last_payment_at = coalesce(last_payment_at,'2026-06-09')
--  where lower(email)='masha152@yahoo.com' and paid_until is null;
```

---

## DIFF 2 — Снять доступ «вышли из Лиги» (список D, 9 чел)

**Находка из снимка:** 6 из 9 уже `status='suspended'`, но `access_status` завис на `'active'` (рассинхрон из FEAT-015 — старый UI писал только `status`). Мой апдейт **досинхронивает** `access_status`. Двое уже полностью на паузе (no-op). Один активен (тестовый).

**Заметки-поля в profiles нет** → пометку «вышел из Лиги» пишу аудит-строкой в `billing_webhook_logs` (как ночной reconcile). Обратимо.

Гардрейл в каждом апдейте: `role in ('leader','mentor','intern')`, `access_status <> 'paused_manual'` (идемпотентно).

```sql
-- 2a. 6 «вышли» (status уже suspended, досинхрон access_status → paused_manual)
--     Минаева, Колотилова (mentor); Odeta, Колкова, Мельникова, Абдурахманова (leader)
update public.profiles
   set access_status='paused_manual', status='suspended'
 where lower(email) in (
   'happy7anny@gmail.com','kolotilovasvetlana@gmail.com',
   'odeta.post@gmail.com','vek129@rambler.ru','sharm_anele@bk.ru','jylia.psycholog@gmail.com'
 ) and role in ('leader','mentor','intern') and access_status <> 'paused_manual';

-- 2b. Настин фиксик (mentor, active+active) — деактивация (выглядит тестовым: telegram='zobyshka@gmail.com')
update public.profiles
   set access_status='paused_manual', status='suspended'
 where lower(email)='zobyshka@gmail.com' and role in ('leader','mentor','intern') and access_status <> 'paused_manual';

-- 2c. АУДИТ-пометка «вышел/вышла из Лиги» (обратимо, для истории)
insert into public.billing_webhook_logs(provider, event_name, external_id, payload_json, signature_valid, is_processed)
select 'manual', 'left_liga_manual',
       'left_liga:'||id::text||':2026-07-09',
       jsonb_build_object('reason','вышел/вышла из Лиги','actor','Olga','source','recon_215','role',role),
       true, true
  from public.profiles
 where lower(email) in (
   'happy7anny@gmail.com','kolotilovasvetlana@gmail.com','odeta.post@gmail.com',
   'vek129@rambler.ru','sharm_anele@bk.ru','jylia.psycholog@gmail.com','zobyshka@gmail.com'
 )
on conflict (provider, external_id) where external_id is not null do nothing;
```

**Уже на паузе, НЕ трогаю (no-op):** Ольга Бородина (leader, suspended+paused_manual), Анастасия Ван (intern, suspended+paused_manual). Аудит-строку для них добавлю тем же INSERT-ом при желании — скажи.

**Откат (если что):** `update profiles set access_status='active', status='active' where lower(email) in (...);` (вернёт доступ; учти — 6 из них были `suspended` ещё до нас).

---

## READ 3 — платежи Власовой / Бартосевич / Тютюнник (проверка «повисло»)

- **Юля Власова (ростер #30):** в выгрузке есть **«Власова Елена»** (lena0274@yandex.ru): 2 платежа 15.03 и **14.04** (посл.), 2000₽ Лига → до 14.05 → **истёк**. ⚠ **Имя не совпадает: ростер = Юля, платёж = Елена.** Либо это разные люди, либо ник/имя расходятся. Профиля в БД нет. **Нужна сверка Ольгой:** Юля Власова и Елена Власова (lena0274@) — один человек?
- **Диана Бартосевич:** платежей НЕТ (ни по имени, ни вариантам). Профиля нет.
- **Ольга Тютюнник:** платежей НЕТ (подтверждено на 01.03–08.07). Профиля нет.

→ Бартосевич и Тютюнник — без следа оплаты за март–июль. Решение по каналу за Ольгой.

## READ 4 — 6 «платят, но не в чате»: почему?

| Кто | роль | Посл. платёж | Оплачено до | Статус | TG в профиле |
|---|---|---|---|---|---|
| Александра Титова | applicant | 08.07 | 07.08 | ✅ актуальна | @aleksandra_v_titova |
| Елена Соковнина | leader | 06.07 | 05.08 | ✅ актуальна | @Lena_leto18 |
| Наталья Ильиных | intern | 02.06 | 02.07 | ⚠ истёк | @writerinata_life |
| Ярослава Шайтанова | intern | 20.05 | 19.06 | ⚠ истёк | @psychologicalyaroslava |
| Наталья Баженова | intern | 13.05 | 12.06 | ⚠ истёк | @Nataly300570 |
| Светлана Исламова | intern | 02.05 | 01.06 | ⚠ истёк | @SwetlanaIslamova |

**Ответ по данным:** «не в чате» распадается на два случая:
- **2 актуальны (Титова, Соковнина)** — платят прямо сейчас, но в ростере их нет → скорее всего **не позвали / не добавили в чат** (у обеих TG привязан, находятся легко). Приоритет: **пригласить**.
- **4 истекли (Ильиных, Шайтанова, Баженова, Исламова)** — перестали платить в мае–начале июня → «не в чате» логично (отвалились/не продлили). Это список C-хвост, не enforcement сейчас.

Точную причину «не позвали vs сам не вступил» подтвердит только ростер бота; по оплате картина выше однозначна.

---

## Что применяю по 🟢
- **DIFF 1a** (6 backfill) — да.
- **DIFF 1b** (Габрух, Романова) — по твоему решению A/B (рекоменд. B — не трогать).
- **DIFF 2** (6 досинхрон + Настин фиксик + аудит) — да.
- Порядок применения: один транзакционный `.sql` через прод-psql, затем verify-SELECT (покажу результат). READS уже готовы, изменений не вносят.

---

## ✅ РЕШЕНИЯ ОЛЬГИ (2026-07-09) + ФИНАЛ DIFF

- **Романова** — оплатила сегодня 09.07 → backfill `paid_until = 2026-08-08` (09.07 + 30д). Заменяет закомментированный блок 1b.
- **Габрух** — ждём её оплаты «на днях» → НЕ трогаем (`paid_until` остаётся NULL). 1b по ней снят.
- **Юля Власова** — команда. Профиля в БД нет → изменений в БД нет; в сверке помечена «команда» (и «Власова Елена» lena0274@ — не отвал).
- **Бартосевич** — Ольга исключит вручную из канала завтра → без действий codeexec.
- **Тютюнник** — hold, без действий.

### Финальный блок 1b (Романова, вместо закомментированного — ПРИМЕНЯЕМ):
```sql
-- Мария Романова (leader) — оплата сегодня 09.07 (со слов Ольги; в выгрузке ещё нет), план 1 мес
update public.profiles
   set paid_until = '2026-08-08 23:59:59+03', last_payment_at = coalesce(last_payment_at,'2026-07-09')
 where lower(email)='masha152@yahoo.com' and paid_until is null;
```
> Если Романова оплатила 3/6 мес (не 2000₽) — скажи, поправлю дату.

**Итог к применению по 🟢:** DIFF 1a (6) + финальный 1b (Романова) = **7 backfill**; DIFF 2 (6 досинхрон + Настин фиксик + аудит-строки 7 чел). Габрух — пропущена.
