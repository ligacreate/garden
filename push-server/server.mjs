import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import webpush from 'web-push';
import pkg from 'pg';
import crypto from 'crypto';
import { verifyProdamusSignature } from './prodamusVerify.mjs';
import { classifyProdamusEvent, deriveAccessMutation } from './billingLogic.mjs';
import { createUpcomingHandler } from './upcomingApi.mjs';

const { Pool } = pkg;

const {
  PORT = '8787',
  DATABASE_URL = '',
  WEB_PUSH_PUBLIC_KEY = '',
  WEB_PUSH_PRIVATE_KEY = '',
  WEB_PUSH_SUBJECT = 'mailto:admin@example.com',
  CORS_ORIGIN = '*',
  ADMIN_PUSH_TOKEN = '',
  PRODAMUS_WEBHOOK_ENABLED = 'true',
  PRODAMUS_PROVIDER_NAME = 'prodamus',
  PRODAMUS_SECRET_KEY = '',
  PRODAMUS_ALLOWED_IPS = '',
  DEFAULT_BOT_RENEW_URL = '',
  BILLING_TIMEZONE = 'Europe/Warsaw'
} = process.env;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}
const pushEnabled = Boolean(WEB_PUSH_PUBLIC_KEY && WEB_PUSH_PRIVATE_KEY);
if (pushEnabled) {
  webpush.setVapidDetails(WEB_PUSH_SUBJECT, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY);
}

const pool = new Pool({
  connectionString: DATABASE_URL
});

const app = express();
app.use(cors({ origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(',').map((v) => v.trim()) }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

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

// ────────────────────────────────────────────────────────────────────
// Public read-only API: GET /api/v1/upcoming.json
// Используется внешним пайплайном (Telegram-карточки расписания).
// План: plans/2026-05-04-public-upcoming-api.md
// ────────────────────────────────────────────────────────────────────

const upcomingCors = cors({ origin: '*', methods: ['GET'] });
const upcomingCache = new Map(); // key=`${from}|${days}` → { expiresAt, body }
const upcomingHandler = createUpcomingHandler({ pool, cache: upcomingCache });

app.options('/api/v1/upcoming.json', upcomingCors);
app.get('/api/v1/upcoming.json', upcomingCors, upcomingHandler);

app.get('/push/public-key', (_req, res) => {
  if (!pushEnabled) return res.status(503).json({ error: 'Web Push is not configured' });
  res.json({ publicKey: WEB_PUSH_PUBLIC_KEY });
});

app.post('/push/subscribe', async (req, res) => {
  if (!pushEnabled) return res.status(503).json({ error: 'Web Push is not configured' });
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
  if (!pushEnabled) return res.status(503).json({ error: 'Web Push is not configured' });
  const endpoint = String(req.body?.endpoint || '').trim();
  if (!endpoint) return res.status(400).json({ error: 'Endpoint required' });
  await pool.query(
    'update public.push_subscriptions set is_active = false, updated_at = now() where endpoint = $1',
    [endpoint]
  );
  res.json({ ok: true });
});

app.post('/push/news', requireAdminToken, async (req, res) => {
  if (!pushEnabled) return res.status(503).json({ error: 'Web Push is not configured' });
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

const parseClientIp = (req) => {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((v) => v.trim()).filter(Boolean);
  if (xff.length > 0) return xff[0];
  return String(req.ip || req.connection?.remoteAddress || '').replace('::ffff:', '');
};

const allowedIps = PRODAMUS_ALLOWED_IPS.split(',').map((v) => v.trim()).filter(Boolean);
const webhookEnabled = String(PRODAMUS_WEBHOOK_ENABLED).toLowerCase() === 'true';

const extractPaidUntil = (flat) => {
  const raw = flat.paid_until || flat.subscription_paid_until || flat.next_payment_at || flat.access_until || flat.period_end;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};

const stableJson = (value) => {
  if (value == null) return 'null';
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const resolveExternalId = (flat, eventName) => {
  const raw = String(
    flat.event_id
    || flat.notification_id
    || flat.transaction_id
    || flat.payment_id
    || flat.order_id
    || ''
  ).trim();
  if (raw) return `${eventName}:${raw}`.slice(0, 512);
  const fingerprint = crypto.createHash('sha256').update(stableJson(flat || {}), 'utf8').digest('hex');
  return `${eventName}:payload:${fingerprint}`.slice(0, 512);
};

const resolveCustomer = (flat) => {
  const email = String(flat.email || flat.customer_email || '').trim().toLowerCase();
  const phone = String(flat.phone || flat.customer_phone || '').replace(/[^\d+]/g, '');
  const extId = String(flat.external_id || flat.user_id || flat.client_id || '').trim();
  return { email: email || null, phone: phone || null, extId: extId || null };
};

const findProfileByCustomer = async (db, { email, phone, extId }) => {
  if (extId) {
    const byExt = await db.query(
      `select * from public.profiles where id::text = $1 or prodamus_customer_id = $1 limit 1`,
      [extId]
    );
    if (byExt.rowCount > 0) return byExt.rows[0];
  }
  if (email) {
    const byEmail = await db.query(
      `select * from public.profiles where lower(trim(email)) = lower(trim($1)) limit 1`,
      [email]
    );
    if (byEmail.rowCount > 0) return byEmail.rows[0];
  }
  if (phone) {
    const byPhone = await db.query(
      `select * from public.profiles where regexp_replace(coalesce(telegram, ''), '[^0-9+]', '', 'g') = $1 limit 1`,
      [phone]
    );
    if (byPhone.rowCount > 0) return byPhone.rows[0];
  }
  return null;
};

const persistWebhookLog = async (client, { eventName, externalId, payload, signatureValid }) => {
  const q = await client.query(
    `insert into public.billing_webhook_logs(provider, event_name, external_id, payload_json, signature_valid, is_processed)
     values ($1, $2, $3, $4::jsonb, $5, false)
     on conflict (provider, external_id) do nothing
     returning id, is_processed`,
    [PRODAMUS_PROVIDER_NAME, eventName, externalId, JSON.stringify(payload || {}), Boolean(signatureValid)]
  );
  if (q.rowCount > 0) return q.rows[0];
  const existing = await client.query(
    `select id, is_processed
       from public.billing_webhook_logs
      where provider = $1 and external_id = $2
      limit 1`,
    [PRODAMUS_PROVIDER_NAME, externalId]
  );
  return existing.rows[0] || null;
};

const markWebhookLogState = async (client, logId, { processed, errorText }) => {
  await client.query(
    `update public.billing_webhook_logs
       set is_processed = $2,
           error_text = $3
     where id = $1`,
    [logId, Boolean(processed), errorText]
  );
};

const applyAccessState = async (db, profile, { eventName, paidUntil, payload, customerIds }) => {
  const isManualPaused = String(profile?.access_status || '').toLowerCase() === 'paused_manual';
  const autoPauseExempt = Boolean(profile?.auto_pause_exempt);
  const mutation = deriveAccessMutation({
    eventName,
    currentAccessStatus: profile?.access_status || null,
    autoPauseExempt
  });
  const payloadJson = JSON.stringify(payload || {});
  const subscriptionId = String(customerIds.subscriptionId || '').trim() || null;
  const customerId = String(customerIds.customerId || '').trim() || null;

  if (mutation && (eventName === 'payment_success' || eventName === 'auto_payment')) {
    const effectivePaidUntil = paidUntil || new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
    await db.query(
      `update public.profiles
         set subscription_status = $2,
             access_status = $3,
             paid_until = $4,
             last_payment_at = now(),
             last_prodamus_event = $5,
             last_prodamus_payload = $6::jsonb,
             prodamus_subscription_id = coalesce($7, prodamus_subscription_id),
             prodamus_customer_id = coalesce($8, prodamus_customer_id),
             bot_renew_url = coalesce(bot_renew_url, $9)
       where id = $1`,
      [profile.id, mutation.subscription_status, mutation.access_status, effectivePaidUntil.toISOString(), eventName, payloadJson, subscriptionId, customerId, DEFAULT_BOT_RENEW_URL || null]
    );

    await db.query(
      `insert into public.subscriptions(user_id, provider, provider_subscription_id, status, paid_until, last_payment_at, ended_at, updated_at)
       values ($1, $2, $3, $4, $5, now(), null, now())
       on conflict (provider, provider_subscription_id) do update
         set status = excluded.status,
             paid_until = excluded.paid_until,
             last_payment_at = now(),
             ended_at = null,
             updated_at = now()`,
      [profile.id, PRODAMUS_PROVIDER_NAME, subscriptionId || `${profile.id}`, mutation.subscription_status, effectivePaidUntil.toISOString()]
    );
    return;
  }

  if (mutation && (eventName === 'deactivation' || eventName === 'finish')) {
    await db.query(
      `update public.profiles
         set subscription_status = $2,
             access_status = $3,
             paid_until = coalesce($4::timestamptz, paid_until),
             last_prodamus_event = $5,
             last_prodamus_payload = $6::jsonb,
             prodamus_subscription_id = coalesce($7, prodamus_subscription_id),
             prodamus_customer_id = coalesce($8, prodamus_customer_id),
             bot_renew_url = coalesce(bot_renew_url, $9),
             session_version = case when $10::boolean then session_version + 1 else session_version end
       where id = $1`,
      [profile.id, mutation.subscription_status, mutation.access_status, paidUntil ? paidUntil.toISOString() : null, eventName, payloadJson, subscriptionId, customerId, DEFAULT_BOT_RENEW_URL || null, mutation.bumpSessionVersion]
    );

    await db.query(
      `insert into public.subscriptions(user_id, provider, provider_subscription_id, status, paid_until, ended_at, updated_at)
       values ($1, $2, $3, $4, $5, now(), now())
       on conflict (provider, provider_subscription_id) do update
         set status = excluded.status,
             paid_until = excluded.paid_until,
             ended_at = now(),
             updated_at = now()`,
      [profile.id, PRODAMUS_PROVIDER_NAME, subscriptionId || `${profile.id}`, mutation.subscription_status, paidUntil ? paidUntil.toISOString() : null]
    );

    if (!isManualPaused) {
      // Best effort logout in auth-service.
      await fetch(`${process.env.AUTH_URL || 'https://auth.skrebeyko.ru'}/auth/logout-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-service-secret': process.env.AUTH_SERVICE_SECRET || '' },
        body: JSON.stringify({ user_id: profile.id, reason: 'subscription_blocked' })
      }).catch(() => {});
    }
  }
};

const handleProdamusWebhook = async (req, res) => {
  if (!webhookEnabled) return res.status(503).json({ error: 'Webhook disabled' });
  if (!PRODAMUS_SECRET_KEY) return res.status(500).json({ error: 'PRODAMUS_SECRET_KEY is not set' });
  if (allowedIps.length > 0) {
    const ip = parseClientIp(req);
    if (!allowedIps.includes(ip)) {
      return res.status(403).json({ error: 'IP is not allowed' });
    }
  }

  const payload = req.body || {};
  const signatureValid = verifyProdamusSignature(payload, PRODAMUS_SECRET_KEY);
  const eventName = classifyProdamusEvent(payload);
  const externalId = resolveExternalId(payload, eventName);
  const lockKey = `billing:${PRODAMUS_PROVIDER_NAME}:${externalId}`;
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [lockKey]);

    const log = await persistWebhookLog(client, { eventName, externalId, payload, signatureValid });
    if (!log?.id) {
      await client.query('rollback');
      return res.status(500).json({ error: 'Failed to persist webhook log' });
    }

    if (!signatureValid) {
      await markWebhookLogState(client, log.id, { processed: true, errorText: 'Invalid signature' });
      await client.query('commit');
      return res.status(403).json({ error: 'Invalid signature' });
    }
    if (log?.is_processed) {
      await client.query('commit');
      return res.json({ ok: true, duplicate: true });
    }

    const customer = resolveCustomer(payload);
    const profile = await findProfileByCustomer(client, customer);
    if (!profile) {
      await markWebhookLogState(client, log.id, { processed: false, errorText: 'Profile not found (replayable)' });
      await client.query('commit');
      return res.status(202).json({ ok: true, processed: false, reason: 'profile_not_found_replayable' });
    }

    const paidUntil = extractPaidUntil(payload);
    await applyAccessState(client, profile, {
      eventName,
      paidUntil,
      payload,
      customerIds: {
        subscriptionId: payload.subscription_id || payload.prodamus_subscription_id || null,
        customerId: payload.customer_id || payload.prodamus_customer_id || customer.extId || null
      }
    });

    // FEAT-015 Path C: пометить лог если профиль освобождён от автопаузы.
    // is_processed=true (событие учтено в подписке), error_text — для аудита.
    const skippedByExempt = Boolean(profile.auto_pause_exempt)
      && (eventName === 'deactivation' || eventName === 'finish');
    await markWebhookLogState(client, log.id, {
      processed: true,
      errorText: skippedByExempt ? 'SKIPPED_BY_AUTO_PAUSE_EXEMPT' : null
    });
    await client.query('commit');
    return res.json({ ok: true, processed: true, event: eventName, externalId });
  } catch (e) {
    await client.query('rollback').catch(() => {});
    return res.status(500).json({ error: 'Webhook processing failed', details: e?.message || 'unknown' });
  } finally {
    client.release();
  }
};

app.post('/api/billing/prodamus/webhook', handleProdamusWebhook);
app.post('/webhooks/prodamus', handleProdamusWebhook);

const runNightlyExpiryReconcile = async () => {
  try {
    // FEAT-015 Path C step 1: auto-expire auto_pause_exempt_until.
    // Перевод истёкших exempt-флагов в false. Кейс: Ольга поставила
    // ведущей бартер до 2026-12-31, дата прошла → флаг снят, обычная
    // подписочная логика возвращается.
    const expired = await pool.query(
      `update public.profiles
          set auto_pause_exempt = false,
              auto_pause_exempt_until = null,
              auto_pause_exempt_note = coalesce(auto_pause_exempt_note, '')
                || ' [expired ' || current_date::text || ']'
        where auto_pause_exempt = true
          and auto_pause_exempt_until is not null
          and auto_pause_exempt_until < current_date
       returning id`
    );
    for (const row of expired.rows || []) {
      // Аудит-запись в billing_webhook_logs.
      await pool.query(
        `insert into public.billing_webhook_logs(
           provider, event_name, external_id, payload_json, signature_valid, is_processed
         )
         values ($1, 'auto_pause_exempt_expired', $2, $3::jsonb, true, true)
         on conflict (provider, external_id) do nothing`,
        [
          PRODAMUS_PROVIDER_NAME,
          `exempt_expired:${row.id}:${new Date().toISOString().slice(0, 10)}`,
          JSON.stringify({ profile_id: row.id, source: 'nightly_reconcile' })
        ]
      );
    }
    if ((expired.rows || []).length > 0) {
      console.info(`[reconcile ${BILLING_TIMEZONE}] auto_pause_exempt expired: ${expired.rows.length} profiles`);
    }

    // FEAT-015 Path C step 2: existing overdue → paused_expired,
    // НО игнорировать exempt-профили (они защищены от автопаузы по дизайну).
    const { rows } = await pool.query(
      `update public.profiles
          set subscription_status = case when subscription_status = 'active' then 'overdue' else subscription_status end,
              access_status = case when access_status = 'active' then 'paused_expired' else access_status end,
              last_prodamus_event = coalesce(last_prodamus_event, 'nightly_reconcile_overdue'),
              session_version = case when access_status = 'active' then session_version + 1 else session_version end
        where role <> 'admin'
          and coalesce(auto_pause_exempt, false) = false
          and coalesce(access_status, 'active') = 'active'
          and paid_until is not null
          and paid_until < now()
       returning id`
    );
    if ((rows || []).length > 0) {
      console.info(`[billing-reconcile ${BILLING_TIMEZONE}] blocked overdue users: ${rows.length}`);
    }
  } catch (e) {
    console.error('[billing-reconcile] failed', e);
  }
};

// run once on startup and then every night
runNightlyExpiryReconcile();
setInterval(runNightlyExpiryReconcile, 24 * 60 * 60 * 1000);

app.listen(Number(PORT), () => {
  console.log(`Server started on :${PORT} (push=${pushEnabled ? 'on' : 'off'}, prodamus=${webhookEnabled ? 'on' : 'off'})`);
});
