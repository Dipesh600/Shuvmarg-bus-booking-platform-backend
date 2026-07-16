'use strict';
process.env.SECRET_KEY = 'test-only-secret-32chars-minimum!!';
process.env.VERIFICATION_TOKEN_SECRET = 'test-only-verification-secret!!';
process.env.SPARROW_SMS_TOKEN = 'test-stub';

const test = require('node:test');
const assert = require('node:assert/strict');
const AppError = require('../../../src/shared/errors/app-error');
const service = require('../../../src/modules/auth/registration/send-phone-otp.service');
const otpHelper = require('../../../utils/otpHelper');
const phoneGuard = require('../../../utils/phoneGuard');

test('Unit: sendPhoneOTP service', async (t) => {
  const origIsPhone = phoneGuard.isPhoneRegistered;
  const origSend = otpHelper.createAndSendOTP;

  t.afterEach(() => {
    phoneGuard.isPhoneRegistered = origIsPhone;
    otpHelper.createAndSendOTP = origSend;
  });

  await t.test('missing phone → AppError 400', async () => {
    await assert.rejects(
      () => service.sendPhoneOTP({ phone: undefined }),
      (err) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.statusCode, 400);
        assert.equal(err.responseBody.success, false);
        return true;
      }
    );
  });

  await t.test('registered phone → generic 200, no data, createAndSendOTP NOT called', async () => {
    let sendCalled = false;
    phoneGuard.isPhoneRegistered = async () => ({ registered: true });
    otpHelper.createAndSendOTP = async () => { sendCalled = true; };

    const result = await service.sendPhoneOTP({ phone: '9800000001' });
    assert.equal(result.statusCode, 200);
    assert.ok(result.responseBody.status);
    assert.equal(result.responseBody.data, undefined);
    assert.equal(sendCalled, false);
  });

  await t.test('OTP_SEND_BLOCKED → AppError 429', async () => {
    phoneGuard.isPhoneRegistered = async () => ({ registered: false });
    otpHelper.createAndSendOTP = async () => { throw new Error('OTP_SEND_BLOCKED:5'); };

    await assert.rejects(
      () => service.sendPhoneOTP({ phone: '9800000002' }),
      (err) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.statusCode, 429);
        assert.equal(err.responseBody.errorCode, 'OTP_SEND_BLOCKED');
        assert.equal(err.responseBody.retryAfterMinutes, 5);
        return true;
      }
    );
  });

  await t.test('unknown failure → legacy 500 AppError', async () => {
    phoneGuard.isPhoneRegistered = async () => ({ registered: false });
    otpHelper.createAndSendOTP = async () => { throw new Error('Some DB error'); };

    await assert.rejects(
      () => service.sendPhoneOTP({ phone: '9800000003' }),
      (err) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.statusCode, 500);
        assert.equal(err.responseBody.message, 'Failed to send OTP. Please try again.');
        return true;
      }
    );
  });

  await t.test('success → statusCode 200 with expiresIn', async () => {
    phoneGuard.isPhoneRegistered = async () => ({ registered: false });
    otpHelper.createAndSendOTP = async () => ({ success: true, expiresIn: '5 minutes' });

    const result = await service.sendPhoneOTP({ phone: '9800000004' });
    assert.equal(result.statusCode, 200);
    assert.equal(result.responseBody.data.expiresIn, '5 minutes');
  });
});
