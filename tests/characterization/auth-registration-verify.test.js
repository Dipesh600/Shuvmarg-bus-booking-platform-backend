'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const db = require('../helpers/db');
const app = require('../helpers/app');
const OTP = require('../../models/otpModel');
const User = require('../../models/userModel');

// Seed a valid OTP using HMAC the same way otpHelper does
async function seedValidOtp(phone, rawCode) {
  const hash = crypto.createHmac('sha256', process.env.SECRET_KEY).update(rawCode).digest('hex');
  await OTP.findOneAndUpdate(
    { phone, purpose: 'REGISTRATION' },
    { otp: hash, otpExpiry: new Date(Date.now() + 300000),
      isUsed: false, attempts: 0, sendCount: 1, maxAttempts: 5 },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

test('Auth Registration: verifyPhoneOTP', async (t) => {
  t.before(async () => await db.connect());
  t.after(async () => await db.disconnect());
  t.beforeEach(async () => await db.clearAll());

  await t.test('missing phone → 400 exact body', async () => {
    const res = await request(app).post('/api/verifyPhoneOTP').send({ otp: '123456' });
    assert.equal(res.status, 400);
    assert.equal(res.body.status, false);
    assert.equal(res.body.message, 'Phone number and OTP are required!');
  });

  await t.test('missing OTP → 400 exact body', async () => {
    const res = await request(app).post('/api/verifyPhoneOTP').send({ phone: '9800000010' });
    assert.equal(res.status, 400);
    assert.equal(res.body.status, false);
    assert.equal(res.body.message, 'Phone number and OTP are required!');
  });

  await t.test('non-6-digit OTP → 400 exact message', async () => {
    const res = await request(app).post('/api/verifyPhoneOTP').send({ phone: '9800000010', otp: '12345' });
    assert.equal(res.status, 400);
    assert.equal(res.body.status, false);
    assert.equal(res.body.message, 'OTP must be a 6-digit code.');
  });

  await t.test('OTP sanitization: "99-97-77" is stripped to "999777" before verifyOTPCode', async () => {
    const otpHelper = require('../../utils/otpHelper');
    let capturedOtp, capturedPurpose;
    const orig = otpHelper.verifyOTPCode;
    otpHelper.verifyOTPCode = async (ph, otp, purpose) => {
      capturedOtp = otp;
      capturedPurpose = purpose;
      return orig(ph, otp, purpose);
    };
    try {
      const phone = '9800000060';
      const rawCode = '999777';
      await seedValidOtp(phone, rawCode);
      await request(app).post('/api/verifyPhoneOTP').send({ phone, otp: '99-97-77' });
      assert.equal(capturedOtp, '999777');
      assert.equal(capturedPurpose, 'REGISTRATION');
    } finally {
      otpHelper.verifyOTPCode = orig;
    }
  });

  await t.test('no OTP record → 400', async () => {
    const res = await request(app).post('/api/verifyPhoneOTP').send({ phone: '9800000010', otp: '123456' });
    assert.equal(res.status, 400);
    assert.equal(res.body.status, false);
    assert.ok(res.body.message);
  });

  await t.test('success → 200 + verificationToken string + exact message', async () => {
    const phone = '9800000011';
    const rawCode = '999888';
    await seedValidOtp(phone, rawCode);
    const res = await request(app).post('/api/verifyPhoneOTP').send({ phone, otp: rawCode });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, true);
    assert.equal(res.body.message, 'Phone verified successfully! Please complete your registration.');
    assert.ok(typeof res.body.verificationToken === 'string');
  });

  await t.test('OTP record becomes isUsed:true after success', async () => {
    const phone = '9800000012';
    const rawCode = '777666';
    await seedValidOtp(phone, rawCode);
    await request(app).post('/api/verifyPhoneOTP').send({ phone, otp: rawCode });
    const record = await OTP.findOne({ phone, purpose: 'REGISTRATION' });
    assert.equal(record.isUsed, true);
  });

  await t.test('verificationToken decode: phone and purpose match', async () => {
    const phone = '9800000013';
    const rawCode = '555444';
    await seedValidOtp(phone, rawCode);
    const res = await request(app).post('/api/verifyPhoneOTP').send({ phone, otp: rawCode });
    assert.equal(res.status, 200);
    const decoded = jwt.decode(res.body.verificationToken);
    assert.equal(decoded.phone, phone);
    assert.equal(decoded.purpose, 'REGISTRATION');
  });

  await t.test('already-registered phone → 400 with generic failure message', async () => {
    const phone = '9800000014';
    await User.create({ phone, name: 'Reg', address: 'Y', gender: 'male', password: 'hashedpwd!!!',
      phoneVerified: true, isVerified: true, roles: ['passenger'], referralCode: 'SHUV-TST14' });
    await seedValidOtp(phone, '888777');
    const res = await request(app).post('/api/verifyPhoneOTP').send({ phone, otp: '888777' });
    assert.equal(res.status, 400);
    assert.equal(res.body.status, false);
    assert.match(res.body.message, /could not be completed/i);
  });

  await t.test('unexpected dependency failure → exact legacy 500 body', async () => {
    const otpHelper = require('../../utils/otpHelper');
    const orig = otpHelper.verifyOTPCode;
    otpHelper.verifyOTPCode = async () => { throw new Error('crash'); };
    try {
      const phone = '9800000015';
      await seedValidOtp(phone, '111222');
      const res = await request(app).post('/api/verifyPhoneOTP').send({ phone, otp: '111222' });
      assert.equal(res.status, 500);
      assert.equal(res.body.status, false);
      assert.equal(res.body.message, 'Failed to verify OTP!');
      assert.equal(res.body.error, 'crash');
    } finally {
      otpHelper.verifyOTPCode = orig;
    }
  });
});
