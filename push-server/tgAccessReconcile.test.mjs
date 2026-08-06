// Прогон TG-доступа: наблюдаемость ошибок и безмутационность shadow.
// Ошибки getChatMember нужно видеть содержимым — по счётчику нельзя отличить
// троттлинг Telegram (429) от человека, которого чат не знает (400).

import test from 'node:test';
import assert from 'node:assert/strict';
import { runTgAccessReconcile } from './tgAccessReconcile.mjs';

const NOW = new Date('2026-08-06T09:00:00.000Z');

/** Мини-pool: отдаёт два справочных запроса reconcile, любой другой — провал теста. */
function makePool(known) {
  const log = [];
  const query = async (rawSql, params = []) => {
    const sql = rawSql.replace(/\s+/g, ' ').trim();
    log.push({ sql, params });
    if (sql.startsWith('select id, name, role, telegram_user_id')) return { rows: known, rowCount: known.length };
    if (sql.startsWith('select telegram_user_id, role, name')) return { rows: known, rowCount: known.length };
    throw new Error(`Мини-pool не знает запрос: ${sql}`);
  };
  return { query, log };
}

/** Клиент TG, который на заданных ресурсах отвечает ошибкой. */
function makeTg(failures = {}) {
  const calls = [];
  return {
    calls,
    async getChatMember(chatId, uid) {
      calls.push({ chatId, uid });
      const fail = failures[`${chatId}:${uid}`];
      if (fail) return { ok: false, error_code: fail.code, description: fail.text };
      return { ok: true, result: { status: 'member' } };
    },
  };
}

const person = (over = {}) => ({
  id: 'p1', name: 'Елена Соковнина', role: 'leader', telegram_user_id: 339004999,
  paid_until: '2026-09-06T00:00:00.000Z', access_status: 'active', exempt: false, ...over,
});

function makeLogger() {
  const info = [];
  const warn = [];
  return { info: (m) => info.push(m), warn: (m) => warn.push(m), lines: { info, warn } };
}

test('ошибки пишутся содержимым: имя, uid, ресурс и текст ответа Telegram', async () => {
  const p = person();
  const pool = makePool([p]);
  const tg = makeTg({
    [`-1002377682177:${p.telegram_user_id}`]: { code: 429, text: 'Too Many Requests: retry after 5' },
    [`-1002432957741:${p.telegram_user_id}`]: { code: 400, text: 'Bad Request: member not found' },
  });
  const logger = makeLogger();

  const r = await runTgAccessReconcile({ mode: 'shadow', pool, tg, now: NOW, logger });

  assert.equal(r.counts.errors, 2);
  const line = logger.lines.warn.join('\n');
  assert.match(line, /errors:/);
  assert.match(line, /Елена Соковнина/, 'по имени понятно, о ком речь');
  assert.match(line, /339004999/);
  assert.match(line, /channel/);
  assert.match(line, /chat/);
  assert.match(line, /429:Too Many Requests: retry after 5/, 'троттлинг видно текстом');
  assert.match(line, /400:Bad Request: member not found/, 'и его отличить от «чат не знает человека»');
});

test('чистый прогон не пишет строку об ошибках', async () => {
  const pool = makePool([person()]);
  const logger = makeLogger();

  const r = await runTgAccessReconcile({ mode: 'shadow', pool, tg: makeTg(), now: NOW, logger });

  assert.equal(r.counts.errors, 0);
  assert.equal(logger.lines.warn.length, 0);
  assert.equal(logger.lines.info.length, 1, 'счётчики по-прежнему одной строкой');
});

test('логгер без warn не роняет прогон — падаем на info', async () => {
  const p = person();
  const pool = makePool([p]);
  const tg = makeTg({ [`-1002377682177:${p.telegram_user_id}`]: { code: 429, text: 'Too Many Requests' } });
  const info = [];

  await runTgAccessReconcile({ mode: 'shadow', pool, tg, now: NOW, logger: { info: (m) => info.push(m) } });

  assert.equal(info.length, 2);
  assert.match(info[1], /errors:.*429:Too Many Requests/);
});

test('shadow не ходит в базу за записью — только два справочных select', async () => {
  const pool = makePool([person()]);

  const r = await runTgAccessReconcile({ mode: 'shadow', pool, tg: makeTg(), now: NOW, logger: { info() {} } });

  assert.equal(pool.log.length, 2);
  assert.ok(pool.log.every((q) => q.sql.startsWith('select')), 'ни одной мутации');
  assert.equal(r.batch_id, null);
  assert.deepEqual(r.executed, { admit: [], kick: [] });
});

test('ошибка getChatMember не превращается в кик: inChat остаётся false', async () => {
  const p = person({ paid_until: '2026-07-01T00:00:00.000Z' }); // истёк далеко за grace
  const pool = makePool([p]);
  const tg = makeTg({
    [`-1002377682177:${p.telegram_user_id}`]: { code: 429, text: 'Too Many Requests' },
    [`-1002432957741:${p.telegram_user_id}`]: { code: 429, text: 'Too Many Requests' },
  });

  const r = await runTgAccessReconcile({ mode: 'shadow', pool, tg, now: NOW, logger: { info() {}, warn() {} } });

  assert.equal(r.counts.kick, 0, 'кик требует подтверждённого присутствия — механизм падает в безопасную сторону');
  assert.equal(r.counts.errors, 2);
});
