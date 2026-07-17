'use strict';

// Part 2: ACCOUNT_ACTIVATION, success response, error mapping

const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.SECRET_KEY = 'test-only-secret-32chars-minimum!!';

const service = require('../../../src/modules/auth/otp-resend/otp-resend.service');
const otpHelper = require('../../../utils/otpHelper');
const phoneGuard = require('../../../utils/phoneGuard');
const repository = require('../../../src/modules/auth/otp-resend/otp-resend.repository');
const AppError = require('../../../src/shared/errors/app-error');

const patch = (t, k, v, r) => { const o = t[k]; t[k] = v; r.push(() => { t[k] = o; }); };
const restoreAll = (r) => r.reverse().forEach((f) => f());

test('Unit: OTP Resend Service – ACCOUNT_ACTIVATION, success & errors', async (t) => {

  await t.test('ACCOUNT_ACTIVATION: no registration check, no user lookup', async () => {
    const r = []; let regCalled = false; let lookupCalled = false;
    patch(phoneGuard, 'isPhoneRegistered', async () => { regCalled = true; return { registered: false }; }, r);
    patch(repository, 'findPasswordResetUser', async () => { lookupCalled = true; return null; }, r);
    patch(otpHelper, 'createAndSendOTP', async () => ({ expiresIn: 300 }), r);
    try {
      await service.resendOtp({ phone: '9800003030', purpose: 'ACCOUNT_ACTIVATION' });
      assert.equal(regCalled, false);
      assert.equal(lookupCalled, false);
    } finally { restoreAll(r); }
  });

  await t.test('ACCOUNT_ACTIVATION: createAndSendOTP receives ACCOUNT_ACTIVATION', async () => {
    const r = []; let pur;
    patch(otpHelper, 'createAndSendOTP', async (p, purpose) => { pur = purpose; return { expiresIn: 300 }; }, r);
    try { await service.resendOtp({ phone: '9800003031', purpose: 'ACCOUNT_ACTIVATION' }); assert.equal(pur, 'ACCOUNT_ACTIVATION'); } finally { restoreAll(r); }
  });

  await t.test('ACCOUNT_ACTIVATION: raw phone passed to createAndSendOTP', async () => {
    const r = []; let p;
    patch(otpHelper, 'createAndSendOTP', async (phone) => { p = phone; return { expiresIn: 300 }; }, r);
    try { await service.resendOtp({ phone: '9800003032', purpose: 'ACCOUNT_ACTIVATION' }); assert.equal(p, '9800003032'); } finally { restoreAll(r); }
  });

  await t.test('success response includes expiresIn from helper', async () => {
    const r = [];
    patch(phoneGuard, 'isPhoneRegistered', async () => ({ registered: false }), r);
    patch(otpHelper, 'createAndSendOTP', async () => ({ expiresIn: 600 }), r);
    try {
      const result = await service.resendOtp({ phone: '9800003040', purpose: 'REGISTRATION' });
      assert.equal(result.statusCode, 200);
      assert.equal(result.responseBody.success, true);
      assert.equal(result.responseBody.message, 'New OTP sent successfully!');
      assert.equal(result.responseBody.data.expiresIn, 600);
    } finally { restoreAll(r); }
  });

  await t.test('OTP_SEND_BLOCKED → exact AppError 429 with correct fields', async () => {
    const r = [];
    patch(phoneGuard, 'isPhoneRegistered', async () => ({ registered: false }), r);
    patch(otpHelper, 'createAndSendOTP', async () => { throw new Error('OTP_SEND_BLOCKED:5'); }, r);
    try {
      await assert.rejects(
        () => service.resendOtp({ phone: '9800003050', purpose: 'REGISTRATION' }),
        (e) => e instanceof AppError && e.statusCode === 429 &&
          e.responseBody.retryAfterMinutes === 5 && e.responseBody.errorCode === 'OTP_SEND_BLOCKED'
      );
    } finally { restoreAll(r); }
  });

  await t.test('OTP_SEND_BLOCKED malformed minutes fallback to 10', async () => {
    const r = [];
    patch(phoneGuard, 'isPhoneRegistered', async () => ({ registered: false }), r);
    patch(otpHelper, 'createAndSendOTP', async () => { throw new Error('OTP_SEND_BLOCKED:abc'); }, r);
    try {
      await assert.rejects(
        () => service.resendOtp({ phone: '9800003051', purpose: 'REGISTRATION' }),
        (e) => e instanceof AppError && e.statusCode === 429 && e.responseBody.retryAfterMinutes === 10
      );
    } finally { restoreAll(r); }
  });

  await t.test('OTP_SEND_BLOCKED zero minutes fallback to 10', async () => {
    const r = [];
    patch(phoneGuard, 'isPhoneRegistered', async () => ({ registered: false }), r);
    patch(otpHelper, 'createAndSendOTP', async () => { throw new Error('OTP_SEND_BLOCKED:0'); }, r);
    try {
      await assert.rejects(
        () => service.resendOtp({ phone: '9800003052', purpose: 'REGISTRATION' }),
        (e) => e instanceof AppError && e.statusCode === 429 && e.responseBody.retryAfterMinutes === 10
      );
    } finally { restoreAll(r); }
  });

  await t.test('unknown errors → exact legacy 500 AppError body, internal message not exposed', async () => {
    const r = [];
    patch(phoneGuard, 'isPhoneRegistered', async () => ({ registered: false }), r);
    patch(otpHelper, 'createAndSendOTP', async () => { throw new Error('DB exploded'); }, r);
    try {
      await assert.rejects(
        () => service.resendOtp({ phone: '9800003060', purpose: 'REGISTRATION' }),
        (e) => {
          assert.ok(e instanceof AppError, 'must be AppError');
          assert.equal(e.statusCode, 500);
          assert.deepEqual(e.responseBody, {
            success: false,
            message: 'Failed to resend OTP. Please try again.',
          });
          assert.ok(
            !JSON.stringify(e.responseBody).includes('DB exploded'),
            'internal error message must not be exposed',
          );
          return true;
        }
      );
    } finally { restoreAll(r); }
  });
});

