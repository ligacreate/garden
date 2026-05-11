import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROLE_LABELS,
  formatRoleLabel,
  parseDateParam,
  parseDaysParam,
  parsePriceRub,
  normalizeFormat,
  normalizeCity,
  normalizeDescription,
  rowToUpcomingItem,
  todayInMoscow,
  createUpcomingHandler,
  UPCOMING_CACHE_TTL_MS,
  UPCOMING_SQL
} from './upcomingApi.mjs';

test('formatRoleLabel: маппинг ролей', () => {
  assert.equal(formatRoleLabel('intern'), 'Стажёр');
  assert.equal(formatRoleLabel('leader'), 'Ведущая');
  assert.equal(formatRoleLabel('LEADER'), 'Ведущая');
  assert.equal(formatRoleLabel('mentor'), 'Ментор');
  assert.equal(formatRoleLabel('curator'), 'Куратор');
  assert.equal(formatRoleLabel('admin'), 'Главный садовник');
  assert.equal(formatRoleLabel('applicant'), 'Абитуриент');
  assert.equal(formatRoleLabel(null), 'Ведущая', 'null → fallback Ведущая');
  assert.equal(formatRoleLabel('unknown_role'), 'Ведущая', 'неизвестная роль → fallback');
});

test('parseDateParam: валидация ISO date', () => {
  assert.equal(parseDateParam('2026-05-06'), '2026-05-06');
  assert.equal(parseDateParam('  2026-05-06  '), '2026-05-06', 'trim пробелов');
  assert.equal(parseDateParam(''), todayInMoscow(), 'пусто → today МСК');
  assert.equal(parseDateParam(undefined), todayInMoscow(), 'undefined → today МСК');
  assert.equal(parseDateParam('not-a-date'), null);
  assert.equal(parseDateParam('2026/05/06'), null, 'формат через слеш');
  assert.equal(parseDateParam('2026-13-99'), null, 'невалидная дата');
});

test('parseDaysParam: валидация и default 8', () => {
  assert.equal(parseDaysParam(undefined), 8);
  assert.equal(parseDaysParam(null), 8);
  assert.equal(parseDaysParam(''), 8);
  assert.equal(parseDaysParam('8'), 8);
  assert.equal(parseDaysParam('1'), 1);
  assert.equal(parseDaysParam('60'), 60);
  assert.equal(parseDaysParam('100'), 60, 'верхний клэмп');
  assert.equal(parseDaysParam('0'), null, 'нижний край');
  assert.equal(parseDaysParam('-1'), null);
  assert.equal(parseDaysParam('abc'), null);
});

test('parsePriceRub: вытащить цифры из текста', () => {
  assert.equal(parsePriceRub('700'), 700);
  assert.equal(parsePriceRub('700 ₽'), 700);
  assert.equal(parsePriceRub('1200 рублей'), 1200);
  assert.equal(parsePriceRub('  1200  '), 1200);
  assert.equal(parsePriceRub('Бесплатно'), 0);
  assert.equal(parsePriceRub(null), 0);
  assert.equal(parsePriceRub(''), 0);
  assert.equal(parsePriceRub('1 000'), 1000, 'пробел внутри числа склеивается');
});

test('normalizeFormat: только online/offline', () => {
  assert.equal(normalizeFormat('online'), 'online');
  assert.equal(normalizeFormat('ONLINE'), 'online');
  assert.equal(normalizeFormat('offline'), 'offline');
  assert.equal(normalizeFormat('hybrid'), 'offline', 'hybrid сводим к offline');
  assert.equal(normalizeFormat(null), 'offline');
  assert.equal(normalizeFormat(''), 'offline');
});

test('normalizeCity: online → null, иначе сам город', () => {
  assert.equal(normalizeCity('Москва', 'offline'), 'Москва');
  assert.equal(normalizeCity('Москва', 'online'), null, 'online → null');
  assert.equal(normalizeCity('Онлайн', 'offline'), null, '«Онлайн» как город → null');
  assert.equal(normalizeCity('online', 'offline'), null);
  assert.equal(normalizeCity('', 'offline'), null);
  assert.equal(normalizeCity(null, 'offline'), null);
});

test('normalizeDescription: trim + сохраняем переносы + пусто → null', () => {
  assert.equal(normalizeDescription(null), null);
  assert.equal(normalizeDescription(undefined), null);
  assert.equal(normalizeDescription(''), null);
  assert.equal(normalizeDescription('   '), null, 'whitespace-only → null');
  assert.equal(normalizeDescription('  text  '), 'text', 'leading/trailing trim');
  assert.equal(
    normalizeDescription('Привет!\n\nВторая строка\nТретья.'),
    'Привет!\n\nВторая строка\nТретья.',
    'внутренние \\n сохраняются как есть'
  );
  assert.equal(
    normalizeDescription('\n\nПривет {host_name}\n\n'),
    'Привет {host_name}',
    'edge-of-string \\n обрезаются, шаблоны не трогаем'
  );
});

test('rowToUpcomingItem: соберём JSON-shape по контракту', () => {
  const row = {
    id: 149,
    starts_at_iso: '2026-05-06T19:00:00+03:00',
    title: 'Мой апрель: пиши, чувствуй, сохраняй',
    description: '  Первый абзац.\n\nВторой абзац.  ',
    meeting_format: 'online',
    city: 'Онлайн',
    price: '700 ₽',
    host_name: 'Яна Соболева',
    host_role: 'intern',
    host_photo: 'https://garden-media.s3.twcstorage.ru/avatars/x.jpg',
    recurring_cnt: '3'
  };
  assert.deepEqual(rowToUpcomingItem(row), {
    id: 'evt_149',
    starts_at: '2026-05-06T19:00:00+03:00',
    title: 'Мой апрель: пиши, чувствуй, сохраняй',
    description: 'Первый абзац.\n\nВторой абзац.',
    format: 'online',
    city: null,
    price_rub: 700,
    is_recurring: true,
    host: {
      name: 'Яна Соболева',
      role: 'Стажёр',
      photo_url: 'https://garden-media.s3.twcstorage.ru/avatars/x.jpg'
    }
  });
});

test('rowToUpcomingItem: пустое description → null', () => {
  const item = rowToUpcomingItem({
    id: 1, starts_at_iso: '2026-05-06T19:00:00+03:00', title: 'T',
    description: '', meeting_format: 'online', city: null, price: null,
    host_name: 'A', host_role: 'leader', host_photo: null, recurring_cnt: 1
  });
  assert.equal(item.description, null);
});

test('rowToUpcomingItem: offline + город + одна серия → is_recurring=false', () => {
  const row = {
    id: 200,
    starts_at_iso: '2026-05-10T11:00:00+03:00',
    title: 'Алхимия женщины',
    meeting_format: 'offline',
    city: 'Москва',
    price: '1200 рублей',
    host_name: 'Алина Петрова',
    host_role: 'leader',
    host_photo: null,
    recurring_cnt: 1
  };
  const item = rowToUpcomingItem(row);
  assert.equal(item.format, 'offline');
  assert.equal(item.city, 'Москва');
  assert.equal(item.price_rub, 1200);
  assert.equal(item.is_recurring, false);
  assert.equal(item.host.role, 'Ведущая');
  assert.equal(item.host.photo_url, null);
});

test('UPCOMING_SQL: содержит ключевые узлы', () => {
  // sanity-чек, что строку SQL не оборвало склейкой/копипастой
  assert.match(UPCOMING_SQL, /WITH window_events AS/);
  assert.match(UPCOMING_SQL, /recurring_groups AS/);
  assert.match(UPCOMING_SQL, /AT TIME ZONE 'Europe\/Moscow'/);
  assert.match(UPCOMING_SQL, /ORDER BY we\.starts_at ASC/);
  assert.match(UPCOMING_SQL, /JOIN public\.profiles p ON p\.id = m\.user_id/);
});

test('createUpcomingHandler: 400 на невалидный from', async () => {
  const fakePool = { query: async () => ({ rows: [] }) };
  const cache = new Map();
  const handler = createUpcomingHandler({ pool: fakePool, cache });
  const req = { query: { from: 'not-a-date' } };
  let status = 200;
  let payload = null;
  const res = {
    setHeader() {},
    status(s) { status = s; return this; },
    json(p) { payload = p; return this; }
  };
  await handler(req, res);
  assert.equal(status, 400);
  assert.match(payload?.error || '', /Invalid `from`/);
});

test('createUpcomingHandler: 400 на невалидный days', async () => {
  const fakePool = { query: async () => ({ rows: [] }) };
  const cache = new Map();
  const handler = createUpcomingHandler({ pool: fakePool, cache });
  const req = { query: { from: '2026-05-06', days: '0' } };
  let status = 200;
  let payload = null;
  const res = {
    setHeader() {},
    status(s) { status = s; return this; },
    json(p) { payload = p; return this; }
  };
  await handler(req, res);
  assert.equal(status, 400);
  assert.match(payload?.error || '', /Invalid `days`/);
});

test('createUpcomingHandler: cache MISS → HIT на повторе', async () => {
  let calls = 0;
  const fakePool = {
    query: async () => {
      calls += 1;
      return {
        rows: [
          {
            id: 1,
            starts_at_iso: '2026-05-06T19:00:00+03:00',
            title: 'Test',
            meeting_format: 'online',
            city: null,
            price: null,
            host_name: 'A',
            host_role: 'leader',
            host_photo: null,
            recurring_cnt: 1
          }
        ]
      };
    }
  };
  const cache = new Map();
  let nowVal = 1_000_000;
  const handler = createUpcomingHandler({ pool: fakePool, cache, now: () => nowVal });

  const headers = {};
  const res = () => ({
    setHeader(k, v) { headers[k] = v; },
    status() { return this; },
    json() { return this; }
  });

  await handler({ query: { from: '2026-05-06', days: 8 } }, res());
  assert.equal(calls, 1, 'первый вызов идёт в БД');
  assert.equal(headers['X-Cache'], 'MISS');

  await handler({ query: { from: '2026-05-06', days: 8 } }, res());
  assert.equal(calls, 1, 'второй вызов — из кеша, БД не дёрнули');
  assert.equal(headers['X-Cache'], 'HIT');

  // через 5 минут + 1 секунду кеш истекает
  nowVal += UPCOMING_CACHE_TTL_MS + 1000;
  await handler({ query: { from: '2026-05-06', days: 8 } }, res());
  assert.equal(calls, 2, 'после TTL снова идём в БД');
  assert.equal(headers['X-Cache'], 'MISS');
});

test('createUpcomingHandler: 503 на ошибку БД', async () => {
  const fakePool = { query: async () => { throw new Error('boom'); } };
  const cache = new Map();
  const handler = createUpcomingHandler({ pool: fakePool, cache });
  let status = 200;
  let payload = null;
  const res = {
    setHeader() {},
    status(s) { status = s; return this; },
    json(p) { payload = p; return this; }
  };
  await handler({ query: { from: '2026-05-06' } }, res);
  assert.equal(status, 503);
  assert.match(payload?.error || '', /Upstream unavailable/);
});

test('ROLE_LABELS: совпадает с utils/roles.js (с правкой ё)', () => {
  // Источник истины в проекте — utils/roles.js (без ё). Эндпоинт по
  // согласованной с пайплайном спецификации использует «Стажёр» с ё.
  assert.equal(ROLE_LABELS.intern, 'Стажёр');
  assert.equal(ROLE_LABELS.leader, 'Ведущая');
});
