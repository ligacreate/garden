# RECON — корневой фикс вебхука: дискриминация товара (read-only)

**Дата:** 2026-07-10 · **Автор:** codeexec · **Тип:** read-only recon. Кода не менял.

## Корень
`/webhooks/prodamus` ([server.mjs:445](../../push-server/server.mjs)) имеет два пути выдачи доступа:
- **План-путь (Фаза 1c, безопасен):** есть `_param_order_id` → `applyPlanPayment` по `billing_plans.plan_code`.
  Товаро-безопасен by design. Но в выгрузке таких платежей **всего 3 из 51**.
- **«Дикий»/fuzzy-путь (дыра):** нет `_param_order_id` → `resolveCustomer`(email/phone) → `findProfileByCustomer`
  → `extractPaidUntil` → `applyAccessState` ([server.mjs:502-519](../../push-server/server.mjs)).
  **Товар НЕ проверяется вообще** — `billingLogic.mjs` и `server.mjs` нигде не читают `products`.
  → любой Prodamus-платёж (≈48 из 51, в т.ч. recurring/TargetHunter) выдаёт Лига-`paid_until`, что бы ни купили.

Именно так «12 месяцев» (750₽) Старостиной выдал ей Лига-доступ.

## Где в payload лежит товар (доказано на живых данных)
Топ-ключи prodamus-пейлоадов включают **`products`** (у всех 51). Структура (пример — payload Старостиной):
```json
"products": [ { "name": "12 месяцев", "price": "750.00", "quantity": "1", "sum": "750.00" } ]
```
Также в payload: `sys` (источник, напр. TargetHunter — у 38), `tg_user_id` (37), `payment_status`, `sum`.
**Дискриминатор — `products[*].name`.**

## Как отличить Лига от не-Лига
Лига-товары (все варианты содержат подстроку «Лига развивающих практиков»):
- «Лига развивающих практиков»
- «Лига развивающих практиков Skrebeyko, 30 дней»
- «Лига развивающих практиков Skrebeyko, пропущенные 30 дней»
Не-Лига: «12 месяцев», «Неделя заботы о себе», «Пиши, веди, люби» (ПВЛ), книги/блокноты, Орбита, Серендипность,
«Мышление 10х», «12 встреч у костра» — **ни один не содержит «Лига развивающих практиков»**.

→ Надёжное правило: **`isLigaProduct = payload.products.some(p => /лига развивающих практиков/i.test(p.name))`**.
Подстрока покрывает все 3 варианта; корзина с несколькими товарами → грант, если ЕСТЬ Лига-позиция.

## Предлагаемый фикс (эскиз — импл-диффом отдельно, НЕ сейчас)
В «диком» пути, для событий выдачи (`payment_success`/`auto_payment`), перед `applyAccessState`:
```js
// billingLogic.mjs
export const isLigaProduct = (payload = {}) =>
  Array.isArray(payload.products) &&
  payload.products.some(p => /лига развивающих практиков/i.test(String(p?.name || '')));

// server.mjs, ветка без _param_order_id, только для grant-событий:
const isGrant = eventName === 'payment_success' || eventName === 'auto_payment';
if (isGrant && !isLigaProduct(payload)) {
  await markWebhookLogState(client, log.id, { processed: true, errorText: 'SKIPPED_NON_LIGA_PRODUCT' });
  await client.query('commit');
  return res.json({ ok: true, processed: true, skipped: 'non_liga_product' });
}
```
- Плановый путь (1c) не трогаем — он уже по plan_code.
- Pause-события (`finish`/`deactivation`) не трогаем (они не про товар).
- Защита: нет `products` → трактуем как НЕ Лига (skip grant) — все реальные payload'ы содержат `products`, риск ложного отказа мал; альтернативно логировать `NON_LIGA_NO_PRODUCTS` для ручного разбора.

## Что это даёт / не трогает
- **Предотвращает будущие ложные гранты** (Старостина-класс) — не-Лига покупки перестанут открывать Лигу.
- **Историю не правит** — разовый scan ([_session/248](2026-07-10_248_codeexec_phase3_false_grants_scan.md)) показал: после отката Старостиной ложных грантов 0, бэкфилл не нужен.
- Требует: импл-дифф (billingLogic + server.mjs) + юнит-тест `isLigaProduct` (в billingLogic.test.mjs) + деплой с рестартом. Отдельным шагом по твоему 🟢.

## Открытый вопрос
Порог по товару делаем именно по имени (подстрока «Лига развивающих практиков»)? Или хочешь белый список точных
имён в конфиге/`billing_plans` (гибче, но надо поддерживать)? Рекомендую подстроку — проще и покрывает все варианты.
