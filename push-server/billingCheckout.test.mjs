import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import {
  isSandbox, verifyJwtHS256, bearerToken, resolveYooKassaCreds, yooKassaLiveEnabled,
  buildYooKassaPayload, buildProdamusUrl
} from './billingCheckout.mjs';

const signJwt = (payload, secret) => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64(payload);
  const sig = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
};

// ── isSandbox: fail-safe (по умолчанию ВКЛ) ──
test('isSandbox: пусто/1/true → sandbox; только 0/false → prod', () => {
  assert.equal(isSandbox({}), true);                       // не задан → песочница (fail-safe)
  assert.equal(isSandbox({ BILLING_SANDBOX: '1' }), true);
  assert.equal(isSandbox({ BILLING_SANDBOX: 'true' }), true);
  assert.equal(isSandbox({ BILLING_SANDBOX: '0' }), false);
  assert.equal(isSandbox({ BILLING_SANDBOX: 'false' }), false);
});

// ── JWT verify ──
test('verifyJwtHS256: валидная подпись → payload с sub', () => {
  const t = signJwt({ sub: 'user-1', exp: Math.floor(Date.now() / 1000) + 3600 }, 's3cr3t');
  const p = verifyJwtHS256(t, 's3cr3t');
  assert.equal(p?.sub, 'user-1');
});
test('verifyJwtHS256: чужой секрет → null', () => {
  const t = signJwt({ sub: 'u', exp: Math.floor(Date.now() / 1000) + 3600 }, 'right');
  assert.equal(verifyJwtHS256(t, 'wrong'), null);
});
test('verifyJwtHS256: истёкший exp → null', () => {
  const t = signJwt({ sub: 'u', exp: 100 }, 's');
  assert.equal(verifyJwtHS256(t, 's', 200), null);
});
test('verifyJwtHS256: нет sub → null', () => {
  const t = signJwt({ foo: 'bar', exp: Math.floor(Date.now() / 1000) + 3600 }, 's');
  assert.equal(verifyJwtHS256(t, 's'), null);
});
test('verifyJwtHS256: мусор/пусто → null', () => {
  assert.equal(verifyJwtHS256('', 's'), null);
  assert.equal(verifyJwtHS256('a.b', 's'), null);
  assert.equal(verifyJwtHS256('x.y.z', 's'), null);
});
test('bearerToken', () => {
  assert.equal(bearerToken('Bearer abc'), 'abc');
  assert.equal(bearerToken('abc'), '');
  assert.equal(bearerToken(undefined), '');
});

// ── FAIL-SAFE: YooKassa live дёргаем только при явном YOOKASSA_LIVE_ENABLED ──
const LIVE = { YOOKASSA_SHOP_ID: '1100657', YOOKASSA_SECRET_KEY: 'live_xxx' };

test('КЛЮЧЕВОЙ fail-safe: dev (sandbox=1) без LIVE_ENABLED → null (YooKassa live НЕ трогаем)', () => {
  assert.equal(resolveYooKassaCreds({ ...LIVE, BILLING_SANDBOX: '1' }, true), null);
});
test('fail-safe: даже prod-режим без LIVE_ENABLED → null (флаг обязателен)', () => {
  assert.equal(resolveYooKassaCreds({ ...LIVE }, false), null);
});
test('осознанный самоплатёж: LIVE_ENABLED=1 → live creds (даже в sandbox — Prodamus остаётся demo)', () => {
  const c = resolveYooKassaCreds({ ...LIVE, YOOKASSA_LIVE_ENABLED: '1' }, true);
  assert.deepEqual(c, { shopId: '1100657', secret: 'live_xxx', live: true });
});
test('LIVE_ENABLED=1 но кредов нет → null', () => {
  assert.equal(resolveYooKassaCreds({ YOOKASSA_LIVE_ENABLED: '1' }, false), null);
});
test('тест-магазин (если появится) в sandbox приоритетнее live', () => {
  const env = { ...LIVE, YOOKASSA_LIVE_ENABLED: '1', YOOKASSA_TEST_SHOP_ID: 'T1', YOOKASSA_TEST_SECRET_KEY: 'test_x' };
  assert.deepEqual(resolveYooKassaCreds(env, true), { shopId: 'T1', secret: 'test_x', live: false });
});
test('yooKassaLiveEnabled: 1/true/yes → true, иначе false', () => {
  assert.equal(yooKassaLiveEnabled({ YOOKASSA_LIVE_ENABLED: '1' }), true);
  assert.equal(yooKassaLiveEnabled({ YOOKASSA_LIVE_ENABLED: 'true' }), true);
  assert.equal(yooKassaLiveEnabled({}), false);
  assert.equal(yooKassaLiveEnabled({ YOOKASSA_LIVE_ENABLED: '0' }), false);
});

// ── YooKassa payload: receipt без НДС (vat_code=1), услуга, сумма из плана ──
test('buildYooKassaPayload: receipt/metadata/amount корректны', () => {
  const p = buildYooKassaPayload({
    orderId: 'ord-1', userId: 'u-1',
    plan: { code: '3m', title: 'Лига — 3 месяца', months: 3 },
    amountRub: 5500, email: 'a@b.ru', returnUrl: 'https://liga.skrebeyko.ru/#/subscription?status=ok'
  });
  assert.equal(p.amount.value, '5500.00');
  assert.equal(p.amount.currency, 'RUB');
  assert.equal(p.capture, true);
  assert.equal(p.confirmation.type, 'redirect');
  assert.equal(p.metadata.order_id, 'ord-1');
  assert.equal(p.metadata.user_id, 'u-1');
  assert.equal(p.metadata.plan_code, '3m');
  assert.equal(p.receipt.customer.email, 'a@b.ru');
  assert.equal(p.receipt.items[0].vat_code, 1);            // без НДС
  assert.equal(p.receipt.items[0].payment_subject, 'service');
  assert.equal(p.receipt.items[0].amount.value, '5500.00');
});

// ── Prodamus URL: embedded order_id, demo_mode только в песочнице ──
test('buildProdamusUrl: sandbox → demo_mode=1 + order_id embedded', () => {
  const url = buildProdamusUrl({
    domain: 'skrebeyko.payform.ru', orderId: 'ord-9', userId: 'u-9',
    plan: { code: '1m', title: 'Лига — 1 месяц', months: 1 },
    amountRub: 2000, email: 'x@y.ru', returnUrl: 'https://liga.skrebeyko.ru/#/subscription?status=ok', sandbox: true
  });
  const u = new URL(url);
  assert.equal(u.origin, 'https://skrebeyko.payform.ru');
  assert.equal(u.searchParams.get('order_id'), 'ord-9');
  assert.equal(u.searchParams.get('_param_user_id'), 'u-9');
  assert.equal(u.searchParams.get('products[0][price]'), '2000');
  assert.equal(u.searchParams.get('demo_mode'), '1');
});
test('buildProdamusUrl: prod → без demo_mode', () => {
  const url = buildProdamusUrl({
    domain: 'https://skrebeyko.payform.ru', orderId: 'o', userId: 'u',
    plan: { code: '6m', title: 'Лига — 6 месяцев', months: 6 }, amountRub: 10000, email: '', returnUrl: '', sandbox: false
  });
  assert.equal(new URL(url).searchParams.get('demo_mode'), null);
});
