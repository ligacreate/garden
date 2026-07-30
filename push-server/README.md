# Garden Push & Billing Server

Web Push backend + Prodamus billing webhook for subscription access control.

## 1) Install

```bash
npm install
```

## 2) Configure environment

Copy `.env.example` to `.env` and fill values.

- `DATABASE_URL` - Postgres connection string
- `WEB_PUSH_PUBLIC_KEY` / `WEB_PUSH_PRIVATE_KEY` - VAPID keys (optional if you only use billing webhook)
- `CORS_ORIGIN` - frontend origin (for example `https://liga.skrebeyko.ru`)
- `ADMIN_PUSH_TOKEN` - optional token for `/push/news`
- `PRODAMUS_WEBHOOK_ENABLED=true`
- `PRODAMUS_PROVIDER_NAME=prodamus`
- `PRODAMUS_SECRET_KEY` - signature verification secret from Prodamus
- `PRODAMUS_ALLOWED_IPS` - optional comma-separated Prodamus IP allowlist
- `DEFAULT_BOT_RENEW_URL` - fallback renew URL shown to blocked users
- `BILLING_TIMEZONE=Europe/Warsaw`
- `AUTH_URL` / `AUTH_SERVICE_SECRET` - optional endpoint secret for forced logout (`/auth/logout-all`)

Generate VAPID keys:

```bash
node -e "import('web-push').then(({default:w})=>console.log(w.generateVAPIDKeys()))"
```

## 3) Ensure DB schema exists

Run SQL migrations in project root:

- `migrations/20_push_subscriptions.sql`
- `migrations/21_billing_subscription_access.sql`

## 4) Run service

```bash
npm run start
```

Endpoints:

- `GET /health`
- `GET /push/public-key`
- `POST /push/subscribe`
- `POST /push/unsubscribe`
- `POST /push/news`
- `POST /api/billing/prodamus/webhook`
- `POST /webhooks/prodamus` (alias)
- `GET  /api/v1/upcoming.json` — публичный read-only фид расписания встреч (без auth, CORS `*`, in-memory кеш 5 мин). См. `plans/2026-05-04-public-upcoming-api.md`.
- `POST /webhooks/cdek/:token` — вебхуки СДЭК: новый заказ и незабранная посылка → уведомления Ольге в Telegram. См. ниже.

### Вебхуки СДЭК

Модули `cdekWebhook.mjs` и `cdekStore.mjs`. В базу Garden не ходят, наружу не
бросают; при пустом `CDEK_WEBHOOK_TOKEN` (или любом другом незаданном ключе)
полностью спят — эндпоинт отвечает 200 и ничего не делает. Упасть и утянуть за
собой Garden не могут.

**Два сообщения.**

1. *Новый заказ* — состав и трек. Триггер: статус `CREATED` («Создан»), первое
   событие заказа, когда трек-номер уже присвоен. Движение посылки не шлём,
   его слишком много.
2. *Не забирают заказ* — получатель, телефон, состав, трек. Триггер: посылка
   лежит в пункте выдачи дольше `CDEK_WAITING_HOURS` (сутки) и не забрана.

**Почему свой таймер, а не письмо СДЭК про истечение срока хранения.** Статус
заказа СДЭК меняет только когда посылка уже поехала назад — это поздно. Часы
запускаем сами с момента, когда посылка легла в пункт выдачи.

**Как устроено.**

- Токен — сегментом пути: заголовков авторизации СДЭК не шлёт. Несовпал — 404.
  Совпал — всегда 200: любой другой код СДЭК считает неудачей и ретраит.
- Состав заказа добирается запросом `GET /orders?cdek_number=…` — метода
  «дай список всех заказов» в API СДЭК нет, поэтому и вебхуки. За деталями
  ходим только на нужных статусах, не на каждое движение.
- Реестр заказов — JSON-файл `CDEK_STORE_PATH` рядом с сервисом (запись
  атомарная, права 600). Отдельная таблица под сотню строк дороже задачи;
  потеря реестра стоит одного пропущенного напоминания.
- Раз в `CDEK_SCAN_MINUTES` — проход по реестру: кто лежит дольше порога.
  Напоминание по заказу одно. Закрытые заказы старше 90 дней вычищаются.
- Если собрать сообщение не вышло — Ольге всё равно уходит текст с ошибкой
  и сырыми данными. Заказ молча не теряется.

**Списки статусов вынесены в настройки.** `CDEK_WAITING_STATUSES` — коды из
словаря СДЭК; на живых заказах издательства они ещё не встречались, поэтому
уточняются без правки кода. Все приходящие коды пишутся в лог
(`journalctl -u push-server | grep '\[cdek\]'`) — свериться можно там.

Ключи СДЭК общие с Тильдой (`~/.skrebeyko/.cdek`). **Новый ключ в ЛК СДЭК
не создавать:** это деактивирует старый и сломает магазин.

Подписка на вебхук — скриптом `~/.skrebeyko/cdek_webhooks.py`
(`list` · `subscribe <url>` · `delete <uuid>` · `order <трек>`).

Тесты: `node --test cdekWebhook.test.mjs cdekStore.test.mjs`

Webhook only trusts valid Prodamus signatures. Success URL callbacks from browser are ignored.

Supported billing events:
- `payment_success`
- `auto_payment`
- `deactivation`
- `finish`

If subscription is ended/deactivated, service sets profile access to `paused_expired` and bumps `session_version`.
If payment is successful, access is restored automatically unless user is in `paused_manual`.

A nightly reconcile job additionally blocks users with `paid_until < now()` as a fallback.

## 5) Frontend config

In frontend env set:

- `VITE_PUSH_URL=https://<your-push-host>`
- `VITE_WEB_PUSH_PUBLIC_KEY=<public-key>`

For CI add secret:

- `VITE_WEB_PUSH_PUBLIC_KEY`
