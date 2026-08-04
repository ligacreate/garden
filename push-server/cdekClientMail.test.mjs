import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveClientMailConfig,
  greetingName,
  formatPoint,
  formatArrivalEmail,
  sendArrivalEmail
} from './cdekClientMail.mjs';

const MAIL_ENV = { NOTISEND_API_KEY: 'key-123', CDEK_CLIENT_MAIL: 'on' };

// Ответ СДЭК по пункту выдачи, урезанный до нужного.
const POINT = {
  code: 'SPB123',
  location: { address_full: 'Санкт-Петербург, Невский проспект, 100' },
  work_time: 'Пн-Пт 10:00-20:00, Сб 11:00-18:00'
};

const RECORD = {
  key: '10286887892',
  recipient: 'Колесникова Марина Владимировна',
  email: 'marina@example.com',
  phone: '+79991234567',
  track: '10286887892',
  deliveryPoint: 'SPB123',
  items: ['«Блокнот женщины разумной»', 'Tesoro notes аквамарин × 2'],
  waitingSince: '2026-08-02T08:00:00.000Z'
};

test('без ключа NotiSend модуль выключен', () => {
  assert.equal(resolveClientMailConfig({ CDEK_CLIENT_MAIL: 'on' }).enabled, false);
});

test('ключ есть, включателя нет — всё равно выключен', () => {
  assert.equal(resolveClientMailConfig({ NOTISEND_API_KEY: 'key-123' }).enabled, false);
});

test('ключ и включатель вместе — модуль работает', () => {
  assert.equal(resolveClientMailConfig(MAIL_ENV).enabled, true);
});

test('из ФИО берётся имя, а не фамилия', () => {
  assert.equal(greetingName('Колесникова Марина Владимировна'), 'Марина');
});

test('одно слово — это и есть имя', () => {
  assert.equal(greetingName('Марина'), 'Марина');
});

test('инициалы именем не считаются', () => {
  assert.equal(greetingName('Иванов И. И.'), 'Иванов');
});

test('пустое поле получателя не ломает обращение', () => {
  assert.equal(greetingName(''), '');
  assert.equal(greetingName(undefined), '');
});

test('адрес и часы работы берутся из пункта выдачи', () => {
  const point = formatPoint(POINT);
  assert.equal(point.address, 'Санкт-Петербург, Невский проспект, 100');
  assert.equal(point.workTime, 'Пн-Пт 10:00-20:00, Сб 11:00-18:00');
});

test('пустой пункт выдачи не роняет разбор', () => {
  assert.deepEqual(formatPoint({}), { address: '', workTime: '' });
  assert.deepEqual(formatPoint(undefined), { address: '', workTime: '' });
});

test('письмо собирается целиком: имя, состав, адрес, трек', () => {
  const letter = formatArrivalEmail(RECORD, POINT);
  assert.equal(letter.subject, 'Посылка ждёт вас в пункте выдачи');
  assert.match(letter.text, /^Здравствуйте, Марина!/);
  assert.match(letter.text, /Ваш заказ приехал и ждёт вас в пункте выдачи СДЭК\./);
  assert.match(letter.text, /— «Блокнот женщины разумной»/);
  assert.match(letter.text, /— Tesoro notes аквамарин × 2/);
  assert.match(letter.text, /Адрес: Санкт-Петербург, Невский проспект, 100/);
  assert.match(letter.text, /Часы работы: Пн-Пт 10:00-20:00/);
  assert.match(letter.text, /Номер для получения: 10286887892/);
  assert.match(letter.text, /проверить целостность посылки/);
  assert.match(letter.text, /Ольга Скребейко/);
});

test('срок хранения числом не называется — его нет в данных СДЭК', () => {
  const letter = formatArrivalEmail(RECORD, POINT);
  assert.doesNotMatch(letter.text, /\d+\s*(дн|суток)/);
});

test('без адреса пункта строка про адрес не появляется', () => {
  const letter = formatArrivalEmail(RECORD, {});
  assert.doesNotMatch(letter.text, /Адрес:/);
  assert.doesNotMatch(letter.text, /Часы работы:/);
  assert.match(letter.text, /Номер для получения: 10286887892/);
});

test('без состава письмо всё равно осмысленно', () => {
  const letter = formatArrivalEmail({ ...RECORD, items: [] }, POINT);
  assert.doesNotMatch(letter.text, /Что внутри:/);
  assert.match(letter.text, /Ваш заказ приехал/);
});

test('html и текст несут одно и то же', () => {
  const letter = formatArrivalEmail(RECORD, POINT);
  assert.match(letter.html, /Здравствуйте, Марина!/);
  assert.match(letter.html, /Невский проспект, 100/);
  assert.match(letter.html, /<p style=/);
});

test('угловые скобки в составе не ломают вёрстку', () => {
  const letter = formatArrivalEmail({ ...RECORD, items: ['Блокнот <b>тест</b>'] }, POINT);
  assert.match(letter.html, /&lt;b&gt;/);
  assert.doesNotMatch(letter.html, /<b>тест<\/b>/);
});

test('выключенный модуль писем не шлёт', async () => {
  let called = false;
  const res = await sendArrivalEmail({
    config: resolveClientMailConfig({}),
    fetchImpl: async () => { called = true; return { ok: true }; },
    to: 'marina@example.com',
    letter: formatArrivalEmail(RECORD, POINT)
  });
  assert.deepEqual(res, { sent: false, reason: 'disabled' });
  assert.equal(called, false);
});

test('без адреса получателя письмо не отправляется', async () => {
  const res = await sendArrivalEmail({
    config: resolveClientMailConfig(MAIL_ENV),
    fetchImpl: async () => ({ ok: true }),
    to: '',
    letter: formatArrivalEmail(RECORD, POINT)
  });
  assert.deepEqual(res, { sent: false, reason: 'no_email' });
});

test('отправка уходит в NotiSend с ключом и телом письма', async () => {
  const calls = [];
  const res = await sendArrivalEmail({
    config: resolveClientMailConfig(MAIL_ENV),
    fetchImpl: async (url, init) => { calls.push({ url, init }); return { ok: true }; },
    to: 'marina@example.com',
    letter: formatArrivalEmail(RECORD, POINT)
  });
  assert.deepEqual(res, { sent: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.notisend.ru/v1/email/messages');
  assert.equal(calls[0].init.headers.authorization, 'Bearer key-123');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.to, 'marina@example.com');
  assert.equal(body.from_email, 'info@skrebeyko.ru');
  assert.equal(body.from_name, 'Ольга Скребейко');
  assert.match(body.text, /Здравствуйте, Марина!/);
});

test('сбой NotiSend не бросает исключение', async () => {
  const res = await sendArrivalEmail({
    config: resolveClientMailConfig(MAIL_ENV),
    fetchImpl: async () => ({ ok: false, status: 500 }),
    to: 'marina@example.com',
    letter: formatArrivalEmail(RECORD, POINT),
    logger: { error() {} }
  });
  assert.deepEqual(res, { sent: false, reason: 'error' });
});
