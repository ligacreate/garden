# Заморозка подписки — Рухшана (Лига, выгорание) — DIFF на ревью

**Дата:** 2026-07-26
**Автор:** codeexec
**Статус:** ✅ ПРИМЕНЕНО 2026-07-26 (🟢 от Оли). См. раздел 5 «ФАКТ ЗАМОРОЗКИ».
**Возврат:** отдельной задачей на **2026-09-28** (НЕ сейчас)

---

## 1. RECON (read-only, выполнен) — ровно ОДНО совпадение

`SELECT ... FROM public.profiles WHERE name ILIKE 'рухшан%'` → 1 строка.

| поле | значение |
|---|---|
| id | `401ad7f9-8fa0-4df0-8425-ce30efb74097` |
| name | Рухшана |
| **email** | **`ruxshana_89@mail.ru`** ← сверить с Олей |
| role | `intern` (роль Лиги) |
| access_status | `active` |
| subscription_status | `active` |
| **paid_until (СНАПШОТ)** | **`2026-08-11 23:31:10.393+03`** — НЕ трогаем |
| auto_pause_exempt | `false` |
| telegram | `https://t.me/g_rush` |
| telegram_user_id | `547101166` |
| **запас дней (ИТОГОВЫЙ, для возврата)** | **21** = `2026-08-11 − 2026-07-21 (день обращения)` — см. раздел 5 |
| _(сырое DB-чтение days_left на 26.07)_ | _16 — не итог; отсчёт от даты действия, а не обращения_ |

Платёж: `payment_orders` по user_id — 0 строк (нет ручных/plan-ордеров).
`subscriptions` (id=8, provider=prodamus, status=active):
**last_payment_at = `2026-07-11 23:31:10+03`**, paid_until = `2026-08-11` (=+31д), created_at = `2026-06-02`.
→ последний платёж **11.07.2026** через Prodamus (месячная рекуррентка). «~неделю назад» у Оли = 15 дней назад, но совпадение единственное и однозначное.

**Снапшот для возврата (28.09):** запас = **21 день** = `paid_until::date 2026-08-11 − 2026-07-21 (день обращения Рухшаны)`. Считаем от обращения, а не от даты действия (26.07): 5-дневная задержка на нашей стороне — не сгружаем на человека. Источник paid_until — `profiles.paid_until` (= `subscriptions.paid_until`).

---

## 2. ЧТО ПРИМЕНЮ ПОСЛЕ 🟢

### 2a. БД — одна транзакция (paid_until НЕ меняем)

```sql
BEGIN;
UPDATE public.profiles
   SET access_status     = 'paused_manual',
       auto_pause_exempt = true
 WHERE id = '401ad7f9-8fa0-4df0-8425-ce30efb74097'
   AND access_status = 'active';   -- guard от двойного применения/дрейфа
-- ожидаю: UPDATE 1, paid_until без изменений
COMMIT;
```
Проверено по коду, что оба флага защищают её от авто-джобов:
- `reminders.mjs` — исключает `auto_pause_exempt=true` И `access_status='paused_manual'` (напоминалки 1f не придут).
- `tgAccessReconcile.mjs` — `skip_exempt` + `skip_manual` (ночной кик/admit её не трогает).
- `kickRecheck` в `tgAccessActions.mjs` — `became_exempt` / `became_paused_manual` → skip.

### 2b. Telegram — ручной kick (ban+unban), оба ресурса

user_id `547101166`; kick = `banChatMember` → `unbanChatMember(only_if_banned=true)` — уходит, но НЕ в чёрный список → сможет вернуться по новой ссылке в сентябре.
- канал Лиги `-1002377682177`
- чат Лиги `-1002432957741`

Бот `@ligagardenbot` (`TG_ACCESS_BOT_TOKEN`), запуск с прод-VM (`curl -4`, IPv4 обязателен).
Идём **напрямую**, НЕ через `executeActions`: там `kickRecheck` теперь её пропустит (paused_manual+exempt). Журнал `tg_access_actions` не трогаю — фиксирую в session-doc.

---

## 3. Prodamus — уточнено (исходный флаг снят)

Первичный флаг был: «рекуррентка активна → спишет ~11.08». Это оказалось **предположением** из каденции (last_payment 11.07 + paid_until 11.08 = +31д), а НЕ фактом из БД.
**Живость рекуррентки в нашей БД не хранится** — только в Prodamus. `subscriptions.status='active'` = отражение последнего обработанного вебхука, не признак будущего списания; `provider_subscription_id` у неё = заглушка (её же profile-id), настоящего Prodamus-id нет.
Оля подтвердила, что **останавливала все рекуррентные подписки** — БД это не опровергает. Из БД ничего по Prodamus не трогали, заморозка от списания не зависит.

---

## 4. ВОЗВРАТ — задача на 2026-09-28 (НЕ делать сейчас)

`access_status='active'`, `auto_pause_exempt=false`,
`paid_until = дата_возврата + 21 день`, новая именная ссылка в канал и чат.
Снапшот (21 день, отсчёт от обращения 21.07 / paid_until 2026-08-11) — из этого дока.

---

## 5. ФАКТ ЗАМОРОЗКИ (для задачи возврата 28.09)

- **Кто:** Рухшана — `id 401ad7f9-8fa0-4df0-8425-ce30efb74097`, email `ruxshana_89@mail.ru`, role `intern`, telegram `@g_rush` / user_id `547101166`.
- **Когда заморожена:** 2026-07-26 (current_date БД).
- **День обращения Рухшаны:** 2026-07-21 (от него считаем запас).
- **Запас дней (СНАПШОТ, ИТОГОВЫЙ):** **21**.
- **Снапшот paid_until:** `2026-08-11 23:31:10.393+03` (не менялся).
- **Откуда считали:** `paid_until::date (2026-08-11) − день обращения (2026-07-21) = 21`. Считаем от обращения, а НЕ от даты действия (26.07): 5-дневная задержка на нашей стороне не сгружается на человека. Источник paid_until — `profiles.paid_until` (= `subscriptions.paid_until`, id=8, last_payment 2026-07-11). _(Сырое DB-чтение days_left на 26.07 = 16 — не итог.)_

**Результат применения (одна SSH-сессия):**
- БД: `UPDATE 1` → `access_status='paused_manual'`, `auto_pause_exempt=t`, `paid_until` без изменений. ✓
- TG **канал** `-1002377682177`: pre `member` → ban `ok:true` → unban `ok:true`. ✓ (post-getChatMember вернул пустой ответ — транзиентный блип на read; мутации подтверждены `ok:true`).
- TG **чат** `-1002432957741`: pre `member` → ban `ok:true` → unban `ok:true` → post `left`. ✓
- Prodamus: живость рекуррентки в нашей БД НЕ хранится (только в Prodamus). `subscriptions.status='active'` = отражение последнего вебхука, не факт будущего списания. Оля подтвердила, что останавливала все рекуррентки. Из БД не трогали.

**ВОЗВРАТ 28.09:** `paid_until = 2026-09-28 + 21 день = 2026-10-19` (пересчитать от фактической даты возврата), `access_status='active'`, `auto_pause_exempt=false`, новые именные ссылки в канал и чат.
