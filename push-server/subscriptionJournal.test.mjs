// Журнал подписок: одна active-строка на человека. Главный сценарий — человек
// платит не тем способом, что в прошлый раз: строка должна ОБНОВИТЬСЯ, а не
// раздвоиться (так у четырнадцати человек накопились дубли к 2026-08-06).

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recordPayment, closeSubscription, RECORD_PAYMENT_SQL, CLOSE_SUBSCRIPTION_SQL,
} from './subscriptionJournal.mjs';

const USER = '11111111-2222-3333-4444-555555555555';
const OTHER = '99999999-8888-7777-6666-555555555555';

/**
 * Мини-подмена `pg`: держит subscriptions в массиве и исполняет два запроса
 * модуля. Инвариант «одна active на человека» воспроизводим индексом, как в базе:
 * попытка завести вторую active-строку — исключение, а не тихий дубль.
 */
function makeDb(rows = []) {
  let seq = rows.reduce((m, r) => Math.max(m, r.id || 0), 0);
  const log = [];
  const activeOf = (userId) => rows.find((r) => r.user_id === userId && r.status === 'active');

  const query = async (rawSql, params) => {
    const sql = rawSql.replace(/\s+/g, ' ').trim();
    log.push({ sql, params });

    if (sql.startsWith('insert into public.subscriptions')) {
      const [user_id, provider, provider_subscription_id, paid_until] = params;
      const live = activeOf(user_id);
      if (live) {                                  // ветка do update
        Object.assign(live, {
          provider,
          provider_subscription_id: provider_subscription_id ?? live.provider_subscription_id,
          paid_until,
          last_payment_at: 'now',
          ended_at: null,
        });
        return { rows: [{ id: live.id }], rowCount: 1 };
      }
      const row = {
        id: ++seq, user_id, provider, provider_subscription_id, status: 'active',
        paid_until, last_payment_at: 'now', ended_at: null,
      };
      rows.push(row);
      return { rows: [{ id: row.id }], rowCount: 1 };
    }

    if (sql.startsWith('update public.subscriptions')) {
      const [user_id, status, paid_until] = params;
      const live = activeOf(user_id);
      if (!live) return { rows: [], rowCount: 0 };
      Object.assign(live, { status, paid_until: paid_until ?? live.paid_until, ended_at: 'now' });
      return { rows: [{ id: live.id }], rowCount: 1 };
    }

    throw new Error(`Мини-db не знает запрос: ${sql}`);
  };

  return { query, rows, log };
}

const pay = (db, over = {}) => recordPayment(db, {
  userId: USER, provider: 'prodamus', providerSubscriptionId: null, paidUntil: '2026-09-06', ...over,
});

// ───────────────────────── форма запросов ─────────────────────────

test('ключ идентичности в SQL — человек, а не пара провайдер/подписка', () => {
  const sql = RECORD_PAYMENT_SQL.replace(/\s+/g, ' ');
  assert.match(sql, /on conflict \(user_id\) where status = 'active' do update/,
    'одна active-строка на человека');
  assert.doesNotMatch(sql, /on conflict \(provider, provider_subscription_id\)/,
    'старый неустойчивый ключ не должен вернуться');
  assert.match(sql, /provider = excluded\.provider/, 'провайдер — «чем оплачено в последний раз»');
  assert.match(sql, /provider_subscription_id = coalesce\(excluded\.provider_subscription_id/,
    'настоящий id подписки не затираем');
});

test('закрытие ищет строку по человеку, не по провайдеру', () => {
  const sql = CLOSE_SUBSCRIPTION_SQL.replace(/\s+/g, ' ');
  assert.match(sql, /where user_id = \$1 and status = 'active'/);
});

// ───────────────────────── поведение ─────────────────────────

test('оплата другим способом обновляет строку, а не рождает вторую', async () => {
  const db = makeDb();

  const first = await pay(db, { provider: 'prodamus', paidUntil: '2026-08-06' });
  const second = await pay(db, { provider: 'manual', paidUntil: '2026-09-06' });

  assert.equal(first, second, 'та же самая строка');
  assert.equal(db.rows.length, 1, 'ровно одна строка — это и есть починка');
  assert.equal(db.rows[0].provider, 'manual', 'провайдер — последний способ оплаты');
  assert.equal(db.rows[0].paid_until, '2026-09-06');
  assert.equal(db.rows[0].status, 'active');
});

test('дубль Соковниной: prodamus, потом ручная отметка — одна строка', async () => {
  const db = makeDb();
  await pay(db, { provider: 'prodamus', paidUntil: '2026-08-06T00:00:00.000Z' });
  await pay(db, { provider: 'manual', paidUntil: '2026-09-06T00:00:00.000Z' });

  const active = db.rows.filter((r) => r.status === 'active');
  assert.equal(active.length, 1);
  assert.equal(active[0].paid_until, '2026-09-06T00:00:00.000Z', 'дата от свежей оплаты');
});

test('две оплаты подряд одним провайдером тоже не дублируют', async () => {
  const db = makeDb();
  await pay(db, { paidUntil: '2026-08-16' });
  await pay(db, { paidUntil: '2026-09-16' });

  assert.equal(db.rows.length, 1, 'восемь из четырнадцати дублей были именно такими');
  assert.equal(db.rows[0].paid_until, '2026-09-16');
});

test('настоящий id подписки не затирается ручной оплатой', async () => {
  const db = makeDb();
  await pay(db, { provider: 'prodamus', providerSubscriptionId: 'sub_777' });
  await pay(db, { provider: 'manual', providerSubscriptionId: null });

  assert.equal(db.rows[0].provider_subscription_id, 'sub_777');
  assert.equal(db.rows[0].provider, 'manual');
});

test('пустая строка в id подписки — это отсутствие id, а не значение', async () => {
  const db = makeDb();
  await pay(db, { providerSubscriptionId: '   ' });
  assert.equal(db.rows[0].provider_subscription_id, null);
});

test('разные люди живут отдельно', async () => {
  const db = makeDb();
  await pay(db);
  await recordPayment(db, { userId: OTHER, provider: 'manual', paidUntil: '2026-10-01' });

  assert.equal(db.rows.length, 2);
  assert.equal(db.rows.filter((r) => r.status === 'active').length, 2);
});

// ───────────────────────── закрытие периода ─────────────────────────

test('закрытие гасит действующую строку и ставит ended_at', async () => {
  const db = makeDb();
  const id = await pay(db);

  const closed = await closeSubscription(db, { userId: USER, status: 'finished' });

  assert.equal(closed, id);
  assert.equal(db.rows[0].status, 'finished');
  assert.equal(db.rows[0].ended_at, 'now');
});

test('закрывать нечего — молчим, а не пишем закрытую строку в никуда', async () => {
  const db = makeDb();
  assert.equal(await closeSubscription(db, { userId: USER, status: 'finished' }), null);
  assert.equal(db.rows.length, 0);
});

test('закрытие ловит строку, заведённую другим провайдером', async () => {
  const db = makeDb();
  await pay(db, { provider: 'manual' });

  const closed = await closeSubscription(db, { userId: USER, status: 'deactivated' });

  assert.ok(closed, 'ищем по человеку, поэтому провайдер не важен');
  assert.equal(db.rows[0].status, 'deactivated');
});

test('после закрытия новая оплата открывает следующий период отдельной строкой', async () => {
  const db = makeDb();
  const first = await pay(db, { paidUntil: '2026-08-06' });
  await closeSubscription(db, { userId: USER, status: 'finished' });

  const second = await pay(db, { paidUntil: '2026-09-06' });

  assert.notEqual(second, first, 'журнал растёт: прошлый период остался, начался новый');
  assert.equal(db.rows.length, 2);
  assert.equal(db.rows.filter((r) => r.status === 'active').length, 1, 'active по-прежнему одна');
  assert.equal(db.rows.find((r) => r.id === first).status, 'finished', 'прошлое не удаляем');
});
