import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import webpush from 'web-push';
import pkg from 'pg';

const { Pool } = pkg;

const {
  PORT = '8787',
  DATABASE_URL = '',
  WEB_PUSH_PUBLIC_KEY = '',
  WEB_PUSH_PRIVATE_KEY = '',
  WEB_PUSH_SUBJECT = 'mailto:admin@example.com',
  CORS_ORIGIN = '*',
  ADMIN_PUSH_TOKEN = ''
} = process.env;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}
if (!WEB_PUSH_PUBLIC_KEY || !WEB_PUSH_PRIVATE_KEY) {
  throw new Error('WEB_PUSH_PUBLIC_KEY and WEB_PUSH_PRIVATE_KEY are required');
}

webpush.setVapidDetails(WEB_PUSH_SUBJECT, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY);

const pool = new Pool({
  connectionString: DATABASE_URL
});

const app = express();
app.use(cors({ origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(',').map((v) => v.trim()) }));
app.use(express.json({ limit: '1mb' }));

const requireAdminToken = (req, res, next) => {
  if (!ADMIN_PUSH_TOKEN) return next();
  const raw = req.headers.authorization || '';
  const token = raw.startsWith('Bearer ') ? raw.slice(7) : '';
  if (token !== ADMIN_PUSH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
};

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/push/public-key', (_req, res) => {
  res.json({ publicKey: WEB_PUSH_PUBLIC_KEY });
});

app.post('/push/subscribe', async (req, res) => {
  const sub = req.body?.subscription || {};
  const endpoint = String(sub?.endpoint || '').trim();
  if (!endpoint) return res.status(400).json({ error: 'Invalid subscription endpoint' });

  const keys = sub?.keys || {};
  const userId = req.body?.user_id || null;
  const userAgent = req.body?.platform || req.headers['user-agent'] || null;

  const query = `
    insert into public.push_subscriptions (user_id, endpoint, keys, user_agent, is_active, updated_at)
    values ($1, $2, $3::jsonb, $4, true, now())
    on conflict (endpoint)
    do update set
      user_id = excluded.user_id,
      keys = excluded.keys,
      user_agent = excluded.user_agent,
      is_active = true,
      updated_at = now()
  `;

  await pool.query(query, [userId, endpoint, JSON.stringify(keys || {}), userAgent]);
  res.json({ ok: true });
});

app.post('/push/unsubscribe', async (req, res) => {
  const endpoint = String(req.body?.endpoint || '').trim();
  if (!endpoint) return res.status(400).json({ error: 'Endpoint required' });
  await pool.query(
    'update public.push_subscriptions set is_active = false, updated_at = now() where endpoint = $1',
    [endpoint]
  );
  res.json({ ok: true });
});

app.post('/push/news', requireAdminToken, async (req, res) => {
  const title = String(req.body?.title || 'Новая новость');
  const body = String(req.body?.body || 'Откройте приложение, чтобы прочитать новость.');
  const url = String(req.body?.url || '/');
  const tag = String(req.body?.tag || `news-${Date.now()}`);

  const { rows } = await pool.query(
    'select id, endpoint, keys from public.push_subscriptions where is_active = true'
  );

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const subscription = {
      endpoint: row.endpoint,
      keys: row.keys || {}
    };
    try {
      await webpush.sendNotification(
        subscription,
        JSON.stringify({
          title,
          body,
          url,
          tag,
          icon: '/favicon.png',
          badge: '/favicon.png'
        })
      );
      sent += 1;
    } catch (error) {
      failed += 1;
      const statusCode = error?.statusCode || 0;
      if (statusCode === 404 || statusCode === 410) {
        await pool.query(
          'update public.push_subscriptions set is_active = false, updated_at = now() where id = $1',
          [row.id]
        );
      }
    }
  }

  res.json({ ok: true, sent, failed, total: rows.length });
});

app.listen(Number(PORT), () => {
  console.log(`Push server started on :${PORT}`);
});
