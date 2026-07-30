/**
 * Вебхуки СДЭК → уведомления Ольге в Telegram.
 *
 * Два сообщения:
 *   1. новый заказ — что внутри и трек;
 *   2. посылка лежит в пункте выдачи дольше суток и её не забирают —
 *      получатель, телефон, состав, трек.
 *
 * Зачем вообще вебхуки: метода «дай список всех заказов» в API СДЭК нет,
 * о заказе узнаём только событием.
 *
 * Почему свой таймер, а не письмо СДЭК про истечение срока хранения: статус
 * заказа СДЭК меняет только когда посылка уже поехала назад — это поздно.
 * Считаем сами от момента, когда посылка легла в пункт выдачи.
 *
 * Модуль изолирован: в базу Garden не ходит, наружу не бросает, при пустом
 * CDEK_WEBHOOK_TOKEN полностью спит.
 *
 * План: vault «00 стратегия», plans/2026-07-20-сдэк-вебхуки-уведомления.md
 */
import crypto from 'crypto';
import { createCdekStore } from './cdekStore.mjs';

const CDEK_BASE_DEFAULT = 'https://api.cdek.ru/v2';

/** Первое событие нового заказа: трек-номер к этому моменту уже присвоен. */
const NOTIFY_STATUSES_DEFAULT = 'CREATED';

/**
 * Посылка доехала и ждёт получателя. Подтверждено на живых заказах 30.07:
 * вебхук с сырым кодом 12 приходит ровно на ACCEPTED_AT_PICK_UP_POINT.
 * Список всё равно в настройке — словарь СДЭК может пополниться.
 */
const WAITING_STATUSES_DEFAULT = 'ACCEPTED_AT_PICK_UP_POINT,POSTOMAT_POSTED';

/** Заказ закрыт: забрали, вернули или удалили. Часы больше не тикают. */
const CLOSED_STATUSES_DEFAULT = [
  'DELIVERED',
  'POSTOMAT_RECEIVED',
  'NOT_DELIVERED',
  'RETURNED_TO_SENDER_CITY_WAREHOUSE',
  'RETURNED_TO_SENDER',
  'REMOVED',
  'INVALID',
].join(',');

export function resolveCdekConfig(env = {}) {
  const token = String(env.CDEK_WEBHOOK_TOKEN || '').trim();
  const list = (value, fallback) =>
    String(value || fallback)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  return {
    enabled: Boolean(
      token &&
        env.CDEK_CLIENT_ID &&
        env.CDEK_CLIENT_SECRET &&
        env.CDEK_NOTIFY_BOT_TOKEN &&
        env.CDEK_NOTIFY_CHAT_ID
    ),
    token,
    base: String(env.CDEK_API_BASE || CDEK_BASE_DEFAULT).replace(/\/+$/, ''),
    clientId: String(env.CDEK_CLIENT_ID || ''),
    clientSecret: String(env.CDEK_CLIENT_SECRET || ''),
    botToken: String(env.CDEK_NOTIFY_BOT_TOKEN || ''),
    chatId: String(env.CDEK_NOTIFY_CHAT_ID || ''),
    statuses: list(env.CDEK_NOTIFY_STATUSES, NOTIFY_STATUSES_DEFAULT),
    waitingStatuses: list(env.CDEK_WAITING_STATUSES, WAITING_STATUSES_DEFAULT),
    closedStatuses: list(env.CDEK_CLOSED_STATUSES, CLOSED_STATUSES_DEFAULT),
    waitingHours: Number(env.CDEK_WAITING_HOURS || 24),
    newOrderMaxAgeHours: Number(env.CDEK_NEW_ORDER_MAX_AGE_HOURS || 24),
    // Как часто перечитывать незакрытый заказ из API, даже если событий нет.
    refreshHours: Number(env.CDEK_REFRESH_HOURS || 12),
    // Потолок перечитываний за один проход — чтобы разросшийся реестр не
    // устроил залп запросов к СДЭК. Остальные подождут следующего прохода.
    refreshLimit: Number(env.CDEK_REFRESH_LIMIT || 50),
    scanMinutes: Number(env.CDEK_SCAN_MINUTES || 60),
    storePath: String(env.CDEK_STORE_PATH || './cdek-orders.json'),
  };
}

/** Сравнение токена из пути постоянным временем — без утечки по таймингу. */
export function tokenMatches(given, expected) {
  if (!expected) return false;
  const a = Buffer.from(String(given || ''), 'utf8');
  const b = Buffer.from(String(expected), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Достаёт из ответа СДЭК то немногое, что нужно для обоих сообщений. */
export function extractOrderFacts(order = {}) {
  const recipient = order.recipient || {};
  const phones = Array.isArray(recipient.phones) ? recipient.phones : [];
  const items = [];
  for (const pkg of order.packages || []) {
    for (const item of pkg.items || []) {
      const amount = Number(item.amount) || 1;
      const name = stripCustomsTranslation(item.name);
      items.push(amount > 1 ? `${name} × ${amount}` : name);
    }
  }
  return {
    recipient: (recipient.name || recipient.company || '').trim(),
    phone: normalizePhone(phones[0] && phones[0].number),
    city: (order.to_location && order.to_location.city) || '',
    items,
    track: order.cdek_number || '',
  };
}

/**
 * «Блокнот бумажный «Женщины разумной» / Paper notebook» → «Блокнот бумажный
 * «Женщины разумной»». Английский хвост в названии нужен таможне на
 * международных отправлениях, в уведомлении он лишний.
 *
 * Режем только латинский хвост: название, где после слэша идёт кириллица, —
 * это осмысленная часть имени, её не трогаем.
 */
export function stripCustomsTranslation(name) {
  const value = String(name || '').trim();
  const at = value.lastIndexOf(' / ');
  if (at === -1) return value;
  const tail = value.slice(at + 3);
  return /[а-яё]/i.test(tail) ? value : value.slice(0, at).trim();
}

function normalizePhone(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  return value.startsWith('+') ? value : `+${value.replace(/\D/g, '')}`;
}

/**
 * Согласованный формат: что внутри и трек, больше ничего. Сообщение уходит
 * дальше в мессенджер тому, кто собирает посылку, — получателя и город он
 * видит в СДЭК по треку.
 *
 * Количество подписываем только когда штук больше одной: «× 1» в каждой
 * строке — шум, а вот незамеченные «× 3» — недосланный заказ.
 */
export function formatOrderMessage(order = {}, attrs = {}) {
  const facts = extractOrderFacts(order);
  return [
    'Новый заказ:',
    ...(facts.items.length ? facts.items : ['состав не пришёл']),
    facts.track || attrs.cdek_number || 'трек ещё не присвоен',
  ].join('\n');
}

/** Посылка лежит и её не забирают. Здесь нужны и получатель, и телефон. */
export function formatWaitingMessage(record = {}, now = Date.now()) {
  const since = Date.parse(record.waitingSince || '');
  const days = since ? Math.max(1, Math.floor((now - since) / (24 * 60 * 60 * 1000))) : 1;
  const items = Array.isArray(record.items) && record.items.length ? record.items : ['состав не пришёл'];

  return [
    `Не забирают заказ, ${days} ${plural(days, 'день', 'дня', 'дней')} в пункте выдачи:`,
    record.recipient || 'получатель неизвестен',
    record.phone || 'телефон не пришёл',
    ...items,
    record.track || 'трек неизвестен',
  ].join('\n');
}

function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

async function cdekToken(cfg, fetchImpl) {
  const res = await fetchImpl(`${cfg.base}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    }),
  });
  if (!res.ok) throw new Error(`CDEK oauth HTTP ${res.status}`);
  const data = await res.json();
  if (!data.access_token) throw new Error('CDEK oauth: пустой access_token');
  return data.access_token;
}

async function fetchOrder(cfg, fetchImpl, { cdekNumber, uuid }) {
  const token = await cdekToken(cfg, fetchImpl);
  const path = cdekNumber
    ? `/orders?cdek_number=${encodeURIComponent(cdekNumber)}`
    : `/orders/${encodeURIComponent(uuid)}`;
  const res = await fetchImpl(`${cfg.base}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const e = new Error(`CDEK GET ${path} HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  const data = await res.json();
  return data.entity || {};
}

async function sendTelegram(cfg, fetchImpl, text) {
  const res = await fetchImpl(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: cfg.chatId, text, disable_web_page_preview: true }),
  });
  if (!res.ok) throw new Error(`Telegram sendMessage HTTP ${res.status}`);
}

/**
 * Что состояние заказа значит для нас — по истории статусов из ответа СДЭК.
 *
 * Смотрим всю историю, а не последний статус: событие вебхука может прийти
 * с опозданием или не прийти вовсе (сервис лежал), а история в API полная.
 * `statuses` СДЭК отдаёт от свежих к старым, поэтому find берёт последний
 * подходящий.
 */
export function digestStatuses(order = {}, config, now = Date.now()) {
  const statuses = Array.isArray(order.statuses) ? order.statuses : [];
  const newEntry = statuses.find((s) => config.statuses.includes(s.code));
  const waitingEntry = statuses.find((s) => config.waitingStatuses.includes(s.code));
  const closedEntry = statuses.find((s) => config.closedStatuses.includes(s.code));

  // «Новый заказ» — про новизну. Заказ, созданный неделю назад, о котором мы
  // впервые услышали только сейчас, уведомлением не заслуживает.
  const createdAt = newEntry ? Date.parse(newEntry.date_time) : NaN;
  const isNew = Boolean(newEntry) && now - createdAt <= config.newOrderMaxAgeHours * 60 * 60 * 1000;

  return {
    status: statuses[0] ? statuses[0].code : '',
    isNew,
    closed: Boolean(closedEntry),
    // Час, когда посылка легла в пункт выдачи, берём у СДЭК, а не по времени
    // прихода вебхука: точнее и переживает простои сервиса.
    waitingSince: waitingEntry ? new Date(Date.parse(waitingEntry.date_time)).toISOString() : null,
  };
}

/**
 * Разбор события. Вызывается после того, как СДЭКу отдан 200: ответ не должен
 * ждать похода в API СДЭК и в Telegram.
 *
 * `attributes.status_code` из вебхука мы НЕ используем для решений: СДЭК шлёт
 * там числовой код старого справочника (12, 9), а не строковый код из API.
 * Вебхук для нас — только сигнал «по заказу что-то произошло»; истину о
 * статусе берём запросом к API, где коды строковые и документированные.
 */
export async function processCdekEvent(payload, { config, fetchImpl, store, logger = console, now = Date.now() }) {
  if (!payload || payload.type !== 'ORDER_STATUS') return { sent: false, reason: 'not_order_status' };

  const attrs = payload.attributes || {};
  const key = attrs.cdek_number || payload.uuid || '';
  if (!key) return { sent: false, reason: 'no_key' };

  logger.info(`[cdek] событие ${key}: сырой код ${attrs.status_code}`);

  const stored = store.get(key) || {};
  const stamp = new Date(now).toISOString();

  let order;
  try {
    order = await fetchOrder(config, fetchImpl, { cdekNumber: attrs.cdek_number, uuid: payload.uuid });
  } catch (e) {
    // Не кричим Ольге на каждый сбой сети: помечаем запись и пробуем снова
    // на ближайшем проходе сканера.
    if (isUnknownOrder(e)) {
      logger.warn(`[cdek] СДЭК не знает заказ ${key} (HTTP ${e.status}) — больше не спрашиваем`);
      store.upsert(key, { updatedAt: stamp, createdAt: stored.createdAt || stamp, closed: true, unknownToCdek: true, needsRefresh: false });
      return { sent: false, reason: 'unknown_order' };
    }
    logger.error(`[cdek] не удалось забрать заказ ${key}, повторим на проходе`, e);
    store.upsert(key, {
      updatedAt: stamp,
      createdAt: stored.createdAt || stamp,
      closed: Boolean(stored.closed),
      needsRefresh: true,
    });
    return { sent: false, reason: 'error' };
  }

  const record = applyOrder(key, order, { config, store, stored, now, stamp });
  logger.info(`[cdek] заказ ${key}: ${record.status}${record.waitingSince ? ' (лежит в пункте выдачи)' : ''}`);

  if (!record.isNewOrder || record.notifiedNew) {
    return { sent: false, reason: record.notifiedNew ? 'duplicate' : 'not_notifiable' };
  }

  try {
    await sendTelegram(config, fetchImpl, formatOrderMessage(order, attrs));
    store.upsert(key, { notifiedNew: true });
    logger.info(`[cdek] уведомление о новом заказе отправлено: ${key}`);
    return { sent: true };
  } catch (e) {
    logger.error('[cdek] уведомление о новом заказе не ушло', e);
    return { sent: false, reason: 'error' };
  }
}

/**
 * СДЭК ответил «такого заказа нет» — это окончательный ответ, а не сбой связи.
 * Так бывает с удалённым в ЛК заказом, опечаткой в треке или тестовой записью.
 * Долбиться в неё каждый час нельзя: журнал зарастёт, а настоящие сбои чтения
 * потеряются в этом шуме.
 */
function isUnknownOrder(e) {
  return e && (e.status === 400 || e.status === 404);
}

/** Раскладывает ответ СДЭК по записи реестра. */
function applyOrder(key, order, { config, store, stored = {}, now, stamp }) {
  const facts = extractOrderFacts(order);
  const digest = digestStatuses(order, config, now);
  const record = store.upsert(key, {
    ...facts,
    track: facts.track || stored.track || key,
    status: digest.status,
    updatedAt: stamp,
    createdAt: stored.createdAt || stamp,
    closed: digest.closed,
    waitingSince: digest.waitingSince,
    notifiedNew: stored.notifiedNew || false,
    // Забрали или вернули — напоминать больше не о чем.
    notifiedWaiting: digest.closed ? true : stored.notifiedWaiting || false,
    needsRefresh: false,
    refreshedAt: stamp,
  });
  record.isNewOrder = digest.isNew;
  return record;
}

/**
 * Проход по реестру: кто лежит в пункте выдачи дольше порога и до сих пор не
 * забран. Уведомление по каждому заказу одно — дальше Ольга решает сама.
 *
 * Заодно дочитывает записи, по которым в прошлый раз не прошёл запрос к СДЭК.
 */
export async function scanWaitingOrders({ config, fetchImpl, store, logger = console, now = Date.now() }) {
  const edge = now - config.waitingHours * 60 * 60 * 1000;
  let notified = 0;
  // Строка есть всегда, даже когда реестр пуст: иначе после рестарта не видно,
  // сработал проход или молча не случился.
  logger.info(`[cdek] проход по реестру: записей ${store.all().length}`);

  // Освежаем незакрытые заказы, даже если по ним не было событий. Иначе
  // потерянный вебхук о попадании в пункт выдачи означал бы, что часы не
  // пойдут никогда — ровно в том случае, ради которого всё и написано.
  // А лежащая посылка статус не меняет: следующего события можно не дождаться.
  const refreshEdge = now - config.refreshHours * 60 * 60 * 1000;
  let refreshed = 0;
  for (const record of store.all()) {
    if (refreshed >= config.refreshLimit) break;
    const seenLongAgo = !record.refreshedAt || Date.parse(record.refreshedAt) < refreshEdge;
    if (!record.needsRefresh && (record.closed || !seenLongAgo)) continue;

    try {
      const order = await fetchOrder(config, fetchImpl, { cdekNumber: record.track || record.key });
      const fresh = applyOrder(record.key, order, { config, store, stored: record, now, stamp: new Date(now).toISOString() });
      refreshed += 1;
      logger.info(`[cdek] заказ ${record.key} перечитан: ${fresh.status}`);

      // Если вебхук о создании потерялся, уведомление придёт отсюда.
      if (fresh.isNewOrder && !fresh.notifiedNew) {
        await sendTelegram(config, fetchImpl, formatOrderMessage(order, {}));
        store.upsert(record.key, { notifiedNew: true });
        logger.info(`[cdek] уведомление о новом заказе отправлено с прохода: ${record.key}`);
      }
    } catch (e) {
      if (isUnknownOrder(e)) {
        logger.warn(`[cdek] СДЭК не знает заказ ${record.key} (HTTP ${e.status}) — больше не спрашиваем`);
        store.upsert(record.key, { closed: true, unknownToCdek: true, needsRefresh: false, updatedAt: new Date(now).toISOString() });
        continue;
      }
      logger.error(`[cdek] заказ ${record.key} перечитать не вышло`, e);
    }
  }

  for (const record of store.all()) {
    if (record.closed || record.notifiedWaiting || !record.waitingSince) continue;
    const since = Date.parse(record.waitingSince);
    if (!since || since > edge) continue;

    try {
      await sendTelegram(config, fetchImpl, formatWaitingMessage(record, now));
      store.upsert(record.key, { notifiedWaiting: true });
      notified += 1;
      logger.info(`[cdek] напоминание о незабранном заказе: ${record.key}`);
    } catch (e) {
      logger.error(`[cdek] напоминание по ${record.key} не ушло`, e);
    }
  }

  store.prune(now);
  return { notified };
}

/**
 * Express-обработчик. На валидный токен всегда отвечает 200: любой другой код
 * СДЭК считает неудачей и ретраит.
 */
export function createCdekWebhookHandler({ env = process.env, fetchImpl = fetch, logger = console, store } = {}) {
  const config = resolveCdekConfig(env);
  const orders = store || createCdekStore({ filePath: config.storePath, logger });

  const handler = async (req, res) => {
    if (!tokenMatches(req.params && req.params.token, config.token)) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.json({ status: 'ok' });

    if (!config.enabled) {
      logger.warn('[cdek] вебхук пришёл, но модуль не сконфигурирован — пропускаем');
      return undefined;
    }

    return processCdekEvent(req.body, { config, fetchImpl, store: orders, logger }).catch((e) =>
      logger.error('[cdek] необработанная ошибка', e)
    );
  };

  handler.config = config;
  handler.store = orders;
  /** Периодическая проверка незабранных. Возвращает функцию остановки. */
  handler.startWatcher = () => {
    if (!config.enabled) return () => {};
    const run = () =>
      scanWaitingOrders({ config, fetchImpl, store: orders, logger }).catch((e) =>
        logger.error('[cdek] проход по незабранным заказам сорвался', e)
      );
    // Первый проход сразу: иначе рестарт сервиса создаёт слепой час, а частые
    // рестарты не дали бы проходу случиться вовсе.
    run();
    const timer = setInterval(run, Math.max(1, config.scanMinutes) * 60 * 1000);
    timer.unref();
    return () => clearInterval(timer);
  };

  return handler;
}
