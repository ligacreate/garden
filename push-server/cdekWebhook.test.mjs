import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCdekWebhookHandler,
  resolveCdekConfig,
  tokenMatches,
  digestStatuses,
  extractOrderFacts,
  formatOrderMessage,
  stripCustomsTranslation,
  formatWaitingMessage,
  processCdekEvent,
  scanWaitingOrders
} from './cdekWebhook.mjs';

const FULL_ENV = {
  CDEK_WEBHOOK_TOKEN: 'secret-path',
  CDEK_CLIENT_ID: 'id',
  CDEK_CLIENT_SECRET: 'secret',
  CDEK_NOTIFY_BOT_TOKEN: 'bot:123',
  CDEK_NOTIFY_CHAT_ID: '42'
};

// Реальный ответ СДЭК по заказу 10296250133 (Фергана, 18.07.2026), урезанный.
const ORDER = {
  cdek_number: '10296250133',
  number: 'UZ-2026-001',
  recipient: { name: 'Эргашева Дилсуз Илхомовна', phones: [{ number: '998902720438' }] },
  to_location: { city: 'Фергана' },
  packages: [
    { items: [{ name: 'Блокнот бумажный «Женщины разумной» / Paper notebook', amount: 1 }] }
  ],
  // СДЭК отдаёт статусы от свежих к старым.
  statuses: [
    { code: 'CREATED', date_time: '2026-07-30T08:30:00+0000' },
    { code: 'ACCEPTED', date_time: '2026-07-30T08:29:58+0000' }
  ]
};

/** Заказ с произвольной историей — statuses задаются от свежих к старым. */
function orderWith(...statuses) {
  return { ...ORDER, statuses };
}

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.parse('2026-07-30T09:00:00Z');

test('модуль спит, пока не заданы все ключи', () => {
  assert.equal(resolveCdekConfig({}).enabled, false);
  assert.equal(resolveCdekConfig({ CDEK_WEBHOOK_TOKEN: 'x' }).enabled, false);
  assert.equal(resolveCdekConfig(FULL_ENV).enabled, true);
});

test('пороги и списки статусов по умолчанию', () => {
  const cfg = resolveCdekConfig(FULL_ENV);
  assert.deepEqual(cfg.statuses, ['CREATED']);
  assert.deepEqual(cfg.waitingStatuses, ['ACCEPTED_AT_PICK_UP_POINT', 'POSTOMAT_POSTED']);
  assert.equal(cfg.waitingHours, 24);
  assert.ok(cfg.closedStatuses.includes('DELIVERED'));
  // Списки уточняются настройкой, без правки кода.
  assert.deepEqual(
    resolveCdekConfig({ ...FULL_ENV, CDEK_WAITING_STATUSES: 'A, B' }).waitingStatuses,
    ['A', 'B']
  );
});

test('токен в пути сверяется точно', () => {
  assert.equal(tokenMatches('secret-path', 'secret-path'), true);
  assert.equal(tokenMatches('secret-pat', 'secret-path'), false);
  assert.equal(tokenMatches('', 'secret-path'), false);
  assert.equal(tokenMatches(undefined, 'secret-path'), false);
  // Пустой ожидаемый токен не должен открывать дверь.
  assert.equal(tokenMatches('', ''), false);
});

test('состояние читается по истории статусов, а не по последнему', () => {
  const cfg = resolveCdekConfig(FULL_ENV);
  // Живая история заказа 10286887892 (30.07): доехал и лёг в пункт выдачи.
  const digest = digestStatuses(
    orderWith(
      { code: 'ACCEPTED_AT_PICK_UP_POINT', date_time: '2026-07-30T07:59:51+0000' },
      { code: 'ACCEPTED_IN_RECIPIENT_CITY', date_time: '2026-07-30T07:09:12+0000' },
      { code: 'SENT_TO_RECIPIENT_CITY', date_time: '2026-07-30T05:52:11+0000' },
      { code: 'CREATED', date_time: '2026-07-30T05:00:00+0000' }
    ),
    cfg,
    T0
  );
  assert.equal(digest.status, 'ACCEPTED_AT_PICK_UP_POINT');
  assert.equal(digest.closed, false);
  assert.equal(digest.isNew, true);
  // Час лежания взят у СДЭК, а не по времени прихода вебхука.
  assert.equal(digest.waitingSince, '2026-07-30T07:59:51.000Z');
});

test('движение посылки не делает заказ новым и не запускает часы', () => {
  const digest = digestStatuses(
    orderWith({ code: 'SENT_TO_RECIPIENT_CITY', date_time: '2026-07-30T05:52:11+0000' }),
    resolveCdekConfig(FULL_ENV),
    T0
  );
  assert.equal(digest.isNew, false);
  assert.equal(digest.waitingSince, null);
  assert.equal(digest.closed, false);
});

test('старый заказ, впервые увиденный сейчас, новым не считается', () => {
  const cfg = resolveCdekConfig(FULL_ENV);
  const свежий = digestStatuses(orderWith({ code: 'CREATED', date_time: '2026-07-30T05:00:00+0000' }), cfg, T0);
  const давний = digestStatuses(orderWith({ code: 'CREATED', date_time: '2026-07-18T17:40:29+0000' }), cfg, T0);
  assert.equal(свежий.isNew, true);
  assert.equal(давний.isNew, false);
});

test('забранный заказ закрыт, даже если в истории есть пункт выдачи', () => {
  const digest = digestStatuses(
    orderWith(
      { code: 'DELIVERED', date_time: '2026-07-30T08:00:00+0000' },
      { code: 'ACCEPTED_AT_PICK_UP_POINT', date_time: '2026-07-29T08:00:00+0000' }
    ),
    resolveCdekConfig(FULL_ENV),
    T0
  );
  assert.equal(digest.closed, true);
});

test('из ответа СДЭК достаём получателя, телефон и состав', () => {
  assert.deepEqual(extractOrderFacts(ORDER), {
    recipient: 'Эргашева Дилсуз Илхомовна',
    phone: '+998902720438',
    city: 'Фергана',
    items: ['Блокнот бумажный «Женщины разумной»'],
    track: '10296250133'
  });
});

test('таможенный перевод из названия убирается', () => {
  assert.equal(
    stripCustomsTranslation('Блокнот бумажный «Женщины разумной» / Paper notebook'),
    'Блокнот бумажный «Женщины разумной»'
  );
  // Русский хвост — часть имени, не перевод.
  assert.equal(stripCustomsTranslation('Блокнот / ежедневник'), 'Блокнот / ежедневник');
  assert.equal(stripCustomsTranslation('Блокнот женщины разумной'), 'Блокнот женщины разумной');
  assert.equal(stripCustomsTranslation('A / B / Notebook'), 'A / B');
  assert.equal(stripCustomsTranslation(''), '');
  assert.equal(stripCustomsTranslation(undefined), '');
});

test('формат нового заказа: что внутри и трек', () => {
  assert.equal(
    formatOrderMessage(ORDER, {}),
    'Новый заказ:\nБлокнот бумажный «Женщины разумной»\n10296250133'
  );
});

test('количество подписывается только когда штук больше одной', () => {
  const many = {
    cdek_number: '10296128627',
    packages: [{ items: [{ name: 'Блокнот женщины разумной', amount: 2 }] }]
  };
  assert.equal(formatOrderMessage(many, {}), 'Новый заказ:\nБлокнот женщины разумной × 2\n10296128627');
});

test('несколько позиций — каждая своей строкой', () => {
  const mixed = {
    cdek_number: '1',
    packages: [{ items: [{ name: 'Блокнот', amount: 1 }, { name: 'Открытка', amount: 3 }] }]
  };
  assert.equal(formatOrderMessage(mixed, {}), 'Новый заказ:\nБлокнот\nОткрытка × 3\n1');
});

test('пустой состав и отсутствующий трек не роняют сообщение', () => {
  assert.equal(formatOrderMessage({}, { cdek_number: '999' }), 'Новый заказ:\nсостав не пришёл\n999');
  assert.equal(formatOrderMessage({}, {}), 'Новый заказ:\nсостав не пришёл\nтрек ещё не присвоен');
});

test('незабранный заказ: получатель, телефон, состав, трек', () => {
  const record = {
    recipient: 'Эргашева Дилсуз Илхомовна',
    phone: '+998902720438',
    items: ['Блокнот бумажный «Женщины разумной»'],
    track: '10296250133',
    waitingSince: new Date(T0 - DAY).toISOString()
  };
  assert.equal(
    formatWaitingMessage(record, T0),
    'Не забирают заказ, 1 день в пункте выдачи:\n' +
      'Эргашева Дилсуз Илхомовна\n' +
      '+998902720438\n' +
      'Блокнот бумажный «Женщины разумной»\n' +
      '10296250133'
  );
});

test('дни склоняются по-русски', () => {
  const rec = (days) => ({ waitingSince: new Date(T0 - days * DAY).toISOString(), track: 'x' });
  assert.match(formatWaitingMessage(rec(1), T0), /1 день/);
  assert.match(formatWaitingMessage(rec(3), T0), /3 дня/);
  assert.match(formatWaitingMessage(rec(5), T0), /5 дней/);
  assert.match(formatWaitingMessage(rec(11), T0), /11 дней/);
  assert.match(formatWaitingMessage(rec(21), T0), /21 день/);
});

test('пропавшие данные не мешают напоминанию уйти', () => {
  assert.equal(
    formatWaitingMessage({ track: '777', waitingSince: new Date(T0 - DAY).toISOString() }, T0),
    'Не забирают заказ, 1 день в пункте выдачи:\nполучатель неизвестен\nтелефон не пришёл\nсостав не пришёл\n777'
  );
});

test('новый заказ: уведомление уходит, повтор события — нет', async () => {
  const sent = [];
  const store = memoryStore();
  const ctx = { config: resolveCdekConfig(FULL_ENV), fetchImpl: fakeFetch(sent), store, logger: quiet, now: T0 };
  const payload = created('10296250133');

  const first = await processCdekEvent(payload, ctx);
  const second = await processCdekEvent(payload, ctx);

  assert.equal(first.sent, true);
  assert.deepEqual(second, { sent: false, reason: 'duplicate' });
  assert.equal(sent.length, 1);
  assert.match(sent[0], /^Новый заказ:/);
  assert.equal(store.get('10296250133').notifiedNew, true);
});

test('движение посылки в реестр пишется, но Ольгу не тревожит', async () => {
  const sent = [];
  const store = memoryStore();
  const fetchImpl = fakeFetch(sent, orderWith({ code: 'SENT_TO_RECIPIENT_CITY', date_time: '2026-07-30T05:52:11+0000' }));

  await processCdekEvent(event(9), { config: resolveCdekConfig(FULL_ENV), fetchImpl, store, logger: quiet, now: T0 });

  assert.equal(sent.length, 0);
  assert.equal(store.get('10296250133').status, 'SENT_TO_RECIPIENT_CITY');
  assert.equal(store.get('10296250133').waitingSince, null);
});

test('часы берутся у СДЭК и не сбрасываются повторным событием', async () => {
  const sent = [];
  const store = memoryStore();
  const cfg = resolveCdekConfig(FULL_ENV);
  const fetchImpl = fakeFetch(sent, ПВЗ);

  await processCdekEvent(event(12), { config: cfg, fetchImpl, store, logger: quiet, now: T0 });
  await processCdekEvent(event(12), { config: cfg, fetchImpl, store, logger: quiet, now: T0 + DAY });

  // Не время прихода вебхука, а дата статуса из ответа СДЭК.
  assert.equal(store.get('10296250133').waitingSince, '2026-07-30T07:59:51.000Z');
  assert.equal(store.get('10296250133').phone, '+998902720438');
  assert.equal(sent.length, 0);
});

test('сутки в пункте выдачи — приходит напоминание, и только одно', async () => {
  const sent = [];
  const store = memoryStore();
  const cfg = resolveCdekConfig(FULL_ENV);
  const fetchImpl = fakeFetch(sent, ПВЗ);
  const ПВЗ_ЧАС = Date.parse('2026-07-30T07:59:51Z');

  await processCdekEvent(event(12), { config: cfg, fetchImpl, store, logger: quiet, now: T0 });

  assert.deepEqual(await scanWaitingOrders({ config: cfg, fetchImpl, store, logger: quiet, now: ПВЗ_ЧАС + DAY / 2 }), { notified: 0 });
  assert.deepEqual(await scanWaitingOrders({ config: cfg, fetchImpl, store, logger: quiet, now: ПВЗ_ЧАС + DAY }), { notified: 1 });
  assert.deepEqual(await scanWaitingOrders({ config: cfg, fetchImpl, store, logger: quiet, now: ПВЗ_ЧАС + 3 * DAY }), { notified: 0 });

  assert.equal(sent.length, 1);
  assert.match(sent[0], /^Не забирают заказ/);
  assert.match(sent[0], /\+998902720438/);
});

test('забрали до порога — напоминание не приходит', async () => {
  const sent = [];
  const store = memoryStore();
  const cfg = resolveCdekConfig(FULL_ENV);

  await processCdekEvent(event(12), { config: cfg, fetchImpl: fakeFetch(sent, ПВЗ), store, logger: quiet, now: T0 });
  const забран = fakeFetch(sent, orderWith(
    { code: 'DELIVERED', date_time: '2026-07-30T12:00:00+0000' },
    { code: 'ACCEPTED_AT_PICK_UP_POINT', date_time: '2026-07-30T07:59:51+0000' }
  ));
  await processCdekEvent(event(4), { config: cfg, fetchImpl: забран, store, logger: quiet, now: T0 + DAY / 2 });

  assert.deepEqual(await scanWaitingOrders({ config: cfg, fetchImpl: забран, store, logger: quiet, now: T0 + 5 * DAY }), { notified: 0 });
  assert.equal(store.get('10296250133').closed, true);
  assert.equal(sent.length, 0);
});

test('сбой запроса к СДЭК не теряет заказ: дочитываем на проходе', async () => {
  const sent = [];
  const store = memoryStore();
  const cfg = resolveCdekConfig(FULL_ENV);
  const упавший = async (url, init) => {
    if (url.includes('/orders')) return { ok: false, status: 502, json: async () => ({}) };
    return fakeFetch(sent, ПВЗ)(url, init);
  };

  const res = await processCdekEvent(event(12), { config: cfg, fetchImpl: упавший, store, logger: quiet, now: T0 });
  assert.deepEqual(res, { sent: false, reason: 'error' });
  assert.equal(store.get('10296250133').needsRefresh, true);
  // Ольгу сетевым сбоем не тревожим.
  assert.equal(sent.length, 0);

  await scanWaitingOrders({ config: cfg, fetchImpl: fakeFetch(sent, ПВЗ), store, logger: quiet, now: T0 + 60 * 60 * 1000 });
  assert.equal(store.get('10296250133').needsRefresh, false);
  assert.equal(store.get('10296250133').waitingSince, '2026-07-30T07:59:51.000Z');
});

test('запись, оставшаяся от старой версии, чинится сама на проходе', async () => {
  const sent = [];
  const store = memoryStore();
  const cfg = resolveCdekConfig(FULL_ENV);

  // Ровно то, что осталось в проде от кода до перехода на статусы из API:
  // числовой статус, без часов и без пометки на дочитывание.
  store.upsert('10286887892', { status: '12', track: '10286887892', waitingSince: null, closed: false });

  await scanWaitingOrders({ config: cfg, fetchImpl: fakeFetch(sent, ПВЗ), store, logger: quiet, now: T0 });

  const fixed = store.get('10286887892');
  assert.equal(fixed.status, 'ACCEPTED_AT_PICK_UP_POINT');
  assert.equal(fixed.waitingSince, '2026-07-30T07:59:51.000Z');
  assert.equal(fixed.phone, '+998902720438');
});

test('незакрытый заказ перечитывается, даже когда событий по нему нет', async () => {
  const sent = [];
  const store = memoryStore();
  const cfg = resolveCdekConfig(FULL_ENV);
  const fetchImpl = fakeFetch(sent, ПВЗ);

  await processCdekEvent(event(9), { config: cfg, fetchImpl: fakeFetch(sent, orderWith({ code: 'SENT_TO_RECIPIENT_CITY', date_time: '2026-07-30T05:00:00+0000' })), store, logger: quiet, now: T0 });
  assert.equal(store.get('10296250133').waitingSince, null);

  // Вебхук о попадании в пункт выдачи потерялся — часы всё равно пойдут.
  await scanWaitingOrders({ config: cfg, fetchImpl, store, logger: quiet, now: T0 + 13 * 60 * 60 * 1000 });
  assert.equal(store.get('10296250133').waitingSince, '2026-07-30T07:59:51.000Z');
});

test('закрытый заказ впустую не перечитывается', async () => {
  const sent = [];
  const store = memoryStore();
  const cfg = resolveCdekConfig(FULL_ENV);
  let orderCalls = 0;
  const счётчик = async (url, init) => {
    if (url.includes('/orders')) orderCalls += 1;
    return fakeFetch(sent, ПВЗ)(url, init);
  };

  store.upsert('забран', { status: 'DELIVERED', closed: true, track: 'забран', refreshedAt: '2026-01-01T00:00:00.000Z' });
  await scanWaitingOrders({ config: cfg, fetchImpl: счётчик, store, logger: quiet, now: T0 });

  assert.equal(orderCalls, 0);
});

test('заказ, которого СДЭК не знает, перестаём спрашивать', async () => {
  const sent = [];
  const store = memoryStore();
  const cfg = resolveCdekConfig(FULL_ENV);
  let orderCalls = 0;
  // Так СДЭК отвечает на запись smoke из смоука, на удалённый в ЛК заказ и на
  // опечатку в треке.
  const четырёхсотый = async (url, init) => {
    if (url.includes('/orders')) { orderCalls += 1; return { ok: false, status: 400, json: async () => ({}) }; }
    return fakeFetch(sent, ПВЗ)(url, init);
  };

  store.upsert('smoke', { status: 'SENT_TO_RECIPIENT_CITY', track: 'smoke', closed: false });
  await scanWaitingOrders({ config: cfg, fetchImpl: четырёхсотый, store, logger: quiet, now: T0 });

  assert.equal(store.get('smoke').closed, true);
  assert.equal(store.get('smoke').unknownToCdek, true);
  assert.equal(orderCalls, 1);

  // Следующий проход в неё уже не стучится — журнал не зарастает.
  await scanWaitingOrders({ config: cfg, fetchImpl: четырёхсотый, store, logger: quiet, now: T0 + 13 * 60 * 60 * 1000 });
  assert.equal(orderCalls, 1);
  assert.equal(sent.length, 0);
});

test('сетевой сбой заказ не хоронит — только 400 и 404', async () => {
  const sent = [];
  const store = memoryStore();
  const cfg = resolveCdekConfig(FULL_ENV);
  const пятисотый = async (url, init) => {
    if (url.includes('/orders')) return { ok: false, status: 502, json: async () => ({}) };
    return fakeFetch(sent, ПВЗ)(url, init);
  };

  const res = await processCdekEvent(event(12), { config: cfg, fetchImpl: пятисотый, store, logger: quiet, now: T0 });
  assert.deepEqual(res, { sent: false, reason: 'error' });
  assert.equal(store.get('10296250133').closed, false);
  assert.equal(store.get('10296250133').needsRefresh, true);
});

test('чужой токен в пути — 404, ничего не шлём', async () => {
  const sent = [];
  const handler = createCdekWebhookHandler({ env: FULL_ENV, fetchImpl: fakeFetch(sent), logger: quiet, store: memoryStore() });
  const res = fakeRes();
  await handler({ params: { token: 'not-the-token' }, body: {} }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(sent.length, 0);
});

test('свой токен — 200 сразу, уведомление уходит следом', async () => {
  const sent = [];
  const handler = createCdekWebhookHandler({ env: FULL_ENV, fetchImpl: fakeFetch(sent), logger: quiet, store: memoryStore() });
  const res = fakeRes();
  await handler({ params: { token: 'secret-path' }, body: created('10296250133') }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { status: 'ok' });
  assert.equal(sent.length, 1);
});

test('несконфигурированный модуль отвечает 200 и молчит', async () => {
  const sent = [];
  const handler = createCdekWebhookHandler({
    env: { CDEK_WEBHOOK_TOKEN: 'secret-path' },
    fetchImpl: fakeFetch(sent),
    logger: quiet,
    store: memoryStore()
  });
  const res = fakeRes();
  await handler({ params: { token: 'secret-path' }, body: created('1') }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(sent.length, 0);
  assert.equal(handler.startWatcher()(), undefined);
});

const quiet = { info() {}, warn() {}, error() {} };

/** Вебхук СДЭК шлёт числовой код старого справочника — 12 это пункт выдачи. */
function event(rawCode, cdekNumber = '10296250133') {
  return { type: 'ORDER_STATUS', uuid: 'u-1', attributes: { status_code: rawCode, cdek_number: cdekNumber } };
}

function created(cdekNumber) {
  return event(1, cdekNumber);
}

/** Живая история заказа 10286887892: доехал и лёг в пункт выдачи 30.07 в 07:59. */
const ПВЗ = orderWith(
  { code: 'ACCEPTED_AT_PICK_UP_POINT', date_time: '2026-07-30T07:59:51+0000' },
  { code: 'ACCEPTED_IN_RECIPIENT_CITY', date_time: '2026-07-30T07:09:12+0000' },
  { code: 'CREATED', date_time: '2026-07-18T17:40:29+0000' }
);

/** Реестр в памяти — тот же контракт, что у файлового cdekStore. */
function memoryStore() {
  const data = {};
  return {
    get: (key) => data[key] || null,
    all: () => Object.entries(data).map(([key, value]) => ({ key, ...value })),
    upsert: (key, patch) => {
      data[key] = { ...(data[key] || {}), ...patch };
      return data[key];
    },
    prune: () => 0,
    get size() {
      return Object.keys(data).length;
    }
  };
}

/** Минимальный двойник express-ответа. */
function fakeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

/** Заглушка fetch: собирает тексты, ушедшие в Telegram. */
function fakeFetch(sentTexts, order = ORDER) {
  return async (url, init = {}) => {
    if (url.includes('/oauth/token')) {
      return { ok: true, status: 200, json: async () => ({ access_token: 'tok' }) };
    }
    if (url.includes('/orders')) {
      return { ok: true, status: 200, json: async () => ({ entity: order }) };
    }
    if (url.includes('api.telegram.org')) {
      sentTexts.push(JSON.parse(init.body).text);
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
    throw new Error(`неожиданный запрос: ${url}`);
  };
}
