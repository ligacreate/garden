import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { pickSignatureSource, verifyProdamusSignature, buildProdamusCanonical } from './prodamusVerify.mjs';

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

// BUG-PRODAMUS-SIGNATURE-ALGO: настоящий Prodamus algorithm =
// recursive ksort + JSON.stringify (UNESCAPED_UNICODE | UNESCAPED_SLASHES) + HMAC-SHA256.

test('buildProdamusCanonical: ключи рекурсивно отсортированы, signature/sign/hash вырезаны', () => {
  const body = {
    z: 1,
    a: 2,
    nested: { c: 3, a: 4, sub: { z: 'тест', a: '/' } },
    signature: 'should-be-stripped',
    sign: 'also-stripped',
    hash: 'also-stripped'
  };
  const canonical = buildProdamusCanonical(body);
  // a < nested < z; nested: a < c < sub; sub: a < z; кириллица не экранирована, / без эскейпа.
  assert.equal(canonical, '{"a":2,"nested":{"a":4,"c":3,"sub":{"a":"/","z":"тест"}},"z":1}');
  assert(!canonical.includes('signature'));
  assert(!canonical.includes('should-be-stripped'));
});

test('buildProdamusCanonical: массивы сортируют ключи внутри объектов, порядок элементов сохраняется', () => {
  const body = { products: [{ name: 'A', price: '1', sum: '1', quantity: '1' }, { name: 'B', price: '2', sum: '2', quantity: '1' }] };
  const canonical = buildProdamusCanonical(body);
  // ключи внутри элементов отсортированы (name, price, quantity, sum), сами элементы в исходном порядке.
  assert.equal(canonical, '{"products":[{"name":"A","price":"1","quantity":"1","sum":"1"},{"name":"B","price":"2","quantity":"1","sum":"2"}]}');
});

test('verifyProdamusSignature: настоящий Prodamus алгоритм на sandbox-подобном payload (HMAC-SHA256(canonical))', () => {
  const secret = 'test-prodamus-secret';
  const body = {
    date: '2026-05-15T00:00:00+03:00',
    order_id: '1',
    order_num: 'test',
    domain: 'skrebeyko.payform.ru',
    sum: '1000.00',
    customer_phone: '+79999999999',
    customer_email: 'email@domain.com',
    customer_extra: 'тест',
    payment_type: 'Пластиковая карта Visa, MasterCard, МИР',
    commission: '3.5',
    commission_sum: '35.00',
    attempt: '1',
    sys: 'test',
    products: [
      { name: 'Доступ к обучающим материалам', price: '1000.00', quantity: '1', sum: '1000.00' }
    ],
    payment_status: 'success',
    payment_status_description: 'Успешная оплата'
  };
  const canonical = buildProdamusCanonical(body);
  const expectedSig = crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');

  // Имитируем то, что делает handleProdamusWebhook: header Sign → pickSignatureSource → verify.
  const merged = pickSignatureSource(body, { sign: expectedSig });
  assert.equal(verifyProdamusSignature(merged, secret), true,
    'sig из header (Prodamus algorithm) должен пройти verify через pickSignatureSource');
});

test('verifyProdamusSignature: Prodamus алгоритм — body без signature/sign/hash тоже OK', () => {
  // Подпись считается ПО ТЕЛУ БЕЗ signature, поэтому добавление signature через
  // pickSignatureSource не должно ломать canonical (он сам её вырезает).
  const secret = 's';
  const body = { a: 1, b: 'x' };
  const canonical = buildProdamusCanonical(body);
  assert.equal(canonical, '{"a":1,"b":"x"}');
  const sig = crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
  // С добавлением signature в body — canonical всё равно тот же (signature вырезается).
  const withSig = { ...body, signature: sig };
  assert.equal(buildProdamusCanonical(withSig), canonical);
  assert.equal(verifyProdamusSignature(withSig, secret), true);
});
