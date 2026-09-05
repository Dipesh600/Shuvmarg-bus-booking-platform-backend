'use strict';

process.env.SECRET_KEY ||= 'test-only-secret-32chars-minimum!!';

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const phoneGuard = require('../../../utils/phoneGuard');
const otpHelper = require('../../../utils/otpHelper');
const enumGuard = require('../../../utils/enumGuard');
const passwordValidator = require('../../../utils/passwordValidator');
const tokenService = require('../../../utils/tokenService');
const repository = require('../../../src/modules/driver/auth/password-reset/driver-password-reset.repository');
const service = require('../../../src/modules/driver/auth/password-reset/driver-password-reset.service');

const patch = (object, key, replacement, restores) => {
  const original = object[key];
  object[key] = replacement;
  restores.push(() => { object[key] = original; });
};
const driver = () => ({
  _id: 'driver-user',
  phone: '9800001001',
  role: 'driver',
  roles: ['driver'],
  status: 'active',
  deletedAt: null,
  toObject() { return { ...this }; },
});
const activeTarget = (user = driver()) => ({
  user,
  hasAnyProfile: true,
  hasActiveProfile: true,
  hasInvitedProfile: false,
});

test('eligible driver reset request sends only the driver OTP purpose', async () => {
  const restores = [];
  const user = driver();
  const calls = [];
  patch(phoneGuard, 'normalizePhone', () => user.phone, restores);
  patch(enumGuard, 'withMinimumLatency', async (action, milliseconds) => {
    calls.push(`latency:${milliseconds}`);
    return action();
  }, restores);
  patch(repository, 'findRecoveryTargetByPhone', async () => activeTarget(user), restores);
  patch(otpHelper, 'createAndSendOTP', async (phone, purpose) => calls.push(`${phone}:${purpose}`), restores);
  try {
    const result = await service.requestPasswordReset({ rawPhone: '+9779800001001' });
    assert.equal(result.statusCode, 200);
    assert.deepEqual(calls, ['latency:600', '9800001001:DRIVER_PASSWORD_RESET']);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test('a non-driver phone is rejected and never advances to SMS', async () => {
  const restores = [];
  let sends = 0;
  patch(phoneGuard, 'normalizePhone', () => '9800001002', restores);
  patch(enumGuard, 'withMinimumLatency', async (action) => action(), restores);
  patch(repository, 'findRecoveryTargetByPhone', async () => null, restores);
  patch(otpHelper, 'createAndSendOTP', async () => { sends++; }, restores);
  try {
    await assert.rejects(
      service.requestPasswordReset({ rawPhone: '9800001002' }),
      (error) => error.statusCode === 404
        && error.responseBody?.errorCode === 'DRIVER_ACCOUNT_NOT_FOUND',
    );
    assert.equal(sends, 0);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test('an invited driver is directed to activation and receives no reset OTP', async () => {
  const restores = [];
  let sends = 0;
  const target = {
    user: { ...driver(), status: 'invited' },
    hasAnyProfile: true,
    hasActiveProfile: false,
    hasInvitedProfile: true,
  };
  patch(phoneGuard, 'normalizePhone', () => target.user.phone, restores);
  patch(enumGuard, 'withMinimumLatency', async (action) => action(), restores);
  patch(repository, 'findRecoveryTargetByPhone', async () => target, restores);
  patch(otpHelper, 'createAndSendOTP', async () => { sends += 1; }, restores);
  try {
    await assert.rejects(
      service.requestPasswordReset({ rawPhone: target.user.phone }),
      (error) => error.statusCode === 409
        && error.responseBody?.errorCode === 'DRIVER_ACCOUNT_INVITED',
    );
    assert.equal(sends, 0);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test('SMS provider rejection is a typed delivery failure, not a cooldown', async () => {
  const restores = [];
  const user = driver();
  patch(phoneGuard, 'normalizePhone', () => user.phone, restores);
  patch(enumGuard, 'withMinimumLatency', async (action) => action(), restores);
  patch(repository, 'findRecoveryTargetByPhone', async () => activeTarget(user), restores);
  patch(otpHelper, 'createAndSendOTP', async () => {
    throw new Error('Sparrow SMS Gateway Error: HTTP 403');
  }, restores);
  try {
    await assert.rejects(
      service.requestPasswordReset({ rawPhone: user.phone }),
      (error) => error.statusCode === 502
        && error.responseBody?.errorCode === 'SMS_DELIVERY_FAILED',
    );
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test('valid OTP cannot reset an invited driver account', async () => {
  const restores = [];
  const target = {
    user: { ...driver(), status: 'invited' },
    hasAnyProfile: true,
    hasActiveProfile: false,
    hasInvitedProfile: true,
  };
  let writes = 0;
  patch(phoneGuard, 'normalizePhone', () => target.user.phone, restores);
  patch(passwordValidator, 'validatePassword', () => ({ valid: true }), restores);
  patch(enumGuard, 'otpFirstVerify', async () => ({ valid: true, user: target }), restores);
  patch(repository, 'completePasswordReset', async () => { writes += 1; }, restores);
  try {
    await assert.rejects(
      service.resetPassword({
        rawPhone: target.user.phone,
        otp: '123456',
        newPassword: 'NewPassword123!',
      }),
      (error) => error.statusCode === 409
        && error.responseBody?.errorCode === 'DRIVER_ACCOUNT_INVITED',
    );
    assert.equal(writes, 0);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test('driver reset consumes its OTP, rotates credentials and issues a driver session', async () => {
  const restores = [];
  const user = driver();
  const target = activeTarget(user);
  const calls = [];
  patch(phoneGuard, 'normalizePhone', () => user.phone, restores);
  patch(passwordValidator, 'validatePassword', () => ({ valid: true }), restores);
  patch(enumGuard, 'otpFirstVerify', async (phone, otp, purpose, consume) => {
    calls.push(`verify:${phone}:${otp}:${purpose}:${consume}`);
    return { valid: true, user: target };
  }, restores);
  patch(bcrypt, 'hash', async (password, cost) => {
    calls.push(`hash:${password}:${cost}`);
    return 'new-hash';
  }, restores);
  patch(repository, 'completePasswordReset', async (input) => {
    calls.push(`save:${input.userId}:${input.hashedPassword}`);
    return user;
  }, restores);
  patch(tokenService, 'revokeAllUserTokens', async (id) => calls.push(`revoke:${id}`), restores);
  patch(tokenService, 'generateTokenPair', async (_user, meta) => {
    calls.push(`session:${meta.activeRole}`);
    return { accessToken: 'access', refreshToken: 'refresh' };
  }, restores);
  try {
    const result = await service.resetPassword({
      rawPhone: user.phone,
      otp: '123456',
      newPassword: 'NewPassword123!',
      deviceInfo: 'device',
      ipAddress: '127.0.0.1',
    });
    assert.equal(result.responseBody.activeRole, 'driver');
    assert.equal(result.responseBody.accessToken, 'access');
    assert.equal(result.refreshToken, 'refresh');
    assert.deepEqual(calls, [
      'verify:9800001001:123456:DRIVER_PASSWORD_RESET:true',
      'hash:NewPassword123!:12',
      'save:driver-user:new-hash',
      'revoke:driver-user',
      'session:driver',
    ]);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});
