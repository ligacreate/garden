# 2026-07-30 — стратег → codeexec: вебхуки СДЭК на push-server

**Задача:** выкатить на `push.skrebeyko.ru` приёмник вебхуков СДЭК. Ольге в
Telegram должны приходить два уведомления: новый заказ и посылка, которую не
забирают дольше суток.

Код написан и покрыт тестами, деплой — за тобой. План в vault-е стратегии:
`plans/2026-07-20-сдэк-вебхуки-уведомления.md`.

---

## Что уже в репозитории

| Файл | Что это |
|---|---|
| `push-server/cdekWebhook.mjs` | вся логика: разбор события, два сообщения, сканер незабранных |
| `push-server/cdekStore.mjs` | реестр заказов в JSON-файле (атомарная запись, права 600) |
| `push-server/cdekWebhook.test.mjs` | 22 теста |
| `push-server/cdekStore.test.mjs` | 6 тестов |
| `push-server/server.mjs` | +import, +`app.post('/webhooks/cdek/:token', …)`, +`startWatcher()`, +`cdek=on/off` в стартовом логе |
| `push-server/.env.example` | блок настроек СДЭК |
| `push-server/README.md` | раздел «Вебхуки СДЭК» |
| `.gitignore` | `push-server/cdek-orders.json` |

Проверить локально: `cd push-server && node --test cdekWebhook.test.mjs cdekStore.test.mjs` → 28 passing.

**Базы Garden модуль не касается.** Ни одного запроса к `pool`. При пустом
`CDEK_WEBHOOK_TOKEN` спит целиком: эндпоинт отвечает 200 и ничего не делает.
Это и есть страховка — выкатывай код первым, включай вторым.

---

## Что сделать на сервере

### 1. Выкатить код

Обычным путём: rsync `push-server/` → `/opt/push-server/` (без `node_modules`
и `*.test.mjs`), новых зависимостей нет — `npm install` не нужен.

### 2. Дописать `/opt/push-server/.env`

Значения бери **не отсюда** (файл лежит в git), а с Макбука Ольги:

- `CDEK_CLIENT_ID`, `CDEK_CLIENT_SECRET` → из `~/.skrebeyko/.cdek`
  (поля `client_id`, `client_secret`).
  ⚠️ Ключ общий с Тильдой. **Новый ключ в ЛК СДЭК не создавать** — это
  деактивирует старый и сломает магазин.
- `CDEK_NOTIFY_BOT_TOKEN`, `CDEK_NOTIFY_CHAT_ID` → из
  `~/skrebeyko-inbox-bot/.env` (`TELEGRAM_BOT_TOKEN`, `ALLOWED_USER_ID`).
  ⚠️ Бот `@olalaskbot` живёт в Google Apps Script на **поллинге**. Мы только
  шлём `sendMessage` его токеном — с поллингом это не конфликтует.
  Telegram-webhook не ставить, код бота не трогать.
- `CDEK_WEBHOOK_TOKEN` → из `~/.skrebeyko/.cdek-webhook`, поле `webhook_token`.

Остальное — как в `.env.example`:

```
CDEK_API_BASE=https://api.cdek.ru/v2
CDEK_NOTIFY_STATUSES=CREATED
CDEK_WAITING_STATUSES=ACCEPTED_AT_PICK_UP_POINT,POSTOMAT_POSTED
CDEK_CLOSED_STATUSES=DELIVERED,POSTOMAT_RECEIVED,NOT_DELIVERED,RETURNED_TO_SENDER_CITY_WAREHOUSE,RETURNED_TO_SENDER,REMOVED,INVALID
CDEK_WAITING_HOURS=24
CDEK_SCAN_MINUTES=60
CDEK_STORE_PATH=/opt/push-server/cdek-orders.json
```

Права на `.env` — 600, как сейчас.

### 3. Перезапустить и проверить

```bash
systemctl restart push-server
journalctl -u push-server -n 20 --no-pager
```

В стартовой строке должно появиться `cdek=on`. Если `cdek=off` — какой-то из
пяти обязательных ключей пуст.

Локальный smoke (токен подставь настоящий):

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:8787/webhooks/cdek/ЧУЖОЙ-ТОКЕН   # ждём 404
curl -s -X POST localhost:8787/webhooks/cdek/НАСТОЯЩИЙ-ТОКЕН -H 'content-type: application/json' -d '{"type":"ORDER_STATUS","uuid":"smoke","attributes":{"status_code":"SENT_TO_RECIPIENT_CITY","cdek_number":"smoke"}}'
```

Второй запрос должен вернуть `{"status":"ok"}`, в логе — строку
`[cdek] событие smoke: SENT_TO_RECIPIENT_CITY`, и **никакого сообщения в
Telegram** (движение посылки не уведомляем). После смоука удали запись
`smoke` из `/opt/push-server/cdek-orders.json` — или оставь, она закрытая и
вычистится сама через 90 дней.

### 4. Caddy

Отдельный блок не нужен: `push.skrebeyko.ru` уже проксирует на `:8787`,
маршрут внутри того же сервиса. Проверь только, что снаружи живо:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://push.skrebeyko.ru/webhooks/cdek/чужой
```

Ждём 404 (значит, до сервиса дошло и токен отвергнут).

### 5. Отписаться в чат

Как обычно, коротко: `cdek=on`, смоук прошёл, адрес принимает. Подписку на
вебхук в СДЭК оформит стратег — руками из ЛК/через API её трогать не надо.

---

## Чего НЕ делать

- Не создавать новый ключ интеграции в ЛК СДЭК (сломается Тильда).
- Не ставить Telegram-webhook и не править код бота в Apps Script.
- Не заводить таблицу под заказы: реестр намеренно файловый, вне базы Garden.
- Не менять существующие маршруты `/webhooks/prodamus` и `/webhooks/bothunter`.

---

## Известные шероховатости — на будущее, не блокеры

**Словарь статусов не проверен на живых данных.** Все двенадцать предзаказов
издательства на 30.07 стоят на `RECEIVED_AT_SHIPMENT_WAREHOUSE` — до пункта
выдачи ещё не доехали, поэтому коды `ACCEPTED_AT_PICK_UP_POINT` и
`POSTOMAT_POSTED` взяты из словаря СДЭК, а не увидены. Поэтому списки вынесены
в env: когда первые посылки доедут, посмотри реальные коды и поправь
`CDEK_WAITING_STATUSES` без правки кода.

```bash
journalctl -u push-server --since '7 days ago' | grep '\[cdek\] событие' | awk '{print $NF}' | sort | uniq -c | sort -rn
```

**Заказы, уехавшие до включения вебхука,** в реестре не появятся, пока по ним
не придёт хоть одно событие. Это нормально: следующее же движение посылки их
заведёт.
