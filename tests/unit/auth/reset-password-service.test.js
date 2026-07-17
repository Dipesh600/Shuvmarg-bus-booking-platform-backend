'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

process.env.SECRET_KEY = 'test-only-secret-32chars-minimum!!';

const service = require('../../../src/modules/auth/password-reset/reset-password.service');
const repository = require('../../../src/modules/auth/password-reset/password-reset.repository');
const otpHelper = require('../../../utils/otpHelper');
const tokenService = require('../../../utils/tokenService');
const passwordValidator = require('../../../utils/passwordValidator');

const GOOD_PASSWORD = 'NewPass1';
const patch = (target, key, value, restores) => {
  const original = target[key];
  target[key] = value;
  restores.push(() => { target[key] = original; });
};
const restoreAll = (restores) => restores.reverse().forEach((restore) => restore());

test('Unit: resetPassword service basics', async (t) => {
  await t.test('missing emailOrPhone -> exact 400', async () => {
    await assert.rejects(
      service.resetPassword({ emailOrPhone: '', otp: '123456', newPassword: GOOD_PASSWORD }),
      (error) => error.statusCode === 400 && error.responseBody.message === 'All fields are required.'
    );
  });

  await t.test('invalid sanitized OTP length -> exact 400', async () => {
    await assert.rejects(
      service.resetPassword({ emailOrPhone: 'phone', otp: '12', newPassword: GOOD_PASSWORD }),
      (error) => error.statusCode === 400 && error.responseBody.message === 'Verification code must be 6 digits.'
    );
  });

  await t.test('OTP is sanitized, purpose-bound and consumed', async () => {
    const restores = [];
    let received;
    patch(otpHelper, 'verifyOTPCode', async (...args) => { received = args; return { valid: false, error: 'bad' }; }, restores);
    try {
      await assert.rejects(service.resetPassword({
        emailOrPhone: '9800005501', otp: ' 12-34-56 ', newPassword: GOOD_PASSWORD,
      }));
      assert.deepEqual(received, ['9800005501', '123456', 'PASSWORD_RESET', true]);
    } finally { restoreAll(restores); }
  });

  await t.test('invalid OTP -> exact helper error', async () => {
    const restores = [];
    patch(otpHelper, 'verifyOTPCode', async () => ({ valid: false, error: 'Expired.' }), restores);
    try {
      await assert.rejects(
        service.resetPassword({ emailOrPhone: '9800005502', otp: '123456', newPassword: GOOD_PASSWORD }),
        (error) => error.statusCode === 400 && error.responseBody.message === 'Expired.'
      );
    } finally { restoreAll(restores); }
  });

  await t.test('user not found after valid OTP -> exact 400', async () => {
    const restores = [];
    patch(otpHelper, 'verifyOTPCode', async () => ({ valid: true }), restores);
    patch(repository, 'findActiveForPasswordReset', async () => null, restores);
    try {
      await assert.rejects(
        service.resetPassword({ emailOrPhone: '9800005504', otp: '123456', newPassword: GOOD_PASSWORD }),
        (error) => error.statusCode === 400 && error.responseBody.message === 'No account found with this phone or email.'
      );
    } finally { restoreAll(restores); }
  });

  await t.test('weak password -> exact errors after OTP succeeds', async () => {
    const restores = [];
    patch(otpHelper, 'verifyOTPCode', async () => ({ valid: true }), restores);
    patch(repository, 'findActiveForPasswordReset', async () => ({ _id: 'uid' }), restores);
    try {
      await assert.rejects(
        service.resetPassword({ emailOrPhone: '9800005505', otp: '123456', newPassword: 'weak' }),
        (error) => error.statusCode === 400 && error.responseBody.message === error.responseBody.errors[0]
      );
    } finally { restoreAll(restores); }
  });

  await t.test('success hashes with cost 12 and returns exact body', async () => {
    const restores = [];
    let cost;
    patch(otpHelper, 'verifyOTPCode', async () => ({ valid: true }), restores);
    patch(repository, 'findActiveForPasswordReset', async () => ({ _id: 'uid' }), restores);
    patch(passwordValidator, 'validatePassword', () => ({ valid: true, errors: [] }), restores);
    patch(bcrypt, 'hash', async (_password, rounds) => { cost = rounds; return 'hashed'; }, restores);
    patch(repository, 'savePassword', async () => {}, restores);
    patch(tokenService, 'revokeAllUserTokens', async () => {}, restores);
    patch(repository, 'incrementTokenVersion', async () => {}, restores);
    try {
      const result = await service.resetPassword({ emailOrPhone: '9800005509', otp: '123456', newPassword: GOOD_PASSWORD });
      assert.equal(cost, 12);
      assert.deepEqual(result, { statusCode: 200, responseBody: {
        status: true, message: 'Password reset successful. Please log in with your new password.',
      } });
    } finally { restoreAll(restores); }
  });
});
