// Разбор ответов Telegram: где «его тут нет» (ожидаемо), а где настоящий сбой.

import test from 'node:test';
import assert from 'node:assert/strict';
import { isInChat, isAbsentMember } from './tgAccessClient.mjs';

test('isInChat: кто считается находящимся в ресурсе', () => {
  assert.equal(isInChat({ status: 'creator' }), true);
  assert.equal(isInChat({ status: 'administrator' }), true);
  assert.equal(isInChat({ status: 'member' }), true);
  assert.equal(isInChat({ status: 'restricted', is_member: true }), true, 'ограничен, но всё ещё внутри');
  assert.equal(isInChat({ status: 'restricted', is_member: false }), false);
  assert.equal(isInChat({ status: 'left' }), false);
  assert.equal(isInChat({ status: 'kicked' }), false);
  assert.equal(isInChat(null), false);
  assert.equal(isInChat({}), false);
});

test('isAbsentMember: «его тут нет» — это ответ, а не сбой', () => {
  assert.equal(isAbsentMember(400, 'Bad Request: member not found'), true);
  assert.equal(isAbsentMember(400, 'Bad Request: user not found'), true);
  assert.equal(isAbsentMember(400, 'Bad Request: USER_NOT_PARTICIPANT'), true, 'регистр не важен');
  assert.equal(isAbsentMember(400, 'Bad Request: PARTICIPANT_ID_INVALID'), true);
  assert.equal(isAbsentMember('400', 'Bad Request: member not found'), true, 'код строкой тоже считается');
});

test('isAbsentMember: настоящие сбои остаются сбоями', () => {
  assert.equal(isAbsentMember(429, 'Too Many Requests: retry after 5'), false, 'троттлинг');
  assert.equal(isAbsentMember(500, 'Internal Server Error'), false);
  assert.equal(isAbsentMember(401, 'Unauthorized'), false, 'токен отозван');
  assert.equal(isAbsentMember(403, 'Forbidden: bot was kicked from the channel chat'), false);
  assert.equal(isAbsentMember(400, 'Bad Request: chat not found'), false,
    'бот потерял сам канал — поломка, а не отсутствие человека');
  assert.equal(isAbsentMember(400, 'Bad Request: not enough rights'), false);
  assert.equal(isAbsentMember(undefined, undefined), false);
});

test('isAbsentMember: 400 про чат не путается с 400 про человека', () => {
  // Оба текста содержат «not found» — различать обязаны по существу, не по подстроке
  assert.equal(isAbsentMember(400, 'Bad Request: chat not found'), false);
  assert.equal(isAbsentMember(400, 'Bad Request: member not found'), true);
});
