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
 * Посылка доехала и ждёт получателя. Коды из словаря СДЭК; на живых заказах
 * издательства эти статусы ещё не встречались (все предзаказы пока на складе
 * отправителя), поэтому список вынесен в настройку — уточняется без правки кода.
 * Все приходящие коды пишутся в лог, свериться можно там.
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

/** Уведомляем о создании заказа. Движение посылки не шлём, его слишком много. */
export function shouldNotify(payload, statuses) {
  if (!payload || payload.type !== 'ORDER_STATUS') return false;
  const code = payload.attributes && payload.attributes.status_code;
  return statuses.includes(code);
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
  if (!res.ok) throw new Error(`CDEK GET ${path} HTTP ${res.status}`);
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
 * Разбор события. Вызывается после того, как СДЭКу отдан 200: ответ не должен
 * ждать похода в API СДЭК и в Telegram.
 */
export async function processCdekEvent(payload, { config, fetchImpl, store, logger = console, now = Date.now() }) {
  if (!payload || payload.type !== 'ORDER_STATUS') return { sent: false, reason: 'not_order_status' };

  const attrs = payload.attributes || {};
  const status = attrs.status_code || '';
  const key = attrs.cdek_number || payload.uuid || '';
  if (!key) return { sent: false, reason: 'no_key' };

  // Коды статусов пишем всегда: так видно живой словарь СДЭК и можно уточнить
  // список «лежит в пункте выдачи», не гадая по документации.
  logger.info(`[cdek] событие ${key}: ${status}`);

  const isNew = config.statuses.includes(status);
  const isWaiting = config.waitingStatuses.includes(status);
  const isClosed = config.closedStatuses.includes(status);
  const stored = store.get(key) || {};
  const stamp = new Date(now).toISOString();

  let facts = null;
  // За деталями ходим только когда они нужны: на каждое движение посылки —
  // не ходим.
  if ((isNew || isWaiting) && (!stored.recipient || !stored.items)) {
    try {
      facts = extractOrderFacts(await fetchOrder(config, fetchImpl, { cdekNumber: attrs.cdek_number, uuid: payload.uuid }));
    } catch (e) {
      logger.error(`[cdek] не удалось забрать заказ ${key}`, e);
      if (isNew) {
        await sendTelegram(
          config,
          fetchImpl,
          'Пришёл вебхук СДЭК, но собрать уведомление не вышло.\n' +
            `Ошибка: ${e && e.message ? e.message : e}\n` +
            `Данные: ${JSON.stringify(payload).slice(0, 700)}`
        ).catch((sendErr) => logger.error('[cdek] и в Telegram не ушло', sendErr));
        return { sent: false, reason: 'error' };
      }
    }
  }

  const record = store.upsert(key, {
    ...(facts || {}),
    track: (facts && facts.track) || stored.track || attrs.cdek_number || key,
    status,
    updatedAt: stamp,
    createdAt: stored.createdAt || stamp,
    closed: isClosed || Boolean(stored.closed),
    // Часы пошли с первого попадания в пункт выдачи; повторное событие того же
    // типа их не сбрасывает.
    waitingSince: isWaiting ? stored.waitingSince || stamp : stored.waitingSince || null,
    notifiedNew: stored.notifiedNew || false,
    notifiedWaiting: isClosed ? true : stored.notifiedWaiting || false,
  });

  if (!isNew || record.notifiedNew) return { sent: false, reason: record.notifiedNew ? 'duplicate' : 'not_notifiable' };

  try {
    await sendTelegram(config, fetchImpl, formatOrderMessage(factsToOrder(facts || record), attrs));
    store.upsert(key, { notifiedNew: true });
    logger.info(`[cdek] уведомление о новом заказе отправлено: ${key}`);
    return { sent: true };
  } catch (e) {
    logger.error('[cdek] уведомление о новом заказе не ушло', e);
    return { sent: false, reason: 'error' };
  }
}

/** Обратная сборка: formatOrderMessage работает с ответом СДЭК, тут — с записью. */
function factsToOrder(facts = {}) {
  return {
    cdek_number: facts.track || '',
    packages: [{ items: (facts.items || []).map((line) => ({ name: line, amount: 1 })) }],
  };
}

/**
 * Проход по реестру: кто лежит в пункте выдачи дольше порога и до сих пор не
 * забран. Уведомление по каждому заказу одно — дальше Ольга решает сама.
 */
export async function scanWaitingOrders({ config, fetchImpl, store, logger = console, now = Date.now() }) {
  const edge = now - config.waitingHours * 60 * 60 * 1000;
  let notified = 0;
  // Строка есть всегда, даже когда реестр пуст: иначе после рестарта не видно,
  // сработал проход или молча не случился.
  logger.info(`[cdek] проход по реестру: записей ${store.all().length}`);

  for (const record of store.all()) {
    if (record.closed || record.notifiedWaiting || !record.waitingSince) continue;
    const since = Date.parse(record.waitingSince);
    if (!since || since > edge) continue;

    // Без имени и телефона напоминание бесполезно — добираем, если в прошлый
    // раз запрос к СДЭК не прошёл.
    let full = record;
    if (!record.recipient || !record.phone) {
      try {
        const facts = extractOrderFacts(await fetchOrder(config, fetchImpl, { cdekNumber: record.track || record.key }));
        full = store.upsert(record.key, facts);
        full.key = record.key;
      } catch (e) {
        logger.error(`[cdek] детали по ${record.key} не добрались, шлём что есть`, e);
      }
    }

    try {
      await sendTelegram(config, fetchImpl, formatWaitingMessage(full, now));
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
