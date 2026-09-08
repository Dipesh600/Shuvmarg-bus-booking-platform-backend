'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../../../src/modules/agent/auth/registration/agent-registration.policy');

test('agent-registration policy preserves pure legacy decisions', () => {
  assert.equal(policy.AGENT_PURPOSE, 'AGENT_REGISTRATION');
  assert.equal(policy.isValidNepalMobile('9812345678'), true);
  assert.equal(policy.isValidNepalMobile('9612345678'), false);
  assert.equal(policy.cleanOtp('a1-2 3b456'), '123456');
  assert.deepEqual(policy.rolesFor({ roles: ['agent'], role: 'passenger' }), ['agent']);
  assert.deepEqual(policy.rolesFor({ role: 'busOwner' }), ['busOwner']);
  assert.deepEqual(policy.rolesFor({ role: null }), []);
  const now = Date.UTC(2026, 0, 1, 0, 30, 0);
  assert.equal(policy.isOtpRecent({ updatedAt: new Date(now - policy.OTP_WINDOW_MS + 1) }, now), true);
  assert.equal(policy.isOtpRecent({ updatedAt: new Date(now - policy.OTP_WINDOW_MS - 1) }, now), false);
  assert.equal(policy.otpBlockedMinutes(new Error('OTP_SEND_BLOCKED:4')), 4);
  assert.equal(policy.otpBlockedMinutes(new Error('OTP_SEND_BLOCKED:x')), 10);
  assert.equal(policy.isOtpBlocked(new Error('OTP_SEND_BLOCKED:4')), true);
  assert.equal(policy.normalizedEmail(' A@EXAMPLE.COM '), 'a@example.com');
  const d = new Date('2026-01-01T00:00:00Z');
  assert.deepEqual(policy.newUserData({
    name: ' Name ',
    phone: '9812345678',
    password: 'hash',
    email: ' E@X.COM ',
    now: d,
  }), {
    name: 'Name',
    phone: '9812345678',
    password: 'hash',
    role: 'agent',
    roles: ['agent'],
    status: 'active',
    phoneVerified: true,
    isVerified: false,
    roleActivatedAt: { agent: d },
    email: 'e@x.com',
  });
});
