// ФАЗА 1b — платформо-инициированный checkout (YooKassa РФ / Prodamus зарубеж).
// Чистые хелперы (тестируемые). Fetch/DB — в server.mjs handleBillingCheckout.
//
// Fail-safe (по требованию):
//   BILLING_SANDBOX=1 (или не '0') → песочница:
//     - Prodamus: payform + demo_mode=1 (без реального списания).
//     - YooKassa: бьём ТОЛЬКО по тест-магазину (YOOKASSA_TEST_*). Если тест-кредов
//       нет → YooKassa-путь ОТКЛЮЧЁН (resolveYooKassaCreds → null). НИКОГДА не
//       звоним на live-магазин 1100657 в песочнице.
//   BILLING_SANDBOX=0 → боевой: YooKassa live-креды, Prodamus без demo_mode.

import crypto from 'crypto';

// ── песочница по умолчанию ВКЛючена (fail-safe): выключается только явным '0'/'false'
export const isSandbox = (env) => {
  const v = String(env.BILLING_SANDBOX ?? '').trim().toLowerCase();
  return !(v === '0' || v === 'false');
};

// ── JWT HS256 verify (garden-auth JWT_SECRET). Возвращает payload или null.
export const verifyJwtHS256 = (token, secret, nowSec = Math.floor(Date.now() / 1000)) => {
  if (!token || !secret) return null;
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  let expected;
  try {
    expected = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  } catch {
    return null;
  }
  const a = Buffer.from(s);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (payload.exp && nowSec > Number(payload.exp)) return null;   // истёк
  if (payload.nbf && nowSec < Number(payload.nbf)) return null;   // ещё не активен
  if (!payload.sub) return null;                                   // нет user_id
  return payload;
};

export const bearerToken = (authHeader) => {
  const raw = String(authHeader || '');
  return raw.startsWith('Bearer ') ? raw.slice(7).trim() : '';
};

// ── Выбор YooKassa-кредов с fail-safe. Возвращает {shopId, secret, live} или null.
//
// Модель (тест-магазина у Ольги НЕТ; live дёргаем только на осознанный клик):
//   1. Песочница + тест-магазин (YOOKASSA_TEST_*) — если вдруг появится. Сейчас инертно.
//   2. LIVE — ТОЛЬКО при явном YOOKASSA_LIVE_ENABLED=1 (осознанный боевой вызов).
//      Флаг НЕЗАВИСИМ от BILLING_SANDBOX: во время разработки он выключен →
//      YooKassa live НЕ дёргается вообще (эндпоинт вернёт 503). Prodamus при этом
//      свободно тестируется в demo (BILLING_SANDBOX=1). Боевой YooKassa-вызов
//      случается только когда флаг явно включён под реальный самоплатёж.
//   3. Иначе → null (путь отключён).
export const yooKassaLiveEnabled = (env) =>
  ['1', 'true', 'yes'].includes(String(env.YOOKASSA_LIVE_ENABLED || '').trim().toLowerCase());

export const resolveYooKassaCreds = (env, sandbox) => {
  if (sandbox) {
    const tShop = String(env.YOOKASSA_TEST_SHOP_ID || '').trim();
    const tSecret = String(env.YOOKASSA_TEST_SECRET_KEY || '').trim();
    if (tShop && tSecret) return { shopId: tShop, secret: tSecret, live: false };
    // тест-магазина нет → в live НЕ проваливаемся автоматически; см. явный gate ниже.
  }
  if (yooKassaLiveEnabled(env)) {
    const shopId = String(env.YOOKASSA_SHOP_ID || '').trim();
    const secret = String(env.YOOKASSA_SECRET_KEY || '').trim();
    if (shopId && secret) return { shopId, secret, live: true };
  }
  return null;
};

// ── Тело запроса YooKassa /v3/payments (с receipt: без НДС vat_code=1, услуга).
export const buildYooKassaPayload = ({ orderId, userId, plan, amountRub, email, returnUrl }) => {
  const value = Number(amountRub).toFixed(2);
  const payload = {
    amount: { value, currency: 'RUB' },
    capture: true,
    confirmation: { type: 'redirect', return_url: returnUrl },
    description: `Лига развивающих практиков — ${plan.title}`.slice(0, 128),
    metadata: {
      user_id: String(userId),
      order_id: String(orderId),
      plan_code: String(plan.code),
      months: String(plan.months)
    },
    receipt: {
      customer: { email: String(email) },
      items: [{
        description: String(plan.title).slice(0, 128),
        quantity: '1.00',
        amount: { value, currency: 'RUB' },
        vat_code: 1,                 // без НДС
        payment_subject: 'service',  // услуга
        payment_mode: 'full_payment'
      }]
    }
  };
  return payload;
};

// ── Prodamus payform-ссылка с embedded order_id (+ demo_mode=1 в песочнице).
// ВАЖНО (по recon реального payload): Prodamus ПЕРЕЗАПИСЫВАЕТ нативный order_id
// своим внутренним номером. Поэтому наш order_id кладём в КАСТОМ-параметр
// `_param_order_id` — кастомные `_param_*` эхо-возвращаются в вебхук (доказано:
// TargetHunter'ский `_param_custom` вернулся как есть). Матч в 1c — по _param_order_id.
export const buildProdamusUrl = ({ domain, orderId, userId, plan, amountRub, email, returnUrl, sandbox }) => {
  const base = String(domain || '').replace(/\/+$/, '');
  const u = new URL(base.startsWith('http') ? base : `https://${base}`);
  const q = u.searchParams;
  q.set('order_id', String(orderId));            // нативный (Prodamus перезапишет) — оставляем для читаемости
  q.set('products[0][name]', plan.title);
  q.set('products[0][price]', String(amountRub));
  q.set('products[0][quantity]', '1');
  if (email) q.set('customer_email', String(email));
  if (returnUrl) {
    q.set('urlReturn', returnUrl);
    q.set('urlSuccess', returnUrl);
  }
  q.set('_param_order_id', String(orderId));     // ← источник истины матча вебхука (round-trip)
  q.set('_param_user_id', String(userId));       // belt-and-suspenders
  q.set('_param_plan', String(plan.code));
  q.set('do', 'pay');
  if (sandbox) q.set('demo_mode', '1');
  return u.toString();
};
