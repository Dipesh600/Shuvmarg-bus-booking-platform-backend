'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

process.env.SECRET_KEY = 'test-only-secret-32chars-minimum!!';

const AppError = require('../../../src/shared/errors/app-error');
const service = require('../../../src/modules/auth/password-reset/reset-password.service');
const repository = require('../../../src/modules/auth/password-reset/password-reset.repository');
const otpHelper = require('../../../utils/otpHelper');
const tokenService = require('../../../utils/tokenService');
const passwordValidator = require('../../../utils/passwordValidator');

const INPUT = { emailOrPhone: '+977-980-000-6601', otp: '123-456', newPassword: 'NewPass1' };
const LEGACY_500 = { status: false, message: 'Failed to reset password. Please try again.' };
const patch = (target, key, value, restores) => {
  const original = target[key]; target[key] = value;
  restores.push(() => { target[key] = original; });
};
const installHappyPath = (order, options = {}) => {
  const restores = [];
  patch(otpHelper, 'verifyOTPCode', async (...args) => { order.push('verify'); options.verifyArgs = args; return { valid: true }; }, restores);
  patch(repository, 'findActiveForPasswordReset', async (...args) => { order.push('lookup'); options.lookupArgs = args; return { _id: 'uid' }; }, restores);
  patch(passwordValidator, 'validatePassword', () => { order.push('validate'); return { valid: true, errors: [] }; }, restores);
  patch(bcrypt, 'hash', async (_password, cost) => { order.push('hash'); options.cost = cost; return 'hashed'; }, restores);
  patch(repository, 'savePassword', async () => { order.push('save'); }, restores);
  patch(tokenService, 'revokeAllUserTokens', options.revoke || (async () => { order.push('revoke'); }), restores);
  patch(repository, 'incrementTokenVersion', options.increment || (async () => { order.push('increment'); }), restores);
  return () => restores.reverse().forEach((restore) => restore());
};
const assertLegacy500 = (error) => {
  assert.ok(error instanceof AppError);
  assert.equal(error.statusCode, 500);
  assert.deepEqual(error.responseBody, LEGACY_500);
  return true;
};

test('Unit: resetPassword operation order and failures', async (t) => {
  await t.test('invalid OTP prevents user lookup', async () => {
    const restores = [];
    let lookupCalled = false;
    patch(otpHelper, 'verifyOTPCode', async () => ({ valid: false, error: 'bad' }), restores);
    patch(repository, 'findActiveForPasswordReset', async () => { lookupCalled = true; }, restores);
    try {
      await assert.rejects(service.resetPassword(INPUT));
      assert.equal(lookupCalled, false);
    } finally { restores.reverse().forEach((restore) => restore()); }
  });

  await t.test('complete reset operation order and arguments', async () => {
    const order = []; const captured = {};
    const restore = installHappyPath(order, captured);
    try {
      await service.resetPassword(INPUT);
      assert.deepEqual(order, ['verify', 'lookup', 'validate', 'hash', 'save', 'revoke', 'increment']);
      assert.deepEqual(captured.verifyArgs, ['9800006601', '123456', 'PASSWORD_RESET', true]);
      assert.deepEqual(captured.lookupArgs, [INPUT.emailOrPhone, '9800006601']);
      assert.equal(captured.cost, 12);
    } finally { restore(); }
  });

  await t.test('revocation failure maps to legacy 500 and skips increment', async () => {
    const order = []; let incrementCalled = false;
    const restore = installHappyPath(order, {
      revoke: async () => { order.push('revoke'); throw new Error('revocation failed'); },
      increment: async () => { incrementCalled = true; order.push('increment'); },
    });
    try {
      await assert.rejects(service.resetPassword(INPUT), assertLegacy500);
      assert.equal(incrementCalled, false);
      assert.deepEqual(order, ['verify', 'lookup', 'validate', 'hash', 'save', 'revoke']);
    } finally { restore(); }
  });

  await t.test('increment failure maps to legacy 500 after revocation', async () => {
    const order = [];
    const restore = installHappyPath(order, {
      revoke: async () => { order.push('revoke'); },
      increment: async () => { order.push('increment'); throw new Error('increment failed'); },
    });
    try {
      await assert.rejects(service.resetPassword(INPUT), assertLegacy500);
      assert.deepEqual(order, ['verify', 'lookup', 'validate', 'hash', 'save', 'revoke', 'increment']);
    } finally { restore(); }
  });
});
