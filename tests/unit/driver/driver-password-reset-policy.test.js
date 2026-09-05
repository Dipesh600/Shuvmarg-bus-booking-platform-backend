'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const OTP = require('../../../models/otpModel');
const policy = require('../../../src/modules/driver/auth/password-reset/driver-password-reset.policy');

test('driver password recovery has explicit account and profile states', () => {
  const active = { role: 'driver', roles: ['driver'], status: 'active', deletedAt: null };
  const linked = { user: active, hasAnyProfile: true, hasActiveProfile: true, hasInvitedProfile: false };
  assert.equal(policy.OTP_PURPOSE, 'DRIVER_PASSWORD_RESET');
  assert.equal(policy.MINIMUM_LATENCY_MS, 600);
  assert.equal(OTP.schema.path('purpose').enumValues.includes(policy.OTP_PURPOSE), true);
  assert.equal(policy.cleanOtp('a12-34 56'), '123456');
  assert.equal(policy.recoveryState(linked), policy.RECOVERY_STATES.ELIGIBLE);
  assert.equal(policy.canRecoverPassword(linked), true);
  assert.equal(policy.recoveryState(null), policy.RECOVERY_STATES.NOT_FOUND);
  assert.equal(policy.recoveryState({ ...linked, hasAnyProfile: false }), policy.RECOVERY_STATES.NOT_FOUND);
  assert.equal(policy.recoveryState({ ...linked, user: { ...active, roles: ['agent'] } }), policy.RECOVERY_STATES.NOT_FOUND);
  assert.equal(policy.recoveryState({ ...linked, user: { ...active, status: 'invited' }, hasActiveProfile: false, hasInvitedProfile: true }), policy.RECOVERY_STATES.INVITED);
  assert.equal(policy.recoveryState({ ...linked, user: { ...active, status: 'inactive' }, hasActiveProfile: false }), policy.RECOVERY_STATES.UNAVAILABLE);
  assert.equal(policy.recoveryState({ ...linked, user: { ...active, deletedAt: new Date() } }), policy.RECOVERY_STATES.NOT_FOUND);
});
