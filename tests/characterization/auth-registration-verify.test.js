'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const db = require('../helpers/db');
const app = require('../helpers/app');
const User = require('../../models/userModel');
const OTP = require('../../models/otpModel');
const otpHelper = require('../../utils/otpHelper');

// Utility: create a consumed REGISTRATION OTP record for a phone
async function seedUsedOtp(phone) {
  const hash = otpHelper.generateOtpCode; // just used for the record
  await OTP.findOneAndUpdate(
    { phone, purpose: 'REGISTRATION' },
    { otp: 'stub-hash', otpExpiry: new Date(Date.now() + 300000), isUsed: true, attempts: 0, sendCount: 1, maxAttempts: 5 },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

test('Auth Registration: verifyPhoneOTP', async (t) => {
  t.before(async () => await db.connect());
  t.after(async () => await db.disconnect());
  t.beforeEach(async () => await db.clearAll());

  await t.test('POST /api/verifyPhoneOTP - missing phone → 400', async () => {
    const res = await request(app).post('/api/verifyPhoneOTP').send({ otp: '123456' });
    assert.equal(res.status, 400);
    assert.equal(res.body.status, false);
    assert.match(res.body.message, /required/i);
  });

  await t.test('POST /api/verifyPhoneOTP - missing otp → 400', async () => {
    const res = await request(app).post('/api/verifyPhoneOTP').send({ phone: '9800000010' });
    assert.equal(res.status, 400);
    assert.equal(res.body.status, false);
    assert.match(res.body.message, /required/i);
  });

  await t.test('POST /api/verifyPhoneOTP - non-6-digit OTP → 400', async () => {
    const res = await request(app).post('/api/verifyPhoneOTP').send({ phone: '9800000010', otp: '12345' });
    assert.equal(res.status, 400);
    assert.equal(res.body.status, false);
    assert.equal(res.body.message, 'OTP must be a 6-digit code.');
  });

  await t.test('POST /api/verifyPhoneOTP - no OTP record → 400', async () => {
    const res = await request(app).post('/api/verifyPhoneOTP').send({ phone: '9800000010', otp: '123456' });
    assert.equal(res.status, 400);
    assert.equal(res.body.status, false);
    assert.ok(res.body.message);
  });

  await t.test('POST /api/verifyPhoneOTP - success → 200 + verificationToken', async () => {
    const phone = '9800000011';
    // Use the real createAndSendOTP to seed proper OTP, then verify it
    const orig = require('../../utils/otpHelper');
    const realSend = orig.createAndSendOTP;
    let capturedCode;

    // Intercept the real OTP creation to capture the code
    orig.createAndSendOTP = async (p, purpose) => {
      const crypto = require('crypto');
      capturedCode = String(crypto.randomInt(100000, 999999));
      const result = await realSend.call(orig, p, purpose);
      return result;
    };

    // We need to directly seed a known OTP; use manual seeding instead
    orig.createAndSendOTP = realSend; // restore

    // Seed a valid known OTP manually
    const crypto = require('crypto');
    const rawOtp = '999888';
    const hmac = require('crypto').createHmac('sha256', process.env.SECRET_KEY).update(rawOtp).digest('hex');
    await OTP.findOneAndUpdate(
      { phone, purpose: 'REGISTRATION' },
      { otp: hmac, otpExpiry: new Date(Date.now() + 300000), isUsed: false, attempts: 0, sendCount: 1, maxAttempts: 5 },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const res = await request(app).post('/api/verifyPhoneOTP').send({ phone, otp: '999888' });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, true);
    assert.ok(typeof res.body.verificationToken === 'string');
    assert.match(res.body.message, /verified/i);

    // OTP record must now be consumed
    const otpRecord = await OTP.findOne({ phone, purpose: 'REGISTRATION' });
    assert.equal(otpRecord.isUsed, true);
  });
});
