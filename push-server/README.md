# Garden Push Server

Minimal Web Push backend for iPhone/Android PWA notifications.

## 1) Install

```bash
npm install
```

## 2) Configure environment

Copy `.env.example` to `.env` and fill values.

- `DATABASE_URL` - Postgres connection string
- `WEB_PUSH_PUBLIC_KEY` / `WEB_PUSH_PRIVATE_KEY` - VAPID keys
- `CORS_ORIGIN` - frontend origin (for example `https://liga.skrebeyko.ru`)
- `ADMIN_PUSH_TOKEN` - optional token for `/push/news`

Generate VAPID keys:

```bash
node -e "import('web-push').then(({default:w})=>console.log(w.generateVAPIDKeys()))"
```

## 3) Ensure DB table exists

Run SQL migration in project root:

- `migrations/20_push_subscriptions.sql`

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

## 5) Frontend config

In frontend env set:

- `VITE_PUSH_URL=https://<your-push-host>`
- `VITE_WEB_PUSH_PUBLIC_KEY=<public-key>`

For CI add secret:

- `VITE_WEB_PUSH_PUBLIC_KEY`
