/**
 * Письмо клиенту, когда посылка доехала до пункта выдачи.
 *
 * Зачем: СДЭК уведомляет получателя ненадёжно — 02.08.2026 Ольге не пришло ни
 * одного сообщения о двух её собственных посылках. Человек не знает, что заказ
 * ждёт, отсюда и напоминания «не забирают сутки», которые мы шлём Ольге.
 *
 * Момент отправки — тот же, что запускает часы ожидания: посылка легла в пункт
 * выдачи. Письмо одно на заказ.
 *
 * Отправка через NotiSend, метод одиночного сообщения. Кампании здесь не
 * годятся: это транзакционное письмо одному человеку, а не рассылка.
 *
 * Модуль выключен, пока в окружении нет CDEK_CLIENT_MAIL=on и ключа NotiSend.
 *
 * План: vault «00 стратегия», plans/2026-07-20-сдэк-вебхуки-уведомления.md, Ф8
 */

const NOTISEND_BASE_DEFAULT = 'https://api.notisend.ru/v1';

export function resolveClientMailConfig(env = {}) {
  const apiKey = String(env.NOTISEND_API_KEY || '').trim();
  return {
    // Два условия сразу: ключ есть И включатель поднят. Ключ может лежать в
    // окружении ради других задач — сам по себе он писем слать не разрешает.
    enabled: Boolean(apiKey && String(env.CDEK_CLIENT_MAIL || '').trim() === 'on'),
    apiKey,
    base: String(env.NOTISEND_API_BASE || NOTISEND_BASE_DEFAULT).replace(/\/+$/, ''),
    fromEmail: String(env.CDEK_MAIL_FROM || 'info@skrebeyko.ru'),
    fromName: String(env.CDEK_MAIL_FROM_NAME || 'Ольга Скребейко'),
  };
}

/**
 * Имя для обращения. В СДЭК приходит как есть из заказа: где-то «Марина»,
 * где-то «Колесникова Валентина Владимировна». Берём первое слово, похожее на
 * имя, — длинное ФИО в обращении звучит казённо.
 *
 * Не угадываем: если в поле компания, инициалы или пусто — здороваемся без
 * имени. Ошибиться именем хуже, чем его не назвать.
 */
export function greetingName(recipient) {
  const value = String(recipient || '').trim();
  if (!value) return '';
  const parts = value.split(/\s+/).filter(Boolean);
  // Фамилия часто идёт первой — берём второе слово, если оно похоже на имя.
  const candidate = parts.length >= 2 && looksLikeName(parts[1]) ? parts[1] : parts[0];
  return looksLikeName(candidate) ? candidate : '';
}

function looksLikeName(word) {
  const value = String(word || '');
  // Только буквы, длиннее двух знаков — отсекает инициалы «В.» и «ООО».
  return /^[А-ЯЁA-Z][а-яёa-z-]{2,}$/u.test(value);
}

/** Адрес и часы работы пункта выдачи. Пустой ответ СДЭК письмо не ломает. */
export function formatPoint(point = {}) {
  const location = point.location || {};
  return {
    address: String(location.address_full || location.address || '').trim(),
    workTime: String(point.work_time || '').trim(),
  };
}

/**
 * Письмо. Простой текст и HTML собираются из одних данных, чтобы не разъехались.
 *
 * Срок хранения числом не называем: в ответе СДЭК его нет, а выдумывать нельзя.
 * Строки, для которых не пришли данные, просто не появляются — письмо с пустым
 * «Адрес:» выглядит поломанным.
 */
export function formatArrivalEmail(record = {}, point = {}) {
  const name = greetingName(record.recipient);
  const { address, workTime } = formatPoint(point);
  const items = Array.isArray(record.items) && record.items.length ? record.items : [];

  const lines = [];
  lines.push(name ? `Здравствуйте, ${name}!` : 'Здравствуйте!');
  lines.push('');
  lines.push('Ваш заказ приехал и ждёт вас в пункте выдачи СДЭК.');

  if (items.length) {
    lines.push('');
    lines.push('Что внутри:');
    lines.push('');
    for (const item of items) lines.push(`— ${item}`);
  }

  lines.push('');
  if (address) lines.push(`Адрес: ${address}`);
  if (workTime) lines.push(`Часы работы: ${workTime}`);
  if (record.track) lines.push(`Номер для получения: ${record.track}`);

  lines.push('');
  lines.push(
    'Заберите, пожалуйста, в ближайшие дни — посылки хранятся ограниченное время, потом уезжают обратно. ' +
      'Желательно открыть упаковку и проверить целостность посылки.'
  );
  lines.push('');
  lines.push('Если что-то пойдёт не так, напишите в ответ на это письмо, я отвечу.');
  lines.push('');
  lines.push('Ольга Скребейко');
  lines.push('Домашнее издательство Skrebeyko');

  const text = lines.join('\n');
  return {
    subject: 'Посылка ждёт вас в пункте выдачи',
    text,
    html: textToHtml(text),
  };
}

/**
 * Письмо простое, поэтому и вёрстка простая: абзацы и переносы. Внешних
 * картинок нет намеренно — транзакционное письмо должно читаться и без них.
 */
function textToHtml(text) {
  const escaped = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const body = escaped
    .split('\n\n')
    .map((block) => `<p style="margin:0 0 16px">${block.replace(/\n/g, '<br>')}</p>`)
    .join('\n');
  return [
    '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;',
    'font-size:16px;line-height:1.55;color:#1a1a1a;max-width:560px">',
    body,
    '</div>',
  ].join('');
}

/**
 * Отправка. Возвращает результат, а не бросает: письмо клиенту не должно
 * ронять обработку события — заказ важнее письма.
 */
export async function sendArrivalEmail({ config, fetchImpl = fetch, to, letter, logger = console }) {
  if (!config.enabled) return { sent: false, reason: 'disabled' };
  if (!to) return { sent: false, reason: 'no_email' };

  try {
    const res = await fetchImpl(`${config.base}/email/messages`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from_email: config.fromEmail,
        from_name: config.fromName,
        to,
        subject: letter.subject,
        text: letter.text,
        html: letter.html,
      }),
    });
    if (!res.ok) throw new Error(`NotiSend HTTP ${res.status}`);
    return { sent: true };
  } catch (e) {
    logger.error('[cdek] письмо клиенту не ушло', e);
    return { sent: false, reason: 'error' };
  }
}
