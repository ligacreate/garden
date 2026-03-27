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
