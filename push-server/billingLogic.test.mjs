import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyProdamusEvent, deriveAccessMutation } from './billingLogic.mjs';

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
