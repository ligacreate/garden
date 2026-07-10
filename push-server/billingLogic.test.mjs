import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyProdamusEvent, deriveAccessMutation, isExemptRole, normalizeTelegramUsername, mapBotHunterEvent, isLigaProduct, looksLikeLigaSum } from './billingLogic.mjs';

test('isLigaProduct: все Лига-варианты матчатся (ci), не-Лига — нет', () => {
  assert.equal(isLigaProduct({ products: [{ name: 'Лига развивающих практиков' }] }), true);
  assert.equal(isLigaProduct({ products: [{ name: 'Лига развивающих практиков Skrebeyko, 30 дней' }] }), true);
  assert.equal(isLigaProduct({ products: [{ name: 'Лига развивающих практиков Skrebeyko, пропущенные 30 дней' }] }), true);
  assert.equal(isLigaProduct({ products: [{ name: 'ЛИГА РАЗВИВАЮЩИХ ПРАКТИКОВ' }] }), true); // ci
  assert.equal(isLigaProduct({ products: [{ name: '12 месяцев' }] }), false);
  assert.equal(isLigaProduct({ products: [{ name: 'Неделя заботы о себе' }] }), false);
  assert.equal(isLigaProduct({ products: [{ name: 'Пиши, веди, люби' }] }), false);
  assert.equal(isLigaProduct({ products: [{ name: 'книга' }, { name: 'Лига развивающих практиков' }] }), true); // корзина
  assert.equal(isLigaProduct({}), false);              // нет products
  assert.equal(isLigaProduct({ products: [] }), false);
  assert.equal(isLigaProduct({ products: [{}] }), false);
  assert.equal(isLigaProduct({ products: 'нет' }), false);
});

test('looksLikeLigaSum: цены планов 1m/3m/6m', () => {
  assert.equal(looksLikeLigaSum({ sum: '2000.00' }), true);
  assert.equal(looksLikeLigaSum({ sum: '5500' }), true);
  assert.equal(looksLikeLigaSum({ sum: '10000.00' }), true);
  assert.equal(looksLikeLigaSum({ sum: '750.00' }), false); // Старостина «12 месяцев»
  assert.equal(looksLikeLigaSum({ sum: '' }), false);
  assert.equal(looksLikeLigaSum({}), false);
});

test('payment_success opens access', () => {
  const mutation = deriveAccessMutation({ eventName: 'payment_success', currentAccessStatus: 'paused_expired' });
  assert.equal(mutation.subscription_status, 'active');
  assert.equal(mutation.access_status, 'active');
  assert.equal(mutation.bumpSessionVersion, false);
});

test('auto_payment keeps access active', () => {
  const event = classifyProdamusEvent({ event: 'auto_payment' });
  const mutation = deriveAccessMutation({ eventName: event, currentAccessStatus: 'active' });
  assert.equal(event, 'auto_payment');
  assert.equal(mutation.subscription_status, 'active');
  assert.equal(mutation.access_status, 'active');
});

test('В1: deactivation logs subscription_status, НЕ трогает access', () => {
  const mutation = deriveAccessMutation({ eventName: 'deactivation', currentAccessStatus: 'active' });
  assert.equal(mutation.subscription_status, 'deactivated');
  assert.equal(mutation.access_status, null, 'В1: Лига-доступ = subActive, access_status не режем');
  assert.equal(mutation.bumpSessionVersion, false, 'без принудительного logout');
});

test('В1: finish logs subscription_status, НЕ трогает access', () => {
  const mutation = deriveAccessMutation({ eventName: 'finish', currentAccessStatus: 'active' });
  assert.equal(mutation.subscription_status, 'finished');
  assert.equal(mutation.access_status, null);
  assert.equal(mutation.bumpSessionVersion, false);
});

test('manual pause is not auto-restored by payment', () => {
  const mutation = deriveAccessMutation({ eventName: 'payment_success', currentAccessStatus: 'paused_manual' });
  assert.equal(mutation.subscription_status, 'active');
  assert.equal(mutation.access_status, 'paused_manual');
});

// В1: deactivation/finish НИКОГДА не трогают access_status (Лига-доступ = subActive).
// auto_pause_exempt в deriveAccessMutation больше не участвует — паузы по подписке нет.

test('В1: finish при paused_manual → access_status null (SQL coalesce сохранит paused_manual)', () => {
  const m = deriveAccessMutation({ eventName: 'finish', currentAccessStatus: 'paused_manual' });
  assert.equal(m.subscription_status, 'finished');
  assert.equal(m.access_status, null);
  assert.equal(m.bumpSessionVersion, false);
});

test('В1: лишний autoPauseExempt в аргументах игнорируется (параметр убран из логики)', () => {
  const m = deriveAccessMutation({ eventName: 'deactivation', currentAccessStatus: 'active', autoPauseExempt: false });
  assert.equal(m.access_status, null, 'даже без exempt доступ не режется — паузы по Лиге нет');
});

test('payment по-прежнему открывает доступ (ветка не тронута В1)', () => {
  const m = deriveAccessMutation({ eventName: 'auto_payment', currentAccessStatus: 'active' });
  assert.equal(m.subscription_status, 'active');
  assert.equal(m.access_status, 'active');
  assert.equal(m.bumpSessionVersion, false);
});

// phase30: role-based exempt — admin/applicant защищены структурно, intern/leader/mentor — нет.

test('isExemptRole: admin и applicant — true; intern/leader/mentor/неизвестные — false', () => {
  assert.equal(isExemptRole('admin'), true);
  assert.equal(isExemptRole('applicant'), true);
  assert.equal(isExemptRole('Admin'), true, 'case-insensitive');
  assert.equal(isExemptRole('APPLICANT'), true);
  assert.equal(isExemptRole('intern'), false);
  assert.equal(isExemptRole('leader'), false);
  assert.equal(isExemptRole('mentor'), false);
  assert.equal(isExemptRole(''), false);
  assert.equal(isExemptRole(null), false);
  assert.equal(isExemptRole(undefined), false);
});

test('В1 integration: любая роль → deactivation/finish НЕ трогает access_status', () => {
  // Под В1 access_status не зависит от Лига-неоплаты — роль тут больше не решает.
  for (const role of ['admin', 'applicant', 'intern', 'leader', 'mentor']) {
    const md = deriveAccessMutation({ eventName: 'deactivation', currentAccessStatus: 'active' });
    const mf = deriveAccessMutation({ eventName: 'finish', currentAccessStatus: 'active' });
    assert.equal(md.access_status, null, `${role}: deactivation не режет доступ`);
    assert.equal(mf.access_status, null, `${role}: finish не режет доступ`);
    assert.equal(md.bumpSessionVersion, false);
  }
});

// FEAT-015 BotHunter path: нормализация username + маппинг событий.

test('normalizeTelegramUsername: принимает @name / name / ссылки → голый lowercase-логин', () => {
  assert.equal(normalizeTelegramUsername('@olgapogranitskaya'), 'olgapogranitskaya');
  assert.equal(normalizeTelegramUsername('olgapogranitskaya'), 'olgapogranitskaya');
  assert.equal(normalizeTelegramUsername('OlgaPogranitskaya'), 'olgapogranitskaya', 'регистр срезается');
  assert.equal(normalizeTelegramUsername('https://t.me/olgapogranitskaya'), 'olgapogranitskaya');
  assert.equal(normalizeTelegramUsername('t.me/olgapogranitskaya'), 'olgapogranitskaya');
  assert.equal(normalizeTelegramUsername('http://telegram.me/olgapogranitskaya'), 'olgapogranitskaya');
  assert.equal(normalizeTelegramUsername('  @Olga_Pogran  '), 'olga_pogran', 'trim + подчёркивание ок');
});

test('normalizeTelegramUsername: срезает trailing slash, query и hash', () => {
  assert.equal(normalizeTelegramUsername('https://t.me/olgapogranitskaya/'), 'olgapogranitskaya');
  assert.equal(normalizeTelegramUsername('t.me/olgapogranitskaya?start=abc'), 'olgapogranitskaya');
  assert.equal(normalizeTelegramUsername('https://t.me/olga#frag'), 'olga');
});

test('normalizeTelegramUsername: инвайт-ссылки и мусор → null', () => {
  assert.equal(normalizeTelegramUsername('https://t.me/+AbCdEf123'), null, 't.me/+ — инвайт, не username');
  assert.equal(normalizeTelegramUsername('t.me/+AbCdEf123'), null);
  assert.equal(normalizeTelegramUsername('+79991234567'), null, 'голый + → null');
  assert.equal(normalizeTelegramUsername('https://t.me/joinchat/AAAA'), null, 'старый инвайт joinchat');
  assert.equal(normalizeTelegramUsername(''), null);
  assert.equal(normalizeTelegramUsername(null), null);
  assert.equal(normalizeTelegramUsername(undefined), null);
  assert.equal(normalizeTelegramUsername('   '), null);
  assert.equal(normalizeTelegramUsername('имя-с-дефисом'), null, 'кириллица/дефис вне [a-z0-9_] → null');
});

test('normalizeTelegramUsername: профиль и входящий username нормализуются одинаково (матч)', () => {
  // В проде profiles.telegram = "https://t.me/<username>", BotHunter шлёт "@<username>".
  const fromProfile = normalizeTelegramUsername('https://t.me/olgapogranitskaya');
  const fromWebhook = normalizeTelegramUsername('@OlgaPogranitskaya');
  assert.equal(fromProfile, fromWebhook, 'обе стороны → один ключ');
  // Запись-исключение в проде: t.me/+... никогда не должна матчиться.
  assert.equal(normalizeTelegramUsername('t.me/+xyz'), null);
});

test('mapBotHunterEvent: expired→finish, active→payment_success, прочее→null', () => {
  assert.equal(mapBotHunterEvent('expired'), 'finish');
  assert.equal(mapBotHunterEvent('active'), 'payment_success');
  assert.equal(mapBotHunterEvent('EXPIRED'), 'finish', 'регистронезависимо');
  assert.equal(mapBotHunterEvent('  active  '), 'payment_success', 'trim');
  assert.equal(mapBotHunterEvent('paused'), null);
  assert.equal(mapBotHunterEvent(''), null);
  assert.equal(mapBotHunterEvent(undefined), null);
});

test('В1: BotHunter expired → finish → subscription_status finished, access НЕ трогается', () => {
  // expired → finish → только репортинг subscription_status; доступ = subActive, не режем.
  const exp = deriveAccessMutation({ eventName: mapBotHunterEvent('expired'), currentAccessStatus: 'active' });
  assert.equal(exp.subscription_status, 'finished');
  assert.equal(exp.access_status, null);
  assert.equal(exp.bumpSessionVersion, false);
  // active → payment_success → access active (грант как раньше).
  const act = deriveAccessMutation({ eventName: mapBotHunterEvent('active'), currentAccessStatus: 'active' });
  assert.equal(act.subscription_status, 'active');
  assert.equal(act.access_status, 'active');
  // expired при paused_manual → access_status null (SQL coalesce сохранит paused_manual).
  const manual = deriveAccessMutation({ eventName: mapBotHunterEvent('expired'), currentAccessStatus: 'paused_manual' });
  assert.equal(manual.access_status, null);
});
