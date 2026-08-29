'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../../../src/modules/agent/auth/password-reset/agent-password-reset.policy');

test('agent password reset policy is deterministic', async (t) => {
  await t.test('OTP constants and sanitization are exact', () => {
    assert.equal(policy.OTP_PURPOSE, 'AGENT_PASSWORD_RESET');
    assert.equal(policy.MINIMUM_LATENCY_MS, 600);
    assert.equal(policy.cleanOtp(' a1-2x3 456 '), '123456');
    assert.equal(policy.isSixDigitOtp('12-34'), false);
    assert.equal(policy.isSixDigitOtp('a123456'), true);
  });

  await t.test('role fallback and status decisions are preserved', () => {
    assert.deepEqual(policy.rolesFor({ roles: ['agent'], role: 'passenger' }), ['agent']);
    assert.deepEqual(policy.rolesFor({ roles: [], role: 'agent' }), ['agent']);
    assert.equal(policy.hasAgentRole({ roles: ['passenger'], role: 'agent' }), false);
    assert.equal(policy.hasAgentRole({ roles: [], role: 'agent' }), true);
    assert.equal(policy.canRecoverPassword({ roles: ['agent'], status: 'active' }), true);
    assert.equal(policy.canRecoverPassword({ roles: ['agent'], status: 'invited' }), true);
    assert.equal(policy.canRecoverPassword({ roles: ['agent'], status: 'inactive' }), false);
    assert.equal(policy.canRecoverPassword({ roles: ['agent'], status: 'active', deletedAt: new Date() }), false);
  });

  await t.test('OTP blocked detection and retry parsing are exact', () => {
    assert.equal(policy.isOtpBlocked(new Error('OTP_SEND_BLOCKED:7')), true);
    assert.equal(policy.isOtpBlocked(new Error('boom')), false);
    assert.equal(policy.retryMinutes(new Error('OTP_SEND_BLOCKED:7')), 7);
    assert.equal(policy.retryMinutes(new Error('OTP_SEND_BLOCKED:0')), 10);
    assert.equal(policy.retryMinutes(new Error('OTP_SEND_BLOCKED:x')), 10);
  });
});
