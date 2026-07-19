'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../../../src/modules/bus-owner/auth/password-reset/bus-owner-password-reset.policy');

test('bus-owner password-reset policy is deterministic', () => {
  assert.equal(policy.OTP_PURPOSE, 'BUSOWNER_PASSWORD_RESET');
  assert.equal(policy.MINIMUM_LATENCY_MS, 600);
  assert.equal(policy.cleanOtp('12-34 ab56'), '123456');
  assert.equal(policy.isSixDigitOtp('12-34 ab56'), true);
  assert.equal(policy.isSixDigitOtp('12345'), false);
  assert.deepEqual(policy.rolesFor({ roles: ['driver'], role: 'busOwner' }), ['driver']);
  assert.deepEqual(policy.rolesFor({ roles: [], role: 'busOwner' }), ['busOwner']);
  assert.equal(policy.hasBusOwnerRole({ roles: ['busOwner'] }), true);
  assert.equal(policy.hasBusOwnerRole({ roles: ['agent'], role: 'busOwner' }), false);
  assert.equal(policy.isSuspended({ status: 'banned' }), true);
  assert.equal(policy.isSuspended({ status: 'inactive' }), true);
  assert.equal(policy.isSuspended({ status: 'active' }), false);
  assert.equal(policy.isOtpBlocked(new Error('OTP_SEND_BLOCKED:7')), true);
  assert.equal(policy.retryMinutes(new Error('OTP_SEND_BLOCKED:7')), 7);
  assert.equal(policy.retryMinutes(new Error('OTP_SEND_BLOCKED:0')), 10);
  assert.equal(policy.isSparrowSmsError(new Error('Sparrow SMS failed')), true);
  assert.equal(policy.isSparrowSmsError(new Error('other')), false);
});
