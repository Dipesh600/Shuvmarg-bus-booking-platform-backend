'use strict';

// Account-check failure tests: isPhoneRegistered, normalizePhone,
// and findPasswordResetUser throwing unexpected errors must all
// map to the endpoint-specific 500 AppError (full orchestration coverage).

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

const EXPECTED_500 = { success: false, message: 'Failed to resend OTP. Please try again.' };

test('Unit: OTP Resend Service – account check failures', async (t) => {

  await t.test('REGISTRATION: isPhoneRegistered throws → 500, OTP not called', async () => {
    const r = []; let otpCalled = false;
    patch(phoneGuard, 'isPhoneRegistered', async () => { throw new Error('registration lookup failed'); }, r);
    patch(otpHelper, 'createAndSendOTP', async () => { otpCalled = true; return { expiresIn: 300 }; }, r);
    try {
      await assert.rejects(
        () => service.resendOtp({ phone: '9800003061', purpose: 'REGISTRATION' }),
        (e) => {
          assert.ok(e instanceof AppError, 'must be AppError');
          assert.equal(e.statusCode, 500);
          assert.deepEqual(e.responseBody, EXPECTED_500);
          return true;
        }
      );
      assert.equal(otpCalled, false, 'OTP must not be called after account-check failure');
    } finally { restoreAll(r); }
  });

  await t.test('PASSWORD_RESET: findPasswordResetUser throws → 500, OTP not called', async () => {
    const r = []; let otpCalled = false;
    patch(phoneGuard, 'normalizePhone', (p) => p, r);
    patch(repository, 'findPasswordResetUser', async () => { throw new Error('user lookup failed'); }, r);
    patch(otpHelper, 'createAndSendOTP', async () => { otpCalled = true; return { expiresIn: 300 }; }, r);
    try {
      await assert.rejects(
        () => service.resendOtp({ phone: '9800003062', purpose: 'PASSWORD_RESET' }),
        (e) => {
          assert.ok(e instanceof AppError, 'must be AppError');
          assert.equal(e.statusCode, 500);
          assert.deepEqual(e.responseBody, EXPECTED_500);
          return true;
        }
      );
      assert.equal(otpCalled, false, 'OTP must not be called after lookup failure');
    } finally { restoreAll(r); }
  });

  await t.test('PASSWORD_RESET: normalizePhone throws → 500, repo & OTP not called', async () => {
    const r = []; let lookupCalled = false; let otpCalled = false;
    patch(phoneGuard, 'normalizePhone', () => { throw new Error('normalization failed'); }, r);
    patch(repository, 'findPasswordResetUser', async () => { lookupCalled = true; return null; }, r);
    patch(otpHelper, 'createAndSendOTP', async () => { otpCalled = true; return { expiresIn: 300 }; }, r);
    try {
      await assert.rejects(
        () => service.resendOtp({ phone: '9800003063', purpose: 'PASSWORD_RESET' }),
        (e) => {
          assert.ok(e instanceof AppError, 'must be AppError');
          assert.equal(e.statusCode, 500);
          assert.deepEqual(e.responseBody, EXPECTED_500);
          return true;
        }
      );
      assert.equal(lookupCalled, false, 'repository must not be called after normalization failure');
      assert.equal(otpCalled, false, 'OTP must not be called after normalization failure');
    } finally { restoreAll(r); }
  });
});
