# СДЭК-вебхуки на push.skrebeyko.ru — выкачено

**Дата:** 2026-07-30
**Статус:** ✅ `cdek=on`, смоук пройден, адрес принимает.
**Бриф:** [2026-07-30_strategist_cdek_webhook.md](2026-07-30_strategist_cdek_webhook.md)
**Код:** ветка `feat/cdek-webhook-notifications`, коммит `03fc63f` — **в `main` не влит**, выкатывал прямо с ветки.

---

## Что сделано

**Тесты локально:** `node --test cdekWebhook.test.mjs cdekStore.test.mjs` → 28 pass, 0 fail.

**Перед выкладкой сверил изоляцию модуля:** в `cdekWebhook.mjs` и `cdekStore.mjs`
нет ни одного упоминания `pool` и `DATABASE_URL`. Врезка в `server.mjs` — ровно
три вещи: импорт, `app.post('/webhooks/cdek/:token', …)`, `startWatcher()`, плюс
`cdek=on/off` в стартовой строке. Маршруты `/webhooks/prodamus` и
`/webhooks/bothunter` не тронуты.

**Rsync** (сначала вхолостую, поехало ровно 5 файлов: `.env.example`,
`README.md`, `cdekStore.mjs`, `cdekWebhook.mjs`, `server.mjs`):

```
rsync -av --exclude=node_modules --exclude='*.test.mjs' --exclude='.env' \
  --exclude='package-lock.json' --exclude='cdek-orders.json' \
  push-server/ root@5.129.251.56:/opt/push-server/
```

`npm install` не делал — новых зависимостей нет.

**`.env`:** дописан блок из 12 ключей. Значения обязательных пяти взяты с Мака
(`~/.skrebeyko/.cdek`, `~/.skrebeyko/.cdek-webhook`,
`~/skrebeyko-inbox-bot/.env`), не из репозитория. Перед правкой снял бэкап —
`/opt/push-server/.env.bak-20260730`. Ни одно значение в переписку не попало:
блок собирался локально скриптом, проверка была по длине строки, на сервер ушёл
пайпом.

**Рестарт:** стартовая строка

```
Server started on :8787 (push=off, prodamus=on, bothunter=on, cdek=on,
checkout[sandbox=false, jwt=on, yk=off, prodamus=on(demo=false)], tg-access[live,autokick])
```

## Смоук

| Проверка | Результат |
|---|---|
| локально, чужой токен | `HTTP 404` |
| локально, настоящий токен | `{"status":"ok"}` |
| строка в журнале | `[cdek] событие smoke: SENT_TO_RECIPIENT_CITY` |
| Telegram | молчит — в записи `notifiedNew: false`, `waitingSince: null` |
| снаружи, чужой токен | `HTTP 404` |
| `https://push.skrebeyko.ru/health` | `HTTP 200` |

Caddy не трогал — `push.skrebeyko.ru` уже проксирует на `:8787`.

## Три расхождения с брифом

**1. Права на `.env` были 644, а не 600.** Бриф говорит «как сейчас», но
фактически файл был читаем всем. Привёл к `600` и `.env`, и бэкап.

**2. Запись `smoke` вышла незакрытой.** Бриф предполагал, что её можно оставить
и она вычистится через 90 дней. Но `SENT_TO_RECIPIENT_CITY` не входит в
`CDEK_CLOSED_STATUSES`, запись легла с `closed: false`, а `prune` в
[cdekStore.mjs:51](../../push-server/cdekStore.mjs#L51) удаляет **только**
закрытые: `if (order.closed && stamp && stamp < edge)`. То есть фальшивый заказ
жил бы в реестре вечно. Удалил запись, реестр сейчас `{}`, права `600`.

**3. Сканер незабранных не делает прохода на старте.** В
[cdekWebhook.mjs:361](../../push-server/cdekWebhook.mjs#L361) `startWatcher` —
только `setInterval`, без первого немедленного вызова. Значит после каждого
рестарта первая проверка незабранных посылок будет через `CDEK_SCAN_MINUTES`,
сейчас через час. Для суточного порога это несущественно, поведение штатное —
просто чтобы знать, а не удивляться тишине в первый час.

## Чего не делал

- Ключ интеграции в ЛК СДЭК не создавал.
- Telegram-webhook не ставил, код бота в Apps Script не трогал.
- Таблицу под заказы не заводил — реестр файловый, `/opt/push-server/cdek-orders.json`.
- Подписку на вебхук в СДЭК не оформлял — за стратегом.
- Ветку в `main` не вливал.

## Что осталось решить

**Ветка нигде, кроме Мака и прода.** `feat/cdek-webhook-notifications` — только
локальная, на GitHub её нет: `origin/feat/cdek-webhook-notifications` не
существует. Прод сейчас работает на коде, у которого нет удалённой копии.
Стоит влить в `main` и запушить.

Одна оговорка про слияние: `push-server/**` не входит в `paths-ignore` в
`deploy.yml`, поэтому пуш в `main` заодно запустит выкладку фронта на
`liga.skrebeyko.ru`. Само по себе безопасно, но открытые вкладки после неё могут
получить `ChunkLoadError` — как 28 июля.
