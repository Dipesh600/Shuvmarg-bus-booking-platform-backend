'use strict';
process.env.SECRET_KEY = 'test-only-secret-32chars-minimum!!';
process.env.VERIFICATION_TOKEN_SECRET = 'test-only-verification-secret!!';
process.env.SPARROW_SMS_TOKEN = 'test-stub';

const test = require('node:test');
const assert = require('node:assert/strict');
const AppError = require('../../../src/shared/errors/app-error');
const service = require('../../../src/modules/auth/registration/verify-phone-otp.service');
const otpHelper = require('../../../utils/otpHelper');
const phoneGuard = require('../../../utils/phoneGuard');

test('Unit: verifyPhoneOTP service', async (t) => {
  const origVerify = otpHelper.verifyOTPCode;
  const origIsPhone = phoneGuard.isPhoneRegistered;

  t.afterEach(() => {
    otpHelper.verifyOTPCode = origVerify;
    phoneGuard.isPhoneRegistered = origIsPhone;
  });

  await t.test('missing phone → AppError 400', async () => {
    await assert.rejects(
      () => service.verifyPhoneOTP({ phone: undefined, otp: '123456' }),
      (err) => { assert.equal(err instanceof AppError, true); assert.equal(err.statusCode, 400); return true; }
    );
  });

  await t.test('missing otp → AppError 400', async () => {
    await assert.rejects(
      () => service.verifyPhoneOTP({ phone: '9800000010', otp: undefined }),
      (err) => { assert.equal(err instanceof AppError, true); assert.equal(err.statusCode, 400); return true; }
    );
  });

  await t.test('non-6-digit OTP → AppError 400', async () => {
    await assert.rejects(
      () => service.verifyPhoneOTP({ phone: '9800000010', otp: '12345' }),
      (err) => {
        assert.equal(err instanceof AppError, true);
        assert.equal(err.statusCode, 400);
        assert.equal(err.responseBody.message, 'OTP must be a 6-digit code.');
        return true;
      }
    );
  });

  await t.test('invalid OTP result → AppError 400 with service error message', async () => {
    otpHelper.verifyOTPCode = async () => ({ valid: false, error: 'Incorrect OTP. 4 attempt(s) remaining.' });
    phoneGuard.isPhoneRegistered = async () => ({ registered: false });

    await assert.rejects(
      () => service.verifyPhoneOTP({ phone: '9800000010', otp: '123456' }),
      (err) => {
        assert.equal(err instanceof AppError, true);
        assert.equal(err.statusCode, 400);
        assert.equal(err.responseBody.message, 'Incorrect OTP. 4 attempt(s) remaining.');
        return true;
      }
    );
  });

  await t.test('race condition: phone registered after OTP → AppError 400', async () => {
    otpHelper.verifyOTPCode = async () => ({ valid: true, error: null });
    phoneGuard.isPhoneRegistered = async () => ({ registered: true });

    await assert.rejects(
      () => service.verifyPhoneOTP({ phone: '9800000010', otp: '123456' }),
      (err) => { assert.equal(err instanceof AppError, true); assert.equal(err.statusCode, 400); return true; }
    );
  });

  await t.test('success → statusCode 200 + verificationToken string', async () => {
    otpHelper.verifyOTPCode = async () => ({ valid: true, error: null });
    phoneGuard.isPhoneRegistered = async () => ({ registered: false });

    const result = await service.verifyPhoneOTP({ phone: '9800000011', otp: '123456' });
    assert.equal(result.statusCode, 200);
    assert.ok(typeof result.responseBody.verificationToken === 'string');
    assert.equal(result.responseBody.status, true);
  });
});
