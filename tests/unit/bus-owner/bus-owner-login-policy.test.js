'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../../../src/modules/bus-owner/auth/login/bus-owner-login.policy');

test('bus-owner-login policy unit tests', async (t) => {
  await t.test('resolveRoles returns roles array when non-empty', () => {
    assert.deepEqual(policy.resolveRoles({ roles: ['busOwner', 'passenger'], role: 'passenger' }), ['busOwner', 'passenger']);
  });

  await t.test('resolveRoles falls back to [role] when roles is empty', () => {
    assert.deepEqual(policy.resolveRoles({ roles: [], role: 'busOwner' }), ['busOwner']);
  });

  await t.test('resolveRoles falls back to [role] when roles is absent', () => {
    assert.deepEqual(policy.resolveRoles({ role: 'busOwner' }), ['busOwner']);
  });

  await t.test('hasActiveLock is true when lockedUntil is in the future', () => {
    const now = new Date();
    const lockedUntil = new Date(now.getTime() + 60000);
    assert.equal(policy.hasActiveLock({ lockedUntil }, now), true);
  });

  await t.test('hasActiveLock is false when lockedUntil equals now', () => {
    const now = new Date();
    assert.equal(policy.hasActiveLock({ lockedUntil: now }, now), false);
  });

  await t.test('hasActiveLock is false when lockedUntil is in the past', () => {
    const now = new Date();
    const lockedUntil = new Date(now.getTime() - 1000);
    assert.equal(policy.hasActiveLock({ lockedUntil }, now), false);
  });

  await t.test('hasActiveLock is false when lockedUntil is null', () => {
    assert.equal(policy.hasActiveLock({ lockedUntil: null }, new Date()), false);
  });

  await t.test('lockMinutes uses Math.ceil', () => {
    const nowMs = 1000000;
    const lockedUntil = new Date(nowMs + 61 * 1000);
    assert.equal(policy.lockMinutes(lockedUntil, nowMs), 2);
  });

  await t.test('bannedMessage with reason includes reason', () => {
    assert.equal(policy.bannedMessage('fraud'), 'Your account has been suspended. Reason: fraud');
  });

  await t.test('bannedMessage without reason uses support text', () => {
    assert.equal(policy.bannedMessage(null), 'Your account has been suspended. Please contact support.');
  });

  await t.test('inactiveMessage with reason includes reason', () => {
    assert.equal(policy.inactiveMessage('docs'), 'Your account has been deactivated. Reason: docs');
  });

  await t.test('inactiveMessage without reason uses support text', () => {
    assert.equal(policy.inactiveMessage(''), 'Your account has been deactivated. Please contact support.');
  });

  await t.test('attemptsRemaining calculates correctly', () => {
    assert.equal(policy.attemptsRemaining(1), 4);
    assert.equal(policy.attemptsRemaining(4), 1);
  });

  await t.test('shouldLock is true at exactly 5', () => {
    assert.equal(policy.shouldLock(5), true);
  });

  await t.test('shouldLock is true above 5', () => {
    assert.equal(policy.shouldLock(6), true);
  });

  await t.test('shouldLock is false below 5', () => {
    assert.equal(policy.shouldLock(4), false);
  });

  await t.test('lockUntilDate is 15 minutes from nowMs', () => {
    const nowMs = 1000000;
    const result = policy.lockUntilDate(nowMs);
    assert.equal(result.getTime(), nowMs + 15 * 60 * 1000);
  });
});
