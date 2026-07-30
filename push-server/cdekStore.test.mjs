import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createCdekStore } from './cdekStore.mjs';

const quiet = { info() {}, warn() {}, error() {} };
const DAY = 24 * 60 * 60 * 1000;

function tempFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdek-store-'));
  return path.join(dir, 'nested', 'cdek-orders.json');
}

test('запись переживает перезапуск', () => {
  const filePath = tempFile();
  const first = createCdekStore({ filePath, logger: quiet });
  first.upsert('10296250133', { status: 'CREATED', track: '10296250133' });

  const second = createCdekStore({ filePath, logger: quiet });
  assert.equal(second.get('10296250133').status, 'CREATED');
  assert.equal(second.size, 1);
});

test('upsert дополняет запись, а не затирает', () => {
  const store = createCdekStore({ filePath: tempFile(), logger: quiet });
  store.upsert('1', { recipient: 'Иванова', phone: '+79990000000' });
  store.upsert('1', { status: 'DELIVERED' });

  assert.deepEqual(store.get('1'), {
    recipient: 'Иванова',
    phone: '+79990000000',
    status: 'DELIVERED'
  });
});

test('битый файл не мешает сервису стартовать', () => {
  const filePath = tempFile();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, '{ это не json');

  const store = createCdekStore({ filePath, logger: quiet });
  assert.equal(store.size, 0);
  store.upsert('1', { status: 'CREATED' });
  assert.equal(createCdekStore({ filePath, logger: quiet }).get('1').status, 'CREATED');
});

test('чистка убирает только закрытые и только старые', () => {
  const store = createCdekStore({ filePath: tempFile(), keepDays: 90, logger: quiet });
  const now = Date.parse('2026-07-30T09:00:00Z');
  const old = new Date(now - 100 * DAY).toISOString();
  const fresh = new Date(now - 2 * DAY).toISOString();

  store.upsert('старый-закрытый', { closed: true, updatedAt: old });
  store.upsert('старый-открытый', { closed: false, updatedAt: old });
  store.upsert('свежий-закрытый', { closed: true, updatedAt: fresh });

  assert.equal(store.prune(now), 1);
  assert.equal(store.get('старый-закрытый'), null);
  assert.equal(store.get('старый-открытый').closed, false);
  assert.ok(store.get('свежий-закрытый'));
});

test('файл реестра не читается посторонними', () => {
  const filePath = tempFile();
  createCdekStore({ filePath, logger: quiet }).upsert('1', { status: 'CREATED' });
  assert.equal(fs.statSync(filePath).mode & 0o077, 0);
});

test('всё перечисляется вместе с ключом', () => {
  const store = createCdekStore({ filePath: tempFile(), logger: quiet });
  store.upsert('a', { status: 'CREATED' });
  store.upsert('b', { status: 'DELIVERED' });
  assert.deepEqual(store.all().map((r) => r.key).sort(), ['a', 'b']);
});
