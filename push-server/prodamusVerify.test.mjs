import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { pickSignatureSource, verifyProdamusSignature } from './prodamusVerify.mjs';

// pickSignatureSource — чисто функциональная логика подмены источника подписи.

test('pickSignatureSource: header Sign подкладывается в payload.signature если в теле нет', () => {
  const body = { event: 'auto_payment', email: 'a@b.c' };
  const headers = { sign: 'abcdef0123456789' };
  const merged = pickSignatureSource(body, headers);
  assert.equal(merged.signature, 'abcdef0123456789');
  assert.equal(merged.event, 'auto_payment');
  assert.notEqual(merged, body, 'should return new object');
});

test('pickSignatureSource: header Signature тоже работает (case-insensitive Express нормализует)', () => {
  const body = { event: 'finish' };
  const headers = { signature: 'fff' };
  const merged = pickSignatureSource(body, headers);
  assert.equal(merged.signature, 'fff');
});

test('pickSignatureSource: body.signature имеет приоритет — header игнорируется', () => {
  const body = { event: 'auto_payment', signature: 'from-body' };
  const headers = { sign: 'from-header' };
  const merged = pickSignatureSource(body, headers);
  assert.equal(merged.signature, 'from-body');
  assert.equal(merged, body, 'should return original body without copy');
});

test('pickSignatureSource: ни в теле ни в header — возвращает body как есть', () => {
  const body = { event: 'payment_success' };
  const merged = pickSignatureSource(body, {});
  assert.equal(merged, body);
});

test('pickSignatureSource: пустой/невалидный body → defensive', () => {
  assert.deepEqual(pickSignatureSource(null, { sign: 'x' }), {});
  assert.deepEqual(pickSignatureSource(undefined, { sign: 'x' }), {});
});

// End-to-end: реальный HMAC-SHA256 в header → verify проходит.

test('e2e: HMAC-SHA256(sortedBase) в header Sign + pickSignatureSource → verify true', () => {
  const secret = 'test-secret-key';
  const body = { event: 'auto_payment', email: 'user@example.com', order_id: 'ord-1' };

  // Воспроизводим логику buildSortedBase из prodamusVerify.mjs.
  const sortedBase = Object.entries(body)
    .filter(([k]) => k !== 'signature' && k !== 'sign' && k !== 'hash')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v))}`)
    .join(';');
  const validSig = crypto.createHmac('sha256', secret).update(sortedBase, 'utf8').digest('hex');

  const headers = { sign: validSig };
  const merged = pickSignatureSource(body, headers);
  assert.equal(verifyProdamusSignature(merged, secret), true,
    'sig from header через pickSignatureSource должен пройти verify');
});

test('e2e: невалидная подпись в header → verify false', () => {
  const body = { event: 'finish', email: 'x@y.z' };
  const merged = pickSignatureSource(body, { sign: 'deadbeef' });
  assert.equal(verifyProdamusSignature(merged, 'real-secret'), false);
});
