'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../../../src/modules/agent/auth/login/agent-login.policy');

test('agent-login policy preserves pure legacy decisions', () => {
  assert.deepEqual(policy.resolveRoles({ roles: ['agent'], role: 'passenger' }), ['agent']);
  assert.deepEqual(policy.resolveRoles({ roles: [], role: 'agent' }), ['agent']);
  assert.equal(policy.hasActiveLock({ lockedUntil: new Date(2000) }, new Date(3000)), false);
  assert.equal(policy.hasActiveLock({ lockedUntil: new Date(4000) }, new Date(3000)), true);
  assert.equal(policy.lockMinutes(new Date(61_000), 0), 2);
  assert.equal(policy.bannedMessage(null), 'Your account has been suspended. Please contact support.');
  assert.equal(policy.bannedMessage('fraud'), 'Your account has been suspended. Reason: fraud');
  assert.equal(policy.inactiveMessage(null), 'Your account has been deactivated. Please contact support.');
  assert.equal(policy.inactiveMessage('docs'), 'Your account has been deactivated. Reason: docs');
  assert.equal(policy.attemptsRemaining(4), 1);
  assert.equal(policy.shouldLock(4), false);
  assert.equal(policy.shouldLock(5), true);
  assert.equal(policy.shouldLock(6), true);
  assert.equal(policy.LOCK_DURATION_MS, 15 * 60 * 1000);
});
