# IMPL-DIFF — Фаза 3: товаро-гейт вебхука (Лига-only), diff-on-review (НЕ применять)

**Дата:** 2026-07-10 · **Автор:** codeexec · **Статус:** 🔴 код в рабочем дереве, НЕ задеплоен. Тесты 22/22 зелёные, `node --check` OK.
**Дизайн:** [`_session/249`](2026-07-10_249_codeexec_phase3_webhook_product_gate_recon.md) (🟢).

## Изменения (uncommitted)
| Файл | Что |
|---|---|
| `push-server/billingLogic.mjs` | + `isLigaProduct(payload)` (подстрока `/лига развивающих практиков/i` по `products[].name`) + `looksLikeLigaSum(payload)` (2000/5500/10000) |
| `push-server/server.mjs` | import + товаро-гейт в «диком» пути вебхука |
| `push-server/billingLogic.test.mjs` | +2 теста (все варианты Лига/не-Лига/корзина/пустой; Лига-суммы) |

## Логика гейта ([server.mjs](../../push-server/server.mjs), после план-пути 1c, перед `resolveCustomer`)
```js
const isGrant = eventName === 'payment_success' || eventName === 'auto_payment';
if (isGrant && !isLigaProduct(payload)) {
  const names = Array.isArray(payload.products) ? payload.products.map(p=>p?.name).filter(Boolean) : [];
  const base = names.length ? `SKIPPED_NON_LIGA_PRODUCT:${names.join('|')}` : 'SKIPPED_NON_LIGA_NO_PRODUCTS';
  const ligaSum = looksLikeLigaSum(payload);
  if (ligaSum) console.warn(`[prodamus] ⚠ SKIP grant с ЛИГА-СУММОЙ (проверить переименование товара): …`);
  else         console.info(`[prodamus] skip non-liga grant: ${base} …`);
  await markWebhookLogState(client, log.id, { processed:true, errorText:(ligaSum?'LIGA_SUM_NAME_MISMATCH ':'')+base });
  await client.query('commit');
  return res.json({ ok:true, processed:true, skipped:'non_liga_product', liga_sum:ligaSum });
}
```
- **Только grant-события** (`payment_success`/`auto_payment`). `finish`/`deactivation` (pause) — гейт не трогает.
- **План-путь 1c не затронут** — он возвращается выше (по `_param_order_id`/`plan_code`), до гейта.
- **Нет `products`** → трактуем как не-Лига → skip + лог `SKIPPED_NON_LIGA_NO_PRODUCTS`.
- **Заметный сигнал:** если сумма Лига-класса (2000/5500/10000), а имя не совпало → `console.warn` +
  `errorText='LIGA_SUM_NAME_MISMATCH …'` в `billing_webhook_logs` — ловит возможное ПЕРЕИМЕНОВАНИЕ Лига-товара.
- Скип помечает лог `is_processed=true` (учтён, но без гранта), отвечает 200 `{skipped:'non_liga_product'}`.

## Поведение
- Не-Лига платёж (12 месяцев, Неделя заботы, ПВЛ, книги…) → **paid_until/access НЕ выдаётся** (Старостина-класс закрыт).
- Лига платёж (в т.ч. recurring/TH) → как раньше (грант).
- Идемпотентность/подпись/advisory-lock — не тронуты (гейт стоит после них).

## Тесты
`node --test billingLogic.test.mjs` → **22/22 pass** (было 20 + 2 новых). Покрытие: 3 Лига-варианта, ci,
корзина с Лига-позицией, `12 месяцев`/`Неделя заботы`/`ПВЛ`, нет/пустой/битый `products`, Лига-суммы vs 750.

## Деплой (после 🟢 кода — отдельным шагом)
1. commit + rsync `billingLogic.mjs` + `server.mjs` (тест-файл rsync'ом исключается — `--exclude='*.test.mjs'`).
2. **restart push-server** (server.mjs изменён). Smoke: `/health` 200, prodamus вебхук отвечает; на след. не-Лига
   платеже — лог `skip non-liga grant`, `paid_until` не проставился.
3. Верификация на живом/replay: не-Лига payload → `{skipped:'non_liga_product'}`, Лига payload → грант как прежде.

## Не трогаю
- Историю не правлю (scan 248: 0 ложных грантов после Старостиной).
- BotHunter/pause-поток, план-путь 1c — без изменений.
- Ничего не деплою/не применяю.

**Код на ревью. Деплой (rsync+restart) — по твоему 🟢.**
