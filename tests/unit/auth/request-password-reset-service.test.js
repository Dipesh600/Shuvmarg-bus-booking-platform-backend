'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.SECRET_KEY = 'test-only-secret-32chars-minimum!!';
process.env.NODE_ENV = 'test';
process.env.SPARROW_SMS_TOKEN = 'test-stub';

const service = require('../../../src/modules/auth/password-reset/request-password-reset.service');
const repository = require('../../../src/modules/auth/password-reset/password-reset.repository');
const otpHelper = require('../../../utils/otpHelper');
const enumGuard = require('../../../utils/enumGuard');

test('Unit: requestPasswordReset service', async (t) => {
  await t.test('missing emailOrPhone → statusCode 400', async () => {
    try {
      await service.requestPasswordReset({ emailOrPhone: '' });
      assert.fail('should throw');
    } catch (e) {
      assert.equal(e.statusCode, 400);
      assert.equal(e.responseBody.message, 'Email or Phone is required!');
    }
  });

  await t.test('unknown user → 404 AppError no OTP sent', async () => {
    const origFind = repository.findForResetRequest;
    const origSend = otpHelper.createAndSendOTP;
    let sendCalled = false;
    repository.findForResetRequest = async () => null;
    otpHelper.createAndSendOTP = async () => { sendCalled = true; };
    try {
      await service.requestPasswordReset({ emailOrPhone: '9800003301' });
      assert.fail('should throw 404');
    } catch (e) {
      assert.equal(e.statusCode, 404);
      assert.equal(e.responseBody.status, false);
      assert.equal(sendCalled, false);
    } finally {
      repository.findForResetRequest = origFind;
      otpHelper.createAndSendOTP = origSend;
    }
  });

  await t.test('existing user → generic 200 + OTP sent to user.phone', async () => {
    const origFind = repository.findForResetRequest;
    const origSend = otpHelper.createAndSendOTP;
    let capturedPhone, capturedPurpose;
    repository.findForResetRequest = async () => ({ phone: '9800003302' });
    otpHelper.createAndSendOTP = async (p, pur) => { capturedPhone = p; capturedPurpose = pur; return {}; };
    try {
      const result = await service.requestPasswordReset({ emailOrPhone: '9800003302' });
      assert.equal(result.statusCode, 200);
      assert.equal(capturedPhone, '9800003302');
      assert.equal(capturedPurpose, 'PASSWORD_RESET');
    } finally {
      repository.findForResetRequest = origFind;
      otpHelper.createAndSendOTP = origSend;
    }
  });

  await t.test('withMinimumLatency called with 600', async () => {
    const origFind = repository.findForResetRequest;
    const origLatency = enumGuard.withMinimumLatency;
    let capturedMin;
    repository.findForResetRequest = async () => ({ phone: '9800003303' });
    enumGuard.withMinimumLatency = async (fn, min) => { capturedMin = min; return fn(); };
    try {
      await service.requestPasswordReset({ emailOrPhone: '9800003303' });
      assert.equal(capturedMin, 600);
    } catch (e) {} finally {
      repository.findForResetRequest = origFind;
      enumGuard.withMinimumLatency = origLatency;
    }
  });

  await t.test('OTP_SEND_BLOCKED → 429 mapping', async () => {
    const origFind = repository.findForResetRequest;
    const origSend = otpHelper.createAndSendOTP;
    repository.findForResetRequest = async () => ({ phone: '9800003304' });
    otpHelper.createAndSendOTP = async () => { throw new Error('OTP_SEND_BLOCKED:3'); };
    try {
      await service.requestPasswordReset({ emailOrPhone: '9800003304' });
      assert.fail('should throw');
    } catch (e) {
      assert.equal(e.statusCode, 429);
      assert.equal(e.responseBody.retryAfterMinutes, 3);
    } finally {
      repository.findForResetRequest = origFind;
      otpHelper.createAndSendOTP = origSend;
    }
  });

  await t.test('Sparrow SMS error → 502 mapping', async () => {
    const origFind = repository.findForResetRequest;
    const origSend = otpHelper.createAndSendOTP;
    repository.findForResetRequest = async () => ({ phone: '9800003305' });
    otpHelper.createAndSendOTP = async () => { throw new Error('Sparrow SMS timeout'); };
    try {
      await service.requestPasswordReset({ emailOrPhone: '9800003305' });
    } catch (e) {
      assert.equal(e.statusCode, 502);
    } finally {
      repository.findForResetRequest = origFind;
      otpHelper.createAndSendOTP = origSend;
    }
  });

  await t.test('unknown failure → 500 mapping', async () => {
    const origFind = repository.findForResetRequest;
    const origSend = otpHelper.createAndSendOTP;
    repository.findForResetRequest = async () => ({ phone: '9800003306' });
    otpHelper.createAndSendOTP = async () => { throw new Error('chaos'); };
    try {
      await service.requestPasswordReset({ emailOrPhone: '9800003306' });
    } catch (e) {
      assert.equal(e.statusCode, 500);
      assert.equal(e.responseBody.message, 'Failed to send OTP. Please try again.');
    } finally {
      repository.findForResetRequest = origFind;
      otpHelper.createAndSendOTP = origSend;
    }
  });
});
