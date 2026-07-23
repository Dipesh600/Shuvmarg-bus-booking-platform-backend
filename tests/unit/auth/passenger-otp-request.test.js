'use strict';

/**
 * tests/unit/auth/passenger-otp-request.test.js
 *
 * Unit tests for request-passenger-otp.service.js
 */

const {
  createTestSecret,
} = require('../../helpers/security-test-values');

process.env.SECRET_KEY ||= createTestSecret('application-hmac');

const test = require('node:test');
const assert = require('node:assert/strict');
const otpHelper = require('../../../utils/otpHelper');
const repository = require('../../../src/modules/auth/passenger-otp-auth/passenger-otp-auth.repository');
const { requestPassengerOTP } = require('../../../src/modules/auth/passenger-otp-auth/request-passenger-otp.service');

const patch = (obj, key, fn, restore) => {
  const old = obj[key]; obj[key] = fn; restore.push(() => { obj[key] = old; });
};

test('passenger OTP request service', async (t) => {
  await t.test('missing phone throws 400 MISSING_PHONE', async () => {
    await assert.rejects(() => requestPassengerOTP({ rawPhone: '' }),
      (err) => { assert.equal(err.statusCode, 400); assert.equal(err.responseBody?.errorCode, 'MISSING_PHONE'); return true; });
  });

  await t.test('non-Nepal mobile throws 400 INVALID_PHONE', async () => {
    await assert.rejects(() => requestPassengerOTP({ rawPhone: '9612345678' }),
      (err) => { assert.equal(err.statusCode, 400); assert.equal(err.responseBody?.errorCode, 'INVALID_PHONE'); return true; });
  });

  await t.test('banned account returns neutral 200 — SMS not sent', async () => {
    const restore = []; const calls = [];
    patch(repository, 'findPassengerOtpEligibilityByPhone', async () => ({ status: 'banned', deletedAt: null }), restore);
    patch(otpHelper, 'createAndSendOTP', async () => { calls.push('send'); }, restore);
    try {
      const r = await requestPassengerOTP({ rawPhone: '9800000001' });
      assert.equal(r.statusCode, 200);
      assert.equal(calls.length, 0);
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('soft-deleted account returns neutral 200 — no SMS', async () => {
    const restore = []; const calls = [];
    patch(repository, 'findPassengerOtpEligibilityByPhone', async () => ({ status: 'active', deletedAt: new Date() }), restore);
    patch(otpHelper, 'createAndSendOTP', async () => { calls.push('send'); }, restore);
    try {
      const r = await requestPassengerOTP({ rawPhone: '9800000002' });
      assert.equal(r.statusCode, 200);
      assert.equal(calls.length, 0);
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('inactive account returns neutral 200 — no SMS', async () => {
    const restore = []; const calls = [];
    patch(repository, 'findPassengerOtpEligibilityByPhone', async () => ({ status: 'inactive', deletedAt: null }), restore);
    patch(otpHelper, 'createAndSendOTP', async () => { calls.push('send'); }, restore);
    try {
      const r = await requestPassengerOTP({ rawPhone: '9800000003' });
      assert.equal(r.statusCode, 200);
      assert.equal(calls.length, 0);
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('new phone sends OTP and returns neutral 200', async () => {
    const restore = []; let sentPhone;
    patch(repository, 'findPassengerOtpEligibilityByPhone', async () => null, restore);
    patch(otpHelper, 'createAndSendOTP', async (ph) => { sentPhone = ph; }, restore);
    try {
      const r = await requestPassengerOTP({ rawPhone: '9800000004' });
      assert.equal(r.statusCode, 200);
      assert.equal(sentPhone, '9800000004');
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('active existing passenger sends OTP normally', async () => {
    const restore = []; let sentPhone;
    patch(repository, 'findPassengerOtpEligibilityByPhone', async () => ({ status: 'active', deletedAt: null }), restore);
    patch(otpHelper, 'createAndSendOTP', async (ph) => { sentPhone = ph; }, restore);
    try {
      const r = await requestPassengerOTP({ rawPhone: '9800000005' });
      assert.equal(r.statusCode, 200);
      assert.ok(sentPhone);
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('createAndSendOTP called with PASSENGER_AUTH purpose', async () => {
    const restore = []; let capturedArgs;
    patch(repository, 'findPassengerOtpEligibilityByPhone', async () => null, restore);
    patch(otpHelper, 'createAndSendOTP', async (...args) => { capturedArgs = args; }, restore);
    try {
      await requestPassengerOTP({ rawPhone: '9800000006' });
      assert.equal(capturedArgs[1], 'PASSENGER_AUTH');
      assert.ok(capturedArgs[2]);
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('OTP_SEND_BLOCKED throws 429 OTP_SEND_BLOCKED', async () => {
    const restore = [];
    patch(repository, 'findPassengerOtpEligibilityByPhone', async () => null, restore);
    patch(otpHelper, 'createAndSendOTP', async () => {
      const err = new Error('OTP_SEND_BLOCKED:7'); err.statusCode = 429; throw err;
    }, restore);
    try {
      await assert.rejects(() => requestPassengerOTP({ rawPhone: '9800000007' }),
        (err) => { assert.equal(err.statusCode, 429); assert.equal(err.responseBody?.errorCode, 'OTP_SEND_BLOCKED'); return true; });
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('OTP_COOLDOWN throws 429 OTP_SEND_COOLDOWN', async () => {
    const restore = [];
    patch(repository, 'findPassengerOtpEligibilityByPhone', async () => null, restore);
    patch(otpHelper, 'createAndSendOTP', async () => {
      const err = new Error('OTP_COOLDOWN:45'); err.statusCode = 429; throw err;
    }, restore);
    try {
      await assert.rejects(() => requestPassengerOTP({ rawPhone: '9800000008' }),
        (err) => { assert.equal(err.statusCode, 429); assert.equal(err.responseBody?.errorCode, 'OTP_SEND_COOLDOWN'); return true; });
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('unexpected error propagates unmodified', async () => {
    const restore = [];
    patch(repository, 'findPassengerOtpEligibilityByPhone', async () => null, restore);
    patch(otpHelper, 'createAndSendOTP', async () => { throw new Error('DB_DOWN'); }, restore);
    try {
      await assert.rejects(() => requestPassengerOTP({ rawPhone: '9800000009' }), { message: 'DB_DOWN' });
    } finally { restore.reverse().forEach((fn) => fn()); }
  });
});
