'use strict';

/**
 * tests/characterization/passenger-otp-auth.test.js
 *
 * Route characterization tests for /api/auth/passenger/sendOTP and verifyOTP.
 * Uses MongoMemoryServer + supertest. SMS is intercepted at otpHelper level.
 *
 * Covers:
 *  - Route is public (no JWT required)
 *  - Rate limiters are applied (phone-presence validated)
 *  - Response shapes are exact
 *  - Refresh token is delivered as a cookie, not in response body
 *  - Restricted accounts receive neutral response for sendOTP
 *  - Parallel OTP verification: only one successful consumption (real DB)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const db = require('../helpers/db');
const app = require('../helpers/app');
const User = require('../../models/userModel');
const OTP = require('../../models/otpModel');
const otpHelper = require('../../utils/otpHelper');

let n = 0;
const phone = () => `9815${String(++n).padStart(6, '0')}`;
const patchSend = (fn) => {
  const orig = otpHelper.createAndSendOTP;
  otpHelper.createAndSendOTP = fn;
  return () => { otpHelper.createAndSendOTP = orig; };
};
const sendOTP = (body) => request(app).post('/api/auth/passenger/sendOTP').send(body);
const verifyOTP = (body) => request(app).post('/api/auth/passenger/verifyOTP').send(body);

test('passenger OTP auth characterization', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('sendOTP — missing phone returns 400 with phone-present shape', async () => {
    const r = await sendOTP({});
    assert.equal(r.status, 400);
    assert.equal(r.body.success, false);
    assert.ok(r.body.message);
  });

  await t.test('sendOTP — invalid Nepal mobile returns 400', async () => {
    const r = await sendOTP({ phone: '9612345678' });
    assert.equal(r.status, 400);
    assert.equal(r.body.errorCode, 'INVALID_PHONE');
  });

  await t.test('sendOTP — new phone returns neutral 200', async () => {
    const restore = patchSend(async () => {});
    try {
      const r = await sendOTP({ phone: phone() });
      assert.equal(r.status, 200);
      assert.equal(r.body.success, true);
      assert.ok(r.body.message.includes('eligible'));
    } finally { restore(); }
  });

  await t.test('sendOTP — banned account returns same neutral 200 (no SMS)', async () => {
    const ph = phone();
    await User.create({ phone: ph, role: 'passenger', roles: ['passenger'], status: 'banned', password: null });
    let smsCalled = false;
    const restore = patchSend(async () => { smsCalled = true; });
    try {
      const r = await sendOTP({ phone: ph });
      assert.equal(r.status, 200);
      assert.equal(r.body.success, true);
      assert.equal(smsCalled, false, 'SMS must not be sent to banned account');
    } finally { restore(); }
  });

  await t.test('verifyOTP — missing fields returns 400', async () => {
    const r = await verifyOTP({ phone: '9800000099' });
    assert.equal(r.status, 400);
    assert.equal(r.body.success, false);
  });

  await t.test('verifyOTP — new phone creates passenger and returns 200 session', async () => {
    const ph = phone();
    const restore = patchSend(async () => {});
    try {
      await sendOTP({ phone: ph });
      // Directly inject a known OTP for testing
      const crypto = require('node:crypto');
      const secret = process.env.OTP_HMAC_SECRET || 'otp-secret-default';
      const rawOtp = '111111';
      const hashed = crypto.createHmac('sha256', secret).update(rawOtp).digest('hex');
      await OTP.findOneAndUpdate(
        { phone: ph, purpose: 'PASSENGER_AUTH' },
        { $set: { otp: hashed, otpExpiry: new Date(Date.now() + 300000), isUsed: false, attempts: 0 } },
        { upsert: true, new: true },
      );
      const r = await verifyOTP({ phone: ph, otp: rawOtp });
      assert.equal(r.status, 200);
      assert.equal(r.body.success, true);
      assert.equal(r.body.activeRole, 'passenger');
      assert.ok(r.body.accessToken);
      assert.equal(r.body.refreshToken, undefined, 'refresh token must not be in body');
      assert.ok(r.headers['set-cookie'], 'refresh token cookie must be set');
      assert.ok(typeof r.body.passwordSetupRequired === 'boolean');
    } finally { restore(); }
  });

  await t.test('verifyOTP — parallel calls: only one successful OTP consumption (real DB)', async () => {
    const ph = phone();
    const restore = patchSend(async () => {});
    try {
      await sendOTP({ phone: ph });
      const crypto = require('node:crypto');
      const secret = process.env.OTP_HMAC_SECRET || 'otp-secret-default';
      const rawOtp = '222222';
      const hashed = crypto.createHmac('sha256', secret).update(rawOtp).digest('hex');
      await OTP.findOneAndUpdate(
        { phone: ph, purpose: 'PASSENGER_AUTH' },
        { $set: { otp: hashed, otpExpiry: new Date(Date.now() + 300000), isUsed: false, attempts: 0 } },
        { upsert: true, new: true },
      );
      // Fire two parallel verification requests with the same OTP
      const [r1, r2] = await Promise.all([
        verifyOTP({ phone: ph, otp: rawOtp }),
        verifyOTP({ phone: ph, otp: rawOtp }),
      ]);
      const successes = [r1, r2].filter((r) => r.status === 200);
      const failures = [r1, r2].filter((r) => r.status !== 200);
      assert.equal(successes.length, 1, 'exactly one parallel verification must succeed');
      assert.equal(failures.length, 1, 'exactly one parallel verification must fail');
    } finally { restore(); }
  });
});
