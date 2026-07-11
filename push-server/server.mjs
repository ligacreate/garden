import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import webpush from 'web-push';
import pkg from 'pg';
import crypto from 'crypto';
import { verifyProdamusSignature, pickSignatureSource } from './prodamusVerify.mjs';
import { classifyProdamusEvent, deriveAccessMutation, isExemptRole, normalizeTelegramUsername, mapBotHunterEvent, isLigaProduct, looksLikeLigaSum } from './billingLogic.mjs';
import { createUpcomingHandler } from './upcomingApi.mjs';
import { isSandbox, verifyJwtHS256, bearerToken, resolveYooKassaCreds, yooKassaLiveEnabled, buildYooKassaPayload, buildProdamusUrl } from './billingCheckout.mjs';
import { makeTgAccessClient } from './tgAccessClient.mjs';
import { runTgAccessReconcile } from './tgAccessReconcile.mjs';
import { executeActions } from './tgAccessActions.mjs';
import { GRACE_DAYS } from './tgAccessConst.mjs';
import { startJoinPoller } from './tgAccessJoinPoller.mjs';
import { runReminders } from './reminders.mjs';

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
  BILLING_TIMEZONE = 'Europe/Warsaw',
  BOTHUNTER_WEBHOOK_TOKEN = '',
  BOTHUNTER_PROVIDER_NAME = 'bothunter',
  // ФАЗА 1b — checkout
  GARDEN_JWT_SECRET = '',                 // = garden-auth JWT_SECRET (HS256), для verify user_id
  YOOKASSA_API_URL = 'https://api.yookassa.ru/v3/payments',
  YOOKASSA_SHOP_ID = '',                  // live 1100657
  YOOKASSA_SECRET_KEY = '',               // live
  YOOKASSA_LIVE_ENABLED = '',             // '1' → разрешить боевой YooKassa-вызов (осознанный самоплатёж). По умолчанию выкл.
  YOOKASSA_TEST_SHOP_ID = '',             // тест-магазина у нас НЕТ — ветка инертна
  YOOKASSA_TEST_SECRET_KEY = '',
  YOOKASSA_RETURN_URL = 'https://liga.skrebeyko.ru/?paid=1',
  PRODAMUS_PAYFORM_URL = '',               // https://skrebeyko.payform.ru
  // ФАЗА 3 — TG-доступ (по умолчанию ВЫКЛ: без токена/при mode=off модуль спит)
  TG_ACCESS_BOT_TOKEN = '',                // @ligagardenbot; пусто → модуль не активен
  TG_ACCESS_MODE = 'off',                  // off | shadow | admit | live
  TG_ACCESS_AUTOKICK = ''                  // '1' → авто-исполнять KICK в nightly (после 1-го confirm-батча)
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

const persistWebhookLog = async (client, { provider = PRODAMUS_PROVIDER_NAME, eventName, externalId, payload, signatureValid }) => {
  // BUG-WEBHOOK-LOG-PARTIAL-INDEX: ON CONFLICT с partial unique index требует
  // явного WHERE-clause, совпадающего с индексом, иначе Postgres выкидывает
  // 42P10 «no unique or exclusion constraint matching».
  // Индекс: billing_webhook_logs_provider_external_uidx … WHERE external_id IS NOT NULL.
  const q = await client.query(
    `insert into public.billing_webhook_logs(provider, event_name, external_id, payload_json, signature_valid, is_processed)
     values ($1, $2, $3, $4::jsonb, $5, false)
     on conflict (provider, external_id) where external_id is not null do nothing
     returning id, is_processed`,
    [provider, eventName, externalId, JSON.stringify(payload || {}), Boolean(signatureValid)]
  );
  if (q.rowCount > 0) return q.rows[0];
  const existing = await client.query(
    `select id, is_processed
       from public.billing_webhook_logs
      where provider = $1 and external_id = $2
      limit 1`,
    [provider, externalId]
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

const applyAccessState = async (db, profile, { provider = PRODAMUS_PROVIDER_NAME, eventName, paidUntil, payload, customerIds }) => {
  // В1: deactivation/finish больше не трогают access_status (Лига-доступ = subActive),
  // поэтому exempt/manual-логика паузы здесь не нужна — mutation.access_status может быть null.
  const mutation = deriveAccessMutation({
    eventName,
    currentAccessStatus: profile?.access_status || null
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
       on conflict (provider, provider_subscription_id) where provider_subscription_id is not null do update
         set status = excluded.status,
             paid_until = excluded.paid_until,
             last_payment_at = now(),
             ended_at = null,
             updated_at = now()`,
      [profile.id, provider, subscriptionId || `${profile.id}`, mutation.subscription_status, effectivePaidUntil.toISOString()]
    );
    return;
  }

  if (mutation && (eventName === 'deactivation' || eventName === 'finish')) {
    await db.query(
      `update public.profiles
         set subscription_status = $2,
             access_status = coalesce($3, access_status),
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
       on conflict (provider, provider_subscription_id) where provider_subscription_id is not null do update
         set status = excluded.status,
             paid_until = excluded.paid_until,
             ended_at = now(),
             updated_at = now()`,
      [profile.id, provider, subscriptionId || `${profile.id}`, mutation.subscription_status, paidUntil ? paidUntil.toISOString() : null]
    );

    // В1: finish/deactivation больше НЕ отзывает платформенный доступ → logout не нужен.
    // Лига-замок реализуется через subActive (paid_until) на Лига-поверхностях, не через сессию.
  }
};

// ── ОБЩЕЕ ЯДРО начисления доступа (используют и вебхук 1c, и admin mark-paid 1e).
// Два режима:
//   - months  → продление СТОПКОЙ: paid_until = greatest(now, paid_until) + N мес (авто-платёж).
//   - until   → ЯВНАЯ дата «оплачено до» (источник истины; ручная отметка админа).
//               Дата трактуется как конец дня (23:59:59), чтобы «до DD» было включительно.
// В обоих режимах: subscription_status=active, access_status active кроме paused_manual,
// last_payment_at, last_prodamus_event, upsert в subscriptions.
const applyPayment = async (db, { userId, months = null, until = null, meta = {} }) => {
  const paidUntilExpr = until
    ? `($2::date + interval '1 day' - interval '1 second')`
    : `greatest(now(), coalesce(p.paid_until, now())) + make_interval(months => $2)`;
  const param2 = until ? until : Number(months);

  const upd = await db.query(
    `update public.profiles p
        set paid_until = ${paidUntilExpr},
            access_status = case when p.access_status = 'paused_manual' then 'paused_manual' else 'active' end,
            subscription_status = 'active',
            last_payment_at = now(),
            last_prodamus_event = $3,
            last_prodamus_payload = $4::jsonb
      where p.id = $1
      returning paid_until, access_status`,
    [userId, param2, meta.event || 'plan_payment', JSON.stringify(meta.payload || {})]
  );
  if (upd.rowCount === 0) return null;
  const paidUntil = upd.rows[0].paid_until;

  await db.query(
    `insert into public.subscriptions(user_id, provider, provider_subscription_id, status, paid_until, last_payment_at, ended_at, updated_at)
     values ($1, $2, $3, 'active', $4, now(), null, now())
     on conflict (provider, provider_subscription_id) where provider_subscription_id is not null
     do update set status='active', paid_until=excluded.paid_until, last_payment_at=now(), ended_at=null, updated_at=now()`,
    [userId, meta.provider || 'prodamus', String(meta.orderId), paidUntil]
  );
  return { paidUntil, accessStatus: upd.rows[0].access_status };
};

// ── ФАЗА 1c: apply платформо-инициированного плана (детерминированно по order_id).
// Идемпотентность: billing_webhook_logs dedup + guard order.status='paid'.
const applyPlanPayment = async (db, orderId, payload) => {
  let q;
  try {
    q = await db.query(
      `select po.id, po.user_id, po.status, po.plan_code, coalesce(po.months, bp.months) as months
         from public.payment_orders po
         left join public.billing_plans bp on bp.code = po.plan_code
        where po.id = $1`,
      [orderId]
    );
  } catch {
    return { reason: 'order_not_found' };   // невалидный uuid → «не найден»
  }
  if (q.rowCount === 0) return { reason: 'order_not_found' };
  const order = q.rows[0];
  if (order.status === 'paid') {
    return { note: 'already_paid', info: { duplicate: true, user_id: order.user_id } };
  }
  const months = Number(order.months);
  if (!Number.isFinite(months) || months <= 0) return { reason: 'order_no_months' };
  const extPay = String(payload.order_id || payload.payment_id || payload.transaction_id || '').trim() || null;

  const res = await applyPayment(db, {
    userId: order.user_id, months,
    meta: { event: 'plan_payment', provider: 'prodamus', orderId: order.id, payload }
  });
  if (!res) return { reason: 'order_not_found' };  // профиль исчез

  await db.query(
    `update public.payment_orders set status='paid', paid_at=now(), external_payment_id=$2 where id=$1 and status <> 'paid'`,
    [order.id, extPay]
  );
  return { info: { user_id: order.user_id, plan: order.plan_code, months, paid_until: res.paidUntil, access_status: res.accessStatus } };
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
  // BUG-PRODAMUS-SIGNATURE-HEADER: подпись приходит в HTTP-заголовке `Sign`,
  // а не в теле. Мостим через pickSignatureSource перед verify.
  const payloadForVerify = pickSignatureSource(payload, req.headers);
  const signatureValid = verifyProdamusSignature(payloadForVerify, PRODAMUS_SECRET_KEY);
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

    // ── ФАЗА 1c: платформо-инициированный план — детерминированный матч по
    // нашему order_id (кладём в _param_order_id, т.к. нативный order_id Prodamus
    // перезаписывает). Если параметр есть и это оплата — идём план-путём
    // (paid_until += N мес из billing_plans), БЕЗ fuzzy-матча по email.
    const orderRef = String(payload._param_order_id || payload.param_order_id || '').trim();
    if (orderRef && (eventName === 'payment_success' || eventName === 'auto_payment')) {
      const applied = await applyPlanPayment(client, orderRef, payload);
      if (applied.reason === 'order_not_found') {
        // заказа нет (мог не создаться / чужой order_id) — replayable, без fuzzy.
        await markWebhookLogState(client, log.id, { processed: false, errorText: `plan_order_not_found:${orderRef} (replayable)` });
        await client.query('commit');
        return res.status(202).json({ ok: true, processed: false, reason: 'plan_order_not_found', order_id: orderRef });
      }
      await markWebhookLogState(client, log.id, { processed: true, errorText: applied.note || null });
      await client.query('commit');
      return res.json({ ok: true, processed: true, path: 'plan_order', order_id: orderRef, ...(applied.info || {}) });
    }

    // ── ТОВАРО-ГЕЙТ (Фаза 3): в «диком» пути Лига-доступ выдаём ТОЛЬКО за Лига-товар.
    //    Плановый путь (1c, выше) — по plan_code, сюда не доходит. Pause-события (finish/
    //    deactivation) не про товар — пропускаем гейт. Нет products → трактуем как не-Лига.
    const isGrant = eventName === 'payment_success' || eventName === 'auto_payment';
    if (isGrant && !isLigaProduct(payload)) {
      const names = Array.isArray(payload.products) ? payload.products.map((p) => p?.name).filter(Boolean) : [];
      const base = names.length ? `SKIPPED_NON_LIGA_PRODUCT:${names.join('|')}` : 'SKIPPED_NON_LIGA_NO_PRODUCTS';
      const ligaSum = looksLikeLigaSum(payload);
      if (ligaSum) {
        // Лига-сумма, но имя не совпало → возможно ПЕРЕИМЕНОВАЛИ товар. Заметный сигнал.
        console.warn(`[prodamus] ⚠ SKIP grant с ЛИГА-СУММОЙ (проверить переименование товара): sum=${payload.sum} products=${JSON.stringify(names)} ext=${externalId}`);
      } else {
        console.info(`[prodamus] skip non-liga grant: ${base} ext=${externalId}`);
      }
      await markWebhookLogState(client, log.id, {
        processed: true,
        errorText: (ligaSum ? 'LIGA_SUM_NAME_MISMATCH ' : '') + base.slice(0, 480)
      });
      await client.query('commit');
      return res.json({ ok: true, processed: true, skipped: 'non_liga_product', liga_sum: ligaSum });
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
    // phase30: различаем skip по индивидуальному флагу vs по структурной роли.
    const isPauseEvent = eventName === 'deactivation' || eventName === 'finish';
    let skipReason = null;
    if (isPauseEvent) {
      if (isExemptRole(profile.role)) skipReason = 'SKIPPED_BY_ROLE';
      else if (Boolean(profile.auto_pause_exempt)) skipReason = 'SKIPPED_BY_AUTO_PAUSE_EXEMPT';
    }
    await markWebhookLogState(client, log.id, {
      processed: true,
      errorText: skipReason
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

// ────────────────────────────────────────────────────────────────────
// FEAT-015 BotHunter: авто-пауза/возобновление подписки ведущих.
// Prodamus-вебхуки безличны (нет email/события окончания), поэтому ловим
// окончание через бот BotHunter «ligaskrebeyko», который уже управляет
// доступом в чаты Лиги. Матч по Telegram-username (profiles.telegram).
//
//   POST /webhooks/bothunter?token=<BOTHUNTER_WEBHOOK_TOKEN>
//   body: { username: "<@name|name|t.me/name>", event: "expired"|"active" }
//
// Auth — токен в query: блок «Запрос во вне» в BotHunter не умеет
// кастомные заголовки. Handover: docs/_session/2026-06-11_192_*.md
// ────────────────────────────────────────────────────────────────────
const bothunterEnabled = Boolean(BOTHUNTER_WEBHOOK_TOKEN);

const handleBotHunterWebhook = async (req, res) => {
  if (!bothunterEnabled) return res.status(503).json({ error: 'BotHunter webhook is not configured' });
  const token = String(req.query?.token || '');
  if (!token || token !== BOTHUNTER_WEBHOOK_TOKEN) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const body = req.body || {};
  const username = normalizeTelegramUsername(body.username);
  if (!username) {
    // Пусто или инвайт-ссылка (t.me/+...) — это не username.
    return res.status(422).json({ error: 'invalid_username', detail: 'username is empty or an invite link, not a @username' });
  }
  const eventName = mapBotHunterEvent(body.event);
  if (!eventName) {
    return res.status(422).json({ error: 'unknown_event', detail: "event must be 'expired' or 'active'" });
  }

  // Идемпотентность с гранулярностью «день»: повторы того же события за день
  // дедуплицируются (не двигают paid_until дважды), а ежемесячное продление
  // ('active' в следующем месяце) — это новый external_id → обработается.
  const day = new Date().toISOString().slice(0, 10);
  const externalId = `${eventName}:${username}:${day}`.slice(0, 512);
  const lockKey = `billing:${BOTHUNTER_PROVIDER_NAME}:${externalId}`;
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [lockKey]);

    const log = await persistWebhookLog(client, {
      provider: BOTHUNTER_PROVIDER_NAME,
      eventName,
      externalId,
      payload: body,
      signatureValid: true // токен в query уже проверен выше; подписи у BotHunter нет
    });
    if (!log?.id) {
      await client.query('rollback');
      return res.status(500).json({ error: 'Failed to persist webhook log' });
    }
    if (log.is_processed) {
      await client.query('commit');
      return res.json({ ok: true, duplicate: true, event: eventName, username });
    }

    // Матч по нормализованному username из profiles.telegram. ILIKE-prefilter
    // сужает выборку, JS-сравнение через ту же normalizeTelegramUsername даёт
    // точное совпадение (и отсекает запись «t.me/+...» → normalize=null).
    const { rows } = await client.query(
      `select id, role, telegram, access_status, auto_pause_exempt
         from public.profiles
        where telegram is not null and lower(telegram) like '%' || $1 || '%'`,
      [username]
    );
    const profile = rows.find((r) => normalizeTelegramUsername(r.telegram) === username) || null;

    if (!profile) {
      await markWebhookLogState(client, log.id, { processed: false, errorText: 'Profile not found (replayable)' });
      await client.query('commit');
      console.info(`[bothunter] profile not found username=${username} event=${eventName}`);
      return res.status(202).json({ ok: true, processed: false, reason: 'profile_not_found', username });
    }

    const role = String(profile.role || '').toLowerCase();
    if (role !== 'leader' && role !== 'mentor') {
      await markWebhookLogState(client, log.id, { processed: true, errorText: `SKIPPED_BY_ROLE:${role || 'none'}` });
      await client.query('commit');
      console.info(`[bothunter] skip role=${role} username=${username} profile=${profile.id}`);
      return res.status(202).json({ ok: true, processed: false, reason: 'role_not_eligible', role, username });
    }

    await applyAccessState(client, profile, {
      provider: BOTHUNTER_PROVIDER_NAME,
      eventName,
      paidUntil: null, // у BotHunter нет даты; payment_success даст now()+31д, finish сохранит текущую
      payload: body,
      customerIds: { subscriptionId: null, customerId: null }
    });

    // Аудит skip-by-exempt (как в prodamus): isExemptRole здесь не сработает
    // (leader/mentor — платящие), но auto_pause_exempt (бартер) — может.
    let skipReason = null;
    if (eventName === 'finish') {
      if (isExemptRole(profile.role)) skipReason = 'SKIPPED_BY_ROLE';
      else if (Boolean(profile.auto_pause_exempt)) skipReason = 'SKIPPED_BY_AUTO_PAUSE_EXEMPT';
    }
    await markWebhookLogState(client, log.id, { processed: true, errorText: skipReason });
    await client.query('commit');
    console.info(`[bothunter] applied event=${eventName} username=${username} profile=${profile.id} role=${role}${skipReason ? ` (${skipReason})` : ''}`);
    return res.json({ ok: true, processed: true, event: eventName, username, profile_id: profile.id });
  } catch (e) {
    await client.query('rollback').catch(() => {});
    console.error('[bothunter] processing failed', e);
    return res.status(500).json({ error: 'Webhook processing failed', details: e?.message || 'unknown' });
  } finally {
    client.release();
  }
};

app.post('/webhooks/bothunter', handleBotHunterWebhook);

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
         on conflict (provider, external_id) where external_id is not null do nothing`,
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

    // Напоминания (T-5 абитуриенты + 1f биллинг) — ДО мутаций статуса ниже.
    // Движок читает свежий active-срез: billing день-0 (Текст-2) должен уйти, пока
    // подписка ещё subscription_status='active', ДО того как В1-блок ниже пометит её
    // overdue. runReminders НЕ мутирует subscription_status (только reminders_sent +
    // письмо в очередь) → В1 следом отрабатывает как обычно. На T-5 и пороги 7/3 не влияет.
    await runReminders(pool);

    // В1 (кабинет-первый): истёкшая Лига-подписка помечается subscription_status='overdue'
    // (репортинг для напоминаний 1f), но access_status НЕ трогается — платформенный доступ
    // и курс не режем. Лига-замок реализуется через subActive (paid_until) на Лига-поверхностях.
    // Idempotent-guard: не переписываем уже помеченных overdue (иначе returning шумит каждую ночь).
    const { rows } = await pool.query(
      `update public.profiles
          set subscription_status = 'overdue',
              last_prodamus_event = coalesce(last_prodamus_event, 'nightly_reconcile_overdue')
        where role not in ('admin', 'applicant')
          and coalesce(auto_pause_exempt, false) = false
          and subscription_status = 'active'
          and paid_until is not null
          and paid_until < now()
       returning id`
    );
    if ((rows || []).length > 0) {
      console.info(`[billing-reconcile ${BILLING_TIMEZONE}] marked overdue (access NOT paused, В1): ${rows.length}`);
    }

    // ── Жёсткий замок Лиги: неоплата > grace → закрыть платформенный доступ ──
    // Решение Оли (разворот В1): кабинет = привилегия Лиги. access_status='paused_expired'
    // → bridge-триггер ставит status='suspended', RLS has_platform_access режет данные,
    // фронт (dataService._assertActive) кидает SUBSCRIPTION_EXPIRED → экран продления.
    // Реактивация — webhook оплаты вернёт access_status='active' (billingLogic handle_payment).
    // Grace единый с TG-киком (GRACE_DAYS) — платформа и чат закрываются синхронно.
    // Скоуп: leader/mentor/intern. Абитуриенты — своя модель (cohort+3мес, ниже). Exempt/manual не трогаем.
    // Идемпотентно: guard access_status='active' — повтор не перезапишет уже закрытых.
    const ligaLocked = await pool.query(
      `update public.profiles
          set access_status = 'paused_expired'
        where role in ('leader','mentor','intern')
          and access_status = 'active'
          and coalesce(auto_pause_exempt, false) = false
          and paid_until is not null
          and paid_until < now() - ($1 || ' days')::interval
       returning id, name`,
      [String(GRACE_DAYS)]
    );
    for (const row of ligaLocked.rows || []) {
      await pool.query(
        `insert into public.billing_webhook_logs
           (provider, event_name, external_id, payload_json, signature_valid, is_processed)
         values ($1, 'liga_access_expired', $2, $3::jsonb, true, true)
         on conflict (provider, external_id) where external_id is not null do nothing`,
        [
          PRODAMUS_PROVIDER_NAME,
          `liga_expired:${row.id}:${new Date().toISOString().slice(0, 10)}`,
          JSON.stringify({ profile_id: row.id, name: row.name, source: 'nightly_reconcile_hardlock' })
        ]
      );
    }
    if ((ligaLocked.rows || []).length > 0) {
      console.info(`[billing-reconcile ${BILLING_TIMEZONE}] LIGA HARD-LOCK paused_expired: ${ligaLocked.rows.length}`);
    }

    // ── Абитуриенты: авто-пауза по истечении доступа (cohort.end_date + 3мес) ──
    // Дата — из pvl_cohorts.end_date через shared PK (profiles.id=pvl_students.id).
    // Гард access_status='active': paused_manual НЕ трогаем (админ-бан выше), pending не перетираем.
    // Без когорты (нет строки в EXISTS) → не истекает. Идемпотентно: повтор не найдёт уже paused_expired.
    const applicantExpired = await pool.query(
      `update public.profiles p
          set access_status = 'paused_expired'
        where p.role = 'applicant'
          and p.access_status = 'active'
          and exists (
            select 1
              from public.pvl_students s
              join public.pvl_cohorts  c on c.id = s.cohort_id
             where s.id = p.id
               and (c.end_date + interval '3 months')::date < current_date
          )
       returning id`
    );
    for (const row of applicantExpired.rows || []) {
      // Аудит причины — billing_webhook_logs (тот же паттерн, что auto_pause_exempt_expired выше).
      await pool.query(
        `insert into public.billing_webhook_logs(
           provider, event_name, external_id, payload_json, signature_valid, is_processed
         )
         values ($1, 'applicant_access_expired', $2, $3::jsonb, true, true)
         on conflict (provider, external_id) where external_id is not null do nothing`,
        [
          PRODAMUS_PROVIDER_NAME,
          `applicant_expired:${row.id}:${new Date().toISOString().slice(0, 10)}`,
          JSON.stringify({ profile_id: row.id, source: 'nightly_reconcile', reason: 'cohort_end_plus_3m' })
        ]
      );
    }
    if ((applicantExpired.rows || []).length > 0) {
      console.info(`[applicant-reconcile ${BILLING_TIMEZONE}] paused_expired: ${applicantExpired.rows.length} applicants`);
    }
  } catch (e) {
    console.error('[billing-reconcile] failed', e);
  }
};

// ────────────────────────────────────────────────────────────────────
// ФАЗА 1b — POST /api/billing/checkout
// Auth: JWT (Bearer) → user_id из sub (anti-tamper: не из тела).
// Сумма — из billing_plans (не из тела). order_id (uuid) кладём в заказ
// провайдера → вебхук (1c) матчит детерминированно.
// Fail-safe песочницы: см. billingCheckout.mjs resolveYooKassaCreds/isSandbox.
// ────────────────────────────────────────────────────────────────────
const SANDBOX = isSandbox(process.env);

const handleBillingCheckout = async (req, res) => {
  // 1. Auth
  const token = bearerToken(req.headers.authorization);
  const claims = verifyJwtHS256(token, GARDEN_JWT_SECRET);
  if (!claims) return res.status(401).json({ error: 'unauthorized' });
  const userId = String(claims.sub);

  // 2. Валидация входа
  const planCode = String(req.body?.plan_code || '').trim();
  const provider = String(req.body?.provider || '').trim().toLowerCase();
  if (!['yookassa', 'prodamus'].includes(provider)) {
    return res.status(400).json({ error: 'bad_provider', detail: 'provider must be yookassa|prodamus' });
  }

  const client = await pool.connect();
  try {
    // 3. План из БД (источник цены; active)
    const planQ = await client.query(
      `select code, title, months, amount_rub from public.billing_plans where code = $1 and active = true`,
      [planCode]
    );
    if (planQ.rowCount === 0) return res.status(400).json({ error: 'plan_not_found' });
    const plan = planQ.rows[0];
    const amountRub = Number(plan.amount_rub);

    // 4. Профиль (email для чека / customer)
    const profQ = await client.query(`select email from public.profiles where id = $1`, [userId]);
    if (profQ.rowCount === 0) return res.status(404).json({ error: 'profile_not_found' });
    const email = String(profQ.rows[0].email || '').trim();

    // 5. Проверка доступности провайдера ДО создания заказа (не плодим orphan)
    let ykCreds = null;
    if (provider === 'yookassa') {
      ykCreds = resolveYooKassaCreds(process.env, SANDBOX);
      if (!ykCreds) {
        // YooKassa live выключена (YOOKASSA_LIVE_ENABLED≠1) — боевой вызов только
        // на осознанный самоплатёж. Тест-магазина нет. Live в дев-режиме не трогаем.
        return res.status(503).json({
          error: 'yookassa_disabled',
          detail: 'YooKassa live выключена: YOOKASSA_LIVE_ENABLED≠1 (боевой вызов включается явно под реальный платёж), тест-магазин отсутствует.'
        });
      }
      if (!email) return res.status(400).json({ error: 'email_required_for_receipt' });
    } else if (provider === 'prodamus') {
      if (!PRODAMUS_PAYFORM_URL) return res.status(503).json({ error: 'prodamus_unavailable', detail: 'PRODAMUS_PAYFORM_URL не задан' });
    }

    // 6. Создаём заказ (order_id = источник истины матча вебхука)
    const orderQ = await client.query(
      `insert into public.payment_orders(user_id, plan_code, provider, amount, months, status)
       values ($1, $2, $3, $4, $5, 'created') returning id`,
      [userId, plan.code, provider, amountRub, Number(plan.months)]
    );
    const orderId = orderQ.rows[0].id;

    // 7. Инициация у провайдера
    if (provider === 'yookassa') {
      const payload = buildYooKassaPayload({ orderId, userId, plan, amountRub, email, returnUrl: YOOKASSA_RETURN_URL });
      let resp, data;
      try {
        resp = await fetch(YOOKASSA_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotence-Key': String(orderId),
            Authorization: 'Basic ' + Buffer.from(`${ykCreds.shopId}:${ykCreds.secret}`).toString('base64')
          },
          body: JSON.stringify(payload)
        });
        data = await resp.json().catch(() => ({}));
      } catch (e) {
        await client.query(`update public.payment_orders set status='failed' where id=$1`, [orderId]);
        return res.status(502).json({ error: 'yookassa_request_failed', detail: e?.message || 'network' });
      }
      const confirmationUrl = data?.confirmation?.confirmation_url;
      if (!resp.ok || !confirmationUrl) {
        await client.query(`update public.payment_orders set status='failed' where id=$1`, [orderId]);
        return res.status(502).json({ error: 'yookassa_error', detail: data?.description || `http_${resp.status}` });
      }
      await client.query(`update public.payment_orders set external_payment_id=$2 where id=$1`, [orderId, String(data.id)]);
      return res.json({ ok: true, order_id: orderId, provider, sandbox: SANDBOX, live: ykCreds.live, url: confirmationUrl });
    }

    // prodamus
    const url = buildProdamusUrl({
      domain: PRODAMUS_PAYFORM_URL, orderId, userId, plan, amountRub, email,
      returnUrl: YOOKASSA_RETURN_URL, sandbox: SANDBOX
    });
    return res.json({ ok: true, order_id: orderId, provider, sandbox: SANDBOX, demo: SANDBOX, url });
  } catch (e) {
    return res.status(500).json({ error: 'checkout_failed', detail: e?.message || 'unknown' });
  } finally {
    client.release();
  }
};

app.post('/api/billing/checkout', handleBillingCheckout);

// ────────────────────────────────────────────────────────────────────
// ФАЗА 1e — ручная отметка оплаты (админ). POST /api/billing/admin/mark-paid
// Гвард requireAdmin: JWT → user_id → DB-lookup profiles.role='admin'
// (app-роль в JWT нет, берём из БД). Ручная оплата = аудит-строка
// payment_orders(provider='manual', status='paid') + applyPayment(until=явная дата).
// ────────────────────────────────────────────────────────────────────
const requireAdmin = async (req, res, next) => {
  const claims = verifyJwtHS256(bearerToken(req.headers.authorization), GARDEN_JWT_SECRET);
  if (!claims) return res.status(401).json({ error: 'unauthorized' });
  try {
    const q = await pool.query(`select role from public.profiles where id = $1`, [claims.sub]);
    if (q.rowCount === 0 || String(q.rows[0].role || '').toLowerCase() !== 'admin') {
      return res.status(403).json({ error: 'forbidden_admin_only' });
    }
  } catch (e) {
    return res.status(500).json({ error: 'auth_check_failed', detail: e?.message || 'unknown' });
  }
  req.adminId = claims.sub;
  return next();
};

const handleAdminMarkPaid = async (req, res) => {
  const adminId = req.adminId;
  const b = req.body || {};
  const userId = String(b.user_id || '').trim();
  const until = String(b.until_date || b.paid_until || '').trim();   // 'YYYY-MM-DD' — источник истины
  const months = b.months != null && b.months !== '' ? Number(b.months) : null;  // для отчётности (пресет)
  const planCode = b.plan_code ? String(b.plan_code).trim() : null;
  const amount = b.amount != null && b.amount !== '' ? Number(b.amount) : null;
  const note = b.note ? String(b.note).slice(0, 1000) : null;
  const paymentDate = String(b.payment_date || '').trim() || null;   // когда пришли деньги (может быть задним числом)
  const idemKey = String(b.idempotency_key || '').trim();

  if (!userId) return res.status(400).json({ error: 'user_id_required' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(until)) return res.status(400).json({ error: 'until_date_required', detail: 'until_date должна быть YYYY-MM-DD' });
  // «оплачено до» в прошлом бессмысленно (ночной reconcile сразу вернёт paused_expired) → отклоняем.
  if (until < new Date().toISOString().slice(0, 10)) return res.status(400).json({ error: 'until_date_in_past', detail: 'Дата «оплачено до» не может быть в прошлом' });
  if (!idemKey) return res.status(400).json({ error: 'idempotency_key_required' });
  if (amount != null && (!Number.isFinite(amount) || amount < 0)) return res.status(400).json({ error: 'bad_amount' });

  const client = await pool.connect();
  try {
    await client.query('begin');
    const prof = await client.query(`select id from public.profiles where id = $1`, [userId]);
    if (prof.rowCount === 0) { await client.query('rollback'); return res.status(404).json({ error: 'profile_not_found' }); }

    // идемпотентная аудит-строка
    const ins = await client.query(
      `insert into public.payment_orders
         (user_id, plan_code, provider, amount, months, status, marked_by, note, idempotency_key, paid_at, granted_until)
       values ($1, $2, 'manual', $3, $4, 'paid', $5, $6, $7,
               coalesce($8::timestamptz, now()), ($9::date + interval '1 day' - interval '1 second'))
       on conflict (idempotency_key) where idempotency_key is not null do nothing
       returning id`,
      [userId, planCode, amount, months, adminId, note, idemKey, paymentDate, until]
    );
    if (ins.rowCount === 0) {
      // тот же idempotency_key уже применён → no-op
      await client.query('commit');
      return res.json({ ok: true, duplicate: true });
    }
    const orderId = ins.rows[0].id;

    const applied = await applyPayment(client, {
      userId, until,
      meta: { event: 'manual_payment', provider: 'manual', orderId, payload: { source: 'admin_mark_paid', marked_by: adminId, note } }
    });
    if (!applied) { await client.query('rollback'); return res.status(500).json({ error: 'apply_failed' }); }

    await client.query('commit');
    return res.json({ ok: true, order_id: orderId, paid_until: applied.paidUntil, access_status: applied.accessStatus });
  } catch (e) {
    await client.query('rollback').catch(() => {});
    return res.status(500).json({ error: 'mark_paid_failed', detail: e?.message || 'unknown' });
  } finally {
    client.release();
  }
};

app.post('/api/billing/admin/mark-paid', requireAdmin, handleAdminMarkPaid);

// run once on startup and then every night
runNightlyExpiryReconcile();
setInterval(runNightlyExpiryReconcile, 24 * 60 * 60 * 1000);

// ── ФАЗА 3 — TG-доступ (gated by TG_ACCESS_MODE; off/пустой токен → полный no-op) ──
const tgAccessClient = TG_ACCESS_BOT_TOKEN ? makeTgAccessClient(TG_ACCESS_BOT_TOKEN) : null;
const tgAccessEnabled = Boolean(tgAccessClient) && TG_ACCESS_MODE !== 'off';
const tgAutoKick = String(TG_ACCESS_AUTOKICK) === '1';

const runTgAccess = async () => {
  if (!tgAccessEnabled) return;
  try {
    // paid_until<now вычисляется тут же — не зависит от порядка с expiry-reconcile
    const r = await runTgAccessReconcile({ mode: TG_ACCESS_MODE, pool, tg: tgAccessClient, autoKick: tgAutoKick });
    console.info(`[tg-access ${TG_ACCESS_MODE}] ` + JSON.stringify(r.counts));
  } catch (e) { console.error('[tg-access] failed', e); }
};
if (tgAccessEnabled) runTgAccess();
setInterval(runTgAccess, 24 * 60 * 60 * 1000);

// approve-on-request poller (стартует только при admit/live)
let tgJoinPoller = { stop() {} };
if (tgAccessEnabled) tgJoinPoller = startJoinPoller({ pool, tg: tgAccessClient, mode: TG_ACCESS_MODE });

// admin-эндпоинты (requireAdmin, HS256). Ручной run НЕ авто-кикает — только план + ADMIT.
app.post('/api/tg-access/run', requireAdmin, async (req, res) => {
  if (!tgAccessClient) return res.status(503).json({ error: 'tg_access_token_missing' });
  const mode = ['shadow', 'admit', 'live'].includes(req.query.mode) ? req.query.mode : TG_ACCESS_MODE;
  try {
    const r = await runTgAccessReconcile({ mode, pool, tg: tgAccessClient, autoKick: false });
    return res.json({ ok: true, mode, batch_id: r.batch_id, counts: r.counts, kick: r.kick, admit: r.admit });
  } catch (e) { return res.status(500).json({ error: 'run_failed', detail: e?.message }); }
});
app.get('/api/tg-access/planned', requireAdmin, async (req, res) => {
  const batchId = String(req.query.batch_id || '');
  const base = `select a.id, a.telegram_user_id, a.resource, a.action, a.reason, a.paid_until_snap, a.batch_id, p.name
                  from public.tg_access_actions a left join public.profiles p on p.id = a.profile_id
                 where a.status='planned'`;
  const q = batchId
    ? await pool.query(base + ` and a.batch_id=$1 order by a.id`, [batchId])
    : await pool.query(base + ` order by a.id`);
  return res.json({ planned: q.rows });
});
app.post('/api/tg-access/confirm-kicks', requireAdmin, async (req, res) => {
  if (!tgAccessClient) return res.status(503).json({ error: 'tg_access_token_missing' });
  const batchId = String((req.body || {}).batch_id || '');
  if (!batchId) return res.status(400).json({ error: 'batch_id_required' });
  try {
    const done = await executeActions(pool, tgAccessClient, { filter: 'kick', batchId });
    return res.json({ ok: true, batch_id: batchId, executed: done });
  } catch (e) { return res.status(500).json({ error: 'confirm_failed', detail: e?.message }); }
});

app.listen(Number(PORT), () => {
  const yk = resolveYooKassaCreds(process.env, SANDBOX)
    ? (yooKassaLiveEnabled(process.env) ? 'LIVE-armed' : 'test')
    : 'off';
  const checkout = `checkout[sandbox=${SANDBOX}, jwt=${GARDEN_JWT_SECRET ? 'on' : 'OFF'}, yk=${yk}, prodamus=${PRODAMUS_PAYFORM_URL ? 'on(demo=' + SANDBOX + ')' : 'off'}]`;
  const tgacc = `tg-access[${TG_ACCESS_MODE === 'off' ? 'off' : (TG_ACCESS_BOT_TOKEN ? TG_ACCESS_MODE : 'no-token')}${tgAutoKick ? ',autokick' : ''}]`;
  console.log(`Server started on :${PORT} (push=${pushEnabled ? 'on' : 'off'}, prodamus=${webhookEnabled ? 'on' : 'off'}, bothunter=${bothunterEnabled ? 'on' : 'off'}, ${checkout}, ${tgacc})`);
});
