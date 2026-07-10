# DEPLOY — Фаза 3: товаро-гейт вебхука (`isLigaProduct`) ЗАДЕПЛОЕН

**Дата:** 2026-07-10 · **Автор:** codeexec · **Статус:** 🟢 задеплоен на прод, smoke зелёный.
**Код:** коммит `6111818` (approved [`_session/250`](2026-07-10_250_codeexec_phase3_webhook_product_gate_impl.md), тесты 22/22).
**Закрывает:** ⚠-хвост из [`_session/252 handover`](2026-07-10_252_handover.md) — прод-вебхук был товаро-слепым (класс Старостиной).

## Что сделано
1. **Recon (read-only):** прод подтверждён товаро-СЛЕПЫМ до деплоя — `grep -c isLigaProduct` = 0 в
   `/opt/push-server/billingLogic.mjs` и 0 `ТОВАРО-ГЕЙТ` в `server.mjs`. Сервис `active`, health 200.
2. **Локально перед деплоем:** `node --check` billingLogic+server OK; `node --test billingLogic.test.mjs` → **22/22**.
3. **Rsync** `push-server/` → `root@5.129.251.56:/opt/push-server/` (excludes: `node_modules`, `*.test.mjs`,
   `.env`, `package-lock.json`). Передано ровно `billingLogic.mjs` + `server.mjs`.
4. **Restart** `push-server.service` → `active`. Стартап-лог: `prodamus=on … tg-access[admit]`, поллер стартанул чисто.

## Верификация
- Прод ПОСЛЕ деплоя: `isLigaProduct` = 1 (billingLogic), `ТОВАРО-ГЕЙТ` = 1 (server) — гейт загружен.
- Health: 200 локально (`:8787/health`) + внешне (`https://push.skrebeyko.ru/health`).
- Разовый `[join-poller] loop error fetch failed` в логе — ДО рестарта, транзиентный, после рестарта ушёл.

## Что НЕ делал (осознанно)
- **Живой replay не гонял:** не подделываю подписанный не-Лига вебхук на боевой биллинг (риск мутации).
  Гейт подтвердится на первом реальном не-Лига платеже. Логика исчерпывающе покрыта юнит-тестами.

## Как убедиться на живом трафике
Первый не-Лига grant (12 месяцев / Неделя заботы / ПВЛ / книги…) должен:
- получить ответ `{ ok:true, processed:true, skipped:'non_liga_product', liga_sum:<bool> }`;
- пометить `billing_webhook_logs.error_text` = `SKIPPED_NON_LIGA_PRODUCT:<имена>` (или
  `SKIPPED_NON_LIGA_NO_PRODUCTS`; при Лига-СУММЕ без совпадения имени — префикс `LIGA_SUM_NAME_MISMATCH`);
- **НЕ** проставить `paid_until`.
Проверка:
```sql
SELECT created_at, event_name, is_processed, error_text
FROM billing_webhook_logs
WHERE error_text LIKE 'SKIPPED_NON_LIGA%' OR error_text LIKE 'LIGA_SUM_NAME_MISMATCH%'
ORDER BY created_at DESC LIMIT 20;
```
Сигнал переименования Лига-товара — искать `LIGA_SUM_NAME_MISMATCH` (Лига-сумма 2000/5500/10000, имя не совпало).

## Состояние после сессии
- Прод-вебхук товаро-зрячий: Лига-`paid_until` выдаётся ТОЛЬКО за Лига-товар. Класс Старостиной закрыт на источнике.
- Рабочее дерево по push-server чистое (файлы уже в `6111818`, HEAD `ec14a1c`).
- Следующие треки без изменений (см. 252): KICK Шиловой (gated), доставка join-ссылок, кнопки «Вступить».
