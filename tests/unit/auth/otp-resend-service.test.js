'use strict';

// Part 1: input validation, REGISTRATION branch, PASSWORD_RESET branch

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

test('Unit: OTP Resend Service – validation & branches', async (t) => {

  await t.test('missing phone → AppError 400 with exclamation', async () => {
    await assert.rejects(
      () => service.resendOtp({ phone: '', purpose: 'REGISTRATION' }),
      (e) => e instanceof AppError && e.statusCode === 400 && e.responseBody.message === 'Phone number is required!'
    );
  });

  await t.test('null phone → AppError 400', async () => {
    await assert.rejects(() => service.resendOtp({ phone: null }), (e) => e instanceof AppError && e.statusCode === 400);
  });

  await t.test('omitted purpose defaults to REGISTRATION', async () => {
    const r = []; let pur;
    patch(phoneGuard, 'isPhoneRegistered', async () => ({ registered: false }), r);
    patch(otpHelper, 'createAndSendOTP', async (p, purpose) => { pur = purpose; return { expiresIn: 300 }; }, r);
    try { await service.resendOtp({ phone: '9800003001' }); assert.equal(pur, 'REGISTRATION'); } finally { restoreAll(r); }
  });

  await t.test('invalid purpose → AppError 400', async () => {
    await assert.rejects(
      () => service.resendOtp({ phone: '9800003002', purpose: 'INVALID' }),
      (e) => e instanceof AppError && e.statusCode === 400 && e.responseBody.message === 'Invalid OTP purpose.'
    );
  });

  await t.test('purpose is case-sensitive — lowercase registration fails', async () => {
    await assert.rejects(
      () => service.resendOtp({ phone: '9800003003', purpose: 'registration' }),
      (e) => e instanceof AppError && e.statusCode === 400
    );
  });

  await t.test('REGISTRATION: order is validate → reg check → OTP send', async () => {
    const r = []; const order = [];
    patch(phoneGuard, 'isPhoneRegistered', async () => { order.push('reg'); return { registered: false }; }, r);
    patch(otpHelper, 'createAndSendOTP', async () => { order.push('otp'); return { expiresIn: 300 }; }, r);
    try { await service.resendOtp({ phone: '9800003010', purpose: 'REGISTRATION' }); assert.deepEqual(order, ['reg', 'otp']); } finally { restoreAll(r); }
  });

  await t.test('REGISTRATION: registered phone stops before OTP — exact 409 AppError', async () => {
    const r = []; let called = false;
    patch(phoneGuard, 'isPhoneRegistered', async () => ({ registered: true }), r);
    patch(otpHelper, 'createAndSendOTP', async () => { called = true; }, r);
    try {
      await assert.rejects(
        () => service.resendOtp({ phone: '9800003011', purpose: 'REGISTRATION' }),
        (e) => e instanceof AppError && e.statusCode === 409 && e.responseBody.errorCode === 'PHONE_ALREADY_REGISTERED'
      );
      assert.equal(called, false);
    } finally { restoreAll(r); }
  });

  await t.test('PASSWORD_RESET: normalizes phone before repo lookup', async () => {
    const r = []; let looked;
    patch(phoneGuard, 'normalizePhone', (p) => `N_${p}`, r);
    patch(repository, 'findPasswordResetUser', async (p) => { looked = p; return { phone: p }; }, r);
    patch(otpHelper, 'createAndSendOTP', async () => ({ expiresIn: 300 }), r);
    try { await service.resendOtp({ phone: '9800003020', purpose: 'PASSWORD_RESET' }); assert.equal(looked, 'N_9800003020'); } finally { restoreAll(r); }
  });

  await t.test('PASSWORD_RESET unknown user → generic 200, OTP not called', async () => {
    const r = []; let called = false;
    patch(phoneGuard, 'normalizePhone', (p) => p, r);
    patch(repository, 'findPasswordResetUser', async () => null, r);
    patch(otpHelper, 'createAndSendOTP', async () => { called = true; }, r);
    try {
      const result = await service.resendOtp({ phone: '9800003021', purpose: 'PASSWORD_RESET' });
      assert.equal(result.statusCode, 200);
      assert.equal(result.responseBody.message, 'If an account exists, a new OTP has been sent.');
      assert.equal('data' in result.responseBody, false);
      assert.equal(called, false);
    } finally { restoreAll(r); }
  });

  await t.test('PASSWORD_RESET existing user: order is normalize → lookup → OTP', async () => {
    const r = []; const order = [];
    patch(phoneGuard, 'normalizePhone', (p) => { order.push('normalize'); return p; }, r);
    patch(repository, 'findPasswordResetUser', async () => { order.push('lookup'); return { phone: '9800003022' }; }, r);
    patch(otpHelper, 'createAndSendOTP', async () => { order.push('otp'); return { expiresIn: 300 }; }, r);
    try { await service.resendOtp({ phone: '9800003022', purpose: 'PASSWORD_RESET' }); assert.deepEqual(order, ['normalize', 'lookup', 'otp']); } finally { restoreAll(r); }
  });

  await t.test('PASSWORD_RESET: createAndSendOTP receives raw phone, not normalized', async () => {
    const r = []; let otpPhone;
    patch(phoneGuard, 'normalizePhone', (p) => `N_${p}`, r);
    patch(repository, 'findPasswordResetUser', async () => ({ phone: 'N_9800003023' }), r);
    patch(otpHelper, 'createAndSendOTP', async (p) => { otpPhone = p; return { expiresIn: 300 }; }, r);
    try { await service.resendOtp({ phone: '9800003023', purpose: 'PASSWORD_RESET' }); assert.equal(otpPhone, '9800003023'); } finally { restoreAll(r); }
  });
});
