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

test('deactivation closes access and bumps session', () => {
  const mutation = deriveAccessMutation({ eventName: 'deactivation', currentAccessStatus: 'active' });
  assert.equal(mutation.subscription_status, 'deactivated');
  assert.equal(mutation.access_status, 'paused_expired');
  assert.equal(mutation.bumpSessionVersion, true);
});

test('finish closes access and bumps session', () => {
  const mutation = deriveAccessMutation({ eventName: 'finish', currentAccessStatus: 'active' });
  assert.equal(mutation.subscription_status, 'finished');
  assert.equal(mutation.access_status, 'paused_expired');
  assert.equal(mutation.bumpSessionVersion, true);
});

test('manual pause is not auto-restored by payment', () => {
  const mutation = deriveAccessMutation({ eventName: 'payment_success', currentAccessStatus: 'paused_manual' });
  assert.equal(mutation.subscription_status, 'active');
  assert.equal(mutation.access_status, 'paused_manual');
});

// FEAT-015 Path C: auto_pause_exempt — иммунитет к webhook-автопаузе.

test('exempt profile: deactivation logs subscription_status but keeps access', () => {
  const mutation = deriveAccessMutation({ eventName: 'deactivation', currentAccessStatus: 'active', autoPauseExempt: true });
  assert.equal(mutation.subscription_status, 'deactivated');
  assert.equal(mutation.access_status, 'active');
  assert.equal(mutation.bumpSessionVersion, false);
});

test('exempt profile: finish logs subscription_status but keeps access', () => {
  const mutation = deriveAccessMutation({ eventName: 'finish', currentAccessStatus: 'active', autoPauseExempt: true });
  assert.equal(mutation.subscription_status, 'finished');
  assert.equal(mutation.access_status, 'active');
  assert.equal(mutation.bumpSessionVersion, false);
});

test('exempt profile: payment still passes (no special branch)', () => {
  const mutation = deriveAccessMutation({ eventName: 'auto_payment', currentAccessStatus: 'active', autoPauseExempt: true });
  assert.equal(mutation.subscription_status, 'active');
  assert.equal(mutation.access_status, 'active');
  assert.equal(mutation.bumpSessionVersion, false);
});

test('exempt + manual pause: exempt wins for deactivation (no pause), manual wins for payment (no auto-restore)', () => {
  const dx = deriveAccessMutation({ eventName: 'deactivation', currentAccessStatus: 'paused_manual', autoPauseExempt: true });
  assert.equal(dx.access_status, 'active', 'exempt overrides paused_manual on deactivation');
  assert.equal(dx.bumpSessionVersion, false);

  const px = deriveAccessMutation({ eventName: 'payment_success', currentAccessStatus: 'paused_manual', autoPauseExempt: true });
  assert.equal(px.access_status, 'paused_manual', 'paused_manual wins for payment (admin decision honored)');
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

test('phase30 integration: admin role → deactivation НЕ паузит (защита по роли)', () => {
  // Симулируем то, что делает applyAccessState в server.mjs:
  const profile = { role: 'admin', auto_pause_exempt: false, access_status: 'active' };
  const autoPauseExempt = Boolean(profile.auto_pause_exempt) || isExemptRole(profile.role);
  const m = deriveAccessMutation({ eventName: 'deactivation', currentAccessStatus: profile.access_status, autoPauseExempt });
  assert.equal(autoPauseExempt, true, 'admin → exempt by role');
  assert.equal(m.access_status, 'active');
  assert.equal(m.bumpSessionVersion, false);
});

test('phase30 integration: applicant role → finish НЕ паузит', () => {
  const profile = { role: 'applicant', auto_pause_exempt: false, access_status: 'active' };
  const autoPauseExempt = Boolean(profile.auto_pause_exempt) || isExemptRole(profile.role);
  const m = deriveAccessMutation({ eventName: 'finish', currentAccessStatus: profile.access_status, autoPauseExempt });
  assert.equal(autoPauseExempt, true);
  assert.equal(m.access_status, 'active');
});

test('phase30 integration: intern role + НЕТ exempt → deactivation паузит (платящая роль)', () => {
  const profile = { role: 'intern', auto_pause_exempt: false, access_status: 'active' };
  const autoPauseExempt = Boolean(profile.auto_pause_exempt) || isExemptRole(profile.role);
  const m = deriveAccessMutation({ eventName: 'deactivation', currentAccessStatus: profile.access_status, autoPauseExempt });
  assert.equal(autoPauseExempt, false, 'intern не защищён по роли');
  assert.equal(m.access_status, 'paused_expired');
  assert.equal(m.bumpSessionVersion, true);
});

test('phase30 integration: leader role + индивидуальный exempt → deactivation НЕ паузит', () => {
  // Кейс «бартер»: платящая роль, но Ольга поставила флаг через UI.
  const profile = { role: 'leader', auto_pause_exempt: true, access_status: 'active' };
  const autoPauseExempt = Boolean(profile.auto_pause_exempt) || isExemptRole(profile.role);
  const m = deriveAccessMutation({ eventName: 'deactivation', currentAccessStatus: profile.access_status, autoPauseExempt });
  assert.equal(autoPauseExempt, true, 'leader защищён индивидуальным флагом');
  assert.equal(m.access_status, 'active');
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

test('BotHunter маппинг согласован с deriveAccessMutation (expired паузит, active открывает)', () => {
  // expired → finish → paused_expired (для платящей роли без exempt/manual).
  const exp = deriveAccessMutation({ eventName: mapBotHunterEvent('expired'), currentAccessStatus: 'active' });
  assert.equal(exp.subscription_status, 'finished');
  assert.equal(exp.access_status, 'paused_expired');
  // active → payment_success → access active.
  const act = deriveAccessMutation({ eventName: mapBotHunterEvent('active'), currentAccessStatus: 'paused_expired' });
  assert.equal(act.subscription_status, 'active');
  assert.equal(act.access_status, 'active');
  // expired при paused_manual → ручная пауза в приоритете, остаётся paused_manual.
  const manual = deriveAccessMutation({ eventName: mapBotHunterEvent('expired'), currentAccessStatus: 'paused_manual' });
  assert.equal(manual.access_status, 'paused_manual');
});
