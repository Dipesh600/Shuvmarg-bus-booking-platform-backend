'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.SECRET_KEY = 'test-only-secret-32chars-minimum!!';
process.env.NODE_ENV = 'test';

const service = require('../../../src/modules/auth/password-reset/verify-reset-otp.service');
const repository = require('../../../src/modules/auth/password-reset/password-reset.repository');
const otpHelper = require('../../../utils/otpHelper');
const enumGuard = require('../../../utils/enumGuard');

test('Unit: verifyResetOtp service', async (t) => {
  await t.test('missing emailOrPhone → 400', async () => {
    try {
      await service.verifyResetOtp({ emailOrPhone: '', otp: '123456' });
      assert.fail();
    } catch (e) { assert.equal(e.statusCode, 400); assert.equal(e.responseBody.message, 'Phone/Email and OTP are required!'); }
  });

  await t.test('missing otp → 400', async () => {
    try {
      await service.verifyResetOtp({ emailOrPhone: '9800004401', otp: '' });
      assert.fail();
    } catch (e) { assert.equal(e.statusCode, 400); }
  });

  await t.test('non-6 sanitized OTP → 400', async () => {
    try {
      await service.verifyResetOtp({ emailOrPhone: '9800004402', otp: '123' });
      assert.fail();
    } catch (e) { assert.equal(e.statusCode, 400); assert.equal(e.responseBody.message, 'OTP must be a 6-digit code.'); }
  });

  await t.test('PASSWORD_RESET purpose passed to otpFirstVerify', async () => {
    const origFirst = enumGuard.otpFirstVerify;
    let capturedPurpose, capturedMarkUsed;
    enumGuard.otpFirstVerify = async (ph, otp, purpose, markUsed, vFn, lFn) => {
      capturedPurpose = purpose; capturedMarkUsed = markUsed;
      return { valid: false };
    };
    try {
      const result = await service.verifyResetOtp({ emailOrPhone: '9800004403', otp: '123456' });
      assert.equal(capturedPurpose, 'PASSWORD_RESET');
      assert.equal(capturedMarkUsed, false);
    } finally { enumGuard.otpFirstVerify = origFirst; }
  });

  await t.test('repository lookup not called before OTP check', async () => {
    const origFirst = enumGuard.otpFirstVerify;
    let lookupCalled = false;
    enumGuard.otpFirstVerify = async (ph, otp, purpose, markUsed, vFn, lFn) => {
      // Never call lFn — simulating OTP failure fast path
      return { valid: false };
    };
    const origLookup = repository.findActiveAfterOtpVerification;
    repository.findActiveAfterOtpVerification = async () => { lookupCalled = true; return null; };
    try {
      await service.verifyResetOtp({ emailOrPhone: '9800004404', otp: '111222' });
      assert.equal(lookupCalled, false);
    } finally {
      enumGuard.otpFirstVerify = origFirst;
      repository.findActiveAfterOtpVerification = origLookup;
    }
  });

  await t.test('invalid OTP → generic 400 response', async () => {
    const origFirst = enumGuard.otpFirstVerify;
    enumGuard.otpFirstVerify = async () => ({ valid: false });
    try {
      const result = await service.verifyResetOtp({ emailOrPhone: '9800004405', otp: '222333' });
      assert.equal(result.statusCode, 400);
      assert.equal(result.responseBody.message, 'Invalid or expired verification code.');
    } finally { enumGuard.otpFirstVerify = origFirst; }
  });

  await t.test('valid OTP → 200 success', async () => {
    const origFirst = enumGuard.otpFirstVerify;
    enumGuard.otpFirstVerify = async () => ({ valid: true, user: { phone: 'x' } });
    try {
      const result = await service.verifyResetOtp({ emailOrPhone: '9800004406', otp: '333444' });
      assert.equal(result.statusCode, 200);
      assert.equal(result.responseBody.status, true);
    } finally { enumGuard.otpFirstVerify = origFirst; }
  });

  await t.test('unexpected throw → 500 body shape', async () => {
    const origFirst = enumGuard.otpFirstVerify;
    enumGuard.otpFirstVerify = async () => { throw new Error('crash'); };
    try {
      await service.verifyResetOtp({ emailOrPhone: '9800004407', otp: '444555' });
      assert.fail();
    } catch (e) {
      assert.equal(e.statusCode, 500);
      assert.equal(e.responseBody.message, 'Internal Server Error');
    } finally { enumGuard.otpFirstVerify = origFirst; }
  });
});
