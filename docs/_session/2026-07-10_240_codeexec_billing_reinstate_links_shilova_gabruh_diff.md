# DIFF-on-review: боевые pay-to-reinstate ссылки — Шилова + Габрух (НЕ применять до 🟢)

**Дата:** 2026-07-10
**Автор:** codeexec (VS Code)
**Статус:** 🔴 на ревью. Ничего не применено. Прод-запись (INSERT) — только после твоего 🟢.
**Задача:** выдать двум законным должникам персональные **боевые** (не demo) ссылки на оплату «Лига — 1 месяц» / 2000 ₽, чтобы они оплатили и вернулись. `_param_order_id` + `_param_user_id` встроены → вебхук 1С матчит детерминированно.
**Связано:** финальный KICK-список из shadow #2 ([`_session/238`](2026-07-10_238_codeexec_phase3_shadow_final.md)) — ровно эти двое.

---

## 0. Recon (read-only, выполнен)
```
Шилова Мария | leader | maria.shilova@inbox.ru | 4a661537-b425-41b8-b69c-19abcef2c9d2 | paid_until 2026-05-05 | paused_expired/overdue
Юлия Габрух  | mentor | lyulya777@inbox.ru     | 492e5d3d-81c7-41d8-8cef-5a603e1389e6 | paid_until 2026-06-10 | paused_expired/overdue
```
Оба `paused_expired` — консистентно с pay-to-reinstate. Платящих в списке нет.

## 1. Почему НЕ через живой эндпоинт `/api/billing/checkout`
- Прод `BILLING_SANDBOX=1` (проверено в `/opt/push-server/.env`) → эндпоинт отдаёт ссылку с `demo_mode=1` (не списывает). Глобальный флаг **не трогаем** (твоё условие).
- Эндпоинт берёт `user_id` из JWT самого плательщика — сгенерить «за другого» им нельзя.
→ Поэтому: создаём заказ напрямую в БД (как это делает сам эндпоинт, server.mjs:771-773) и собираем URL руками через `buildProdamusUrl(..., sandbox:false)` — **боевой, без `demo_mode`**, глобальный sandbox остаётся `1`.

## 2. ШАГ A — INSERT заказов (прод, owner/gen_user). Применяю ПОСЛЕ 🟢.
Колонки — 1-в-1 как в живом checkout ([server.mjs:771-773](../../push-server/server.mjs)): `(user_id, plan_code, provider, amount, months, status)`. `id` (=order_id) генерит БД, забираем через `RETURNING`.

```sql
-- boevye_reinstate_orders.sql  (прогон: тот же ssh psql под gen_user)
INSERT INTO public.payment_orders (user_id, plan_code, provider, amount, months, status)
VALUES
  ('4a661537-b425-41b8-b69c-19abcef2c9d2', '1m', 'prodamus', 2000, 1, 'created'),  -- Шилова
  ('492e5d3d-81c7-41d8-8cef-5a603e1389e6', '1m', 'prodamus', 2000, 1, 'created')   -- Габрух
RETURNING id, user_id, plan_code, amount, months, status, created_at;
```
Валидность против схемы (phase45/46): `status='created'` ∈ CHECK; `provider='prodamus'` ∈ CHECK; `amount`=integer 2000 (=`billing_plans.amount_rub['1m']`); `months`=1; `plan_code` FK → `billing_plans('1m')` ✅. Ничего не удаляется/не апдейтится — только 2 новые строки.

## 3. ШАГ B — сборка боевых URL из вернувшихся UUID
Скрипт (`scratchpad/genurl.mjs`, использует прод-код `buildProdamusUrl`, `sandbox:false`):
```
node genurl.mjs <ORDER_UUID_ШИЛОВА> <ORDER_UUID_ГАБРУХ>
```
Форма URL (order_id = плейсхолдер до INSERT; реальный UUID подставится из RETURNING):

**Шилова Мария**
```
https://skrebeyko.payform.ru/?order_id=<UUID>&products[0][name]=Лига — 1 месяц
  &products[0][price]=2000&products[0][quantity]=1&customer_email=maria.shilova@inbox.ru
  &urlReturn=https://liga.skrebeyko.ru/?paid=1&urlSuccess=https://liga.skrebeyko.ru/?paid=1
  &_param_order_id=<UUID>&_param_user_id=4a661537-b425-41b8-b69c-19abcef2c9d2&_param_plan=1m&do=pay
```
**Юлия Габрух** — то же самое, `customer_email=lyulya777@inbox.ru`, `_param_user_id=492e5d3d-81c7-41d8-8cef-5a603e1389e6`.

(в реальной ссылке всё url-encoded; `demo_mode` **отсутствует** → боевое списание. Проверено: preview-прогон без `demo_mode`.)

## 4. Что произойдёт после оплаты (сквозная проверка контракта)
1. Человек платит на payform → Prodamus шлёт вебхук на push-server.
2. Хендлер читает `payload._param_order_id` → находит наш заказ ([server.mjs:480-491](../../push-server/server.mjs)).
3. `applyPlanPayment` берёт `months=1` из заказа → `paid_until = greatest(now, paid_until) + 1 мес`, `access_status=active` ([server.mjs:402-434](../../push-server/server.mjs)).
4. Заказ → `status='paid'`. Матч детерминированный, без fuzzy.

## 5. Риски и границы
- **Боевое списание 2000 ₽** с реального человека — необратимо (возврат только руками через Продамус). Ссылки одноразово-осмысленные: один заказ = один человек; если по ссылке заплатит не тот — деньги зачтутся Шиловой/Габрух (их user_id зашит).
- Глобальный `BILLING_SANDBOX=1` **не меняется** → остальной биллинг остаётся в песочнице. Боевое — только эти две ручные ссылки.
- Email в URL (для чека 54-ФЗ) — реальный, попадёт в пересылаемую ссылку. Ожидаемо.
- **Откат до оплаты:** если передумали — `UPDATE payment_orders SET status='expired' WHERE id IN (...)` (заказ повиснет, вебхук по нему всё равно сматчит если вдруг оплатят; чтобы совсем закрыть — не рассылать ссылку). После фактической оплаты откат — только возврат в кабинете Продамуса.

## 6. Порядок применения (после 🟢)
1. `ssh psql` → INSERT из §2 → фиксирую 2 UUID из `RETURNING`.
2. `node genurl.mjs <uuid1> <uuid2>` → 2 боевых URL.
3. Выдаю тебе обе ссылки (Шилова / Габрух) для пересылки.
4. Дописываю в этот файл фактические UUID + отметку «applied» (аудит).

**Жду 🟢. До него — ноль записей в прод.**

---

## ✅ APPLIED — 2026-07-10 (после 🟢 Оли)
- Проверка existing: у обоих **0** заказов в `payment_orders` → чистый INSERT (дублей нет).
- INSERT 0 2 (с `note`), `RETURNING`:
  ```
  Шилова → order_id c8b98bcb-ffd0-4c3b-8971-4dd8482d8558  (status=created)
  Габрух → order_id 8e74c68b-3500-4e3d-abf4-e78f8ce54e0a  (status=created)
  ```
- Боевые URL сгенерены `genurl.mjs` (`sandbox:false`, `demo_mode` отсутствует) и выданы Оле для пересылки.
- Глобальный `BILLING_SANDBOX=1` в проде не тронут (verified).
- Дальше: ждём оплаты → вебхук сматчит по `_param_order_id` → `paid_until += 1 мес`, `access_status=active`, заказ → `paid`. Проверить постфактум: `select status, paid_at from payment_orders where id in (...)`.
