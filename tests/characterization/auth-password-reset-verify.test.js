'use strict';

require('../helpers/app');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../helpers/app');
const db = require('../helpers/db');
const User = require('../../models/userModel');
const OTP = require('../../models/otpModel');
const crypto = require('crypto');

const HASHED_PW = '$2a$12$aaaaaaaaaaaaaaaaaaaaaa.BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

const seedUser = async (phone, extra = {}) =>
  User.create({ name: 'VR Tester', phone, password: HASHED_PW, role: 'passenger', roles: ['passenger'], isVerified: true, deletedAt: null, ...extra });

const seedOtp = async (phone, code) => {
  const hash = crypto.createHmac('sha256', process.env.SECRET_KEY).update(code).digest('hex');
  await OTP.findOneAndUpdate(
    { phone, purpose: 'PASSWORD_RESET' },
    { otp: hash, otpExpiry: new Date(Date.now() + 300000), isUsed: false, attempts: 0, sendCount: 1, maxAttempts: 5 },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

test('Auth: verifyOtpForReset', async (t) => {
  await db.connect();
  t.after(() => db.disconnect());
  t.beforeEach(() => db.clearAll());

  await t.test('missing emailOrPhone → 400', async () => {
    const res = await request(app).post('/api/verifyOtpForReset').send({ otp: '123456' });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'Phone/Email and OTP are required!');
  });

  await t.test('missing otp → 400', async () => {
    const res = await request(app).post('/api/verifyOtpForReset').send({ emailOrPhone: '9800001101' });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'Phone/Email and OTP are required!');
  });

  await t.test('invalid sanitized OTP length → 400', async () => {
    const res = await request(app).post('/api/verifyOtpForReset').send({ emailOrPhone: '9800001103', otp: '123' });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'OTP must be a 6-digit code.');
  });

  await t.test('no OTP record → generic 400', async () => {
    const res = await request(app).post('/api/verifyOtpForReset').send({ emailOrPhone: '9800001104', otp: '000000' });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'Invalid or expired verification code.');
  });

  await t.test('incorrect OTP → generic 400', async () => {
    const phone = '9800001105';
    await seedUser(phone); await seedOtp(phone, '777888');
    const res = await request(app).post('/api/verifyOtpForReset').send({ emailOrPhone: phone, otp: '000001' });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'Invalid or expired verification code.');
  });

  await t.test('valid phone-based OTP → 200 success', async () => {
    const phone = '9800001106';
    await seedUser(phone); await seedOtp(phone, '555666');
    const res = await request(app).post('/api/verifyOtpForReset').send({ emailOrPhone: phone, otp: '555666' });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, true);
    assert.equal(res.body.message, 'OTP verified. Proceed to reset password.');
  });

  await t.test('OTP remains isUsed:false after verifyOtpForReset (peek only)', async () => {
    const phone = '9800001107';
    await seedUser(phone); await seedOtp(phone, '112233');
    await request(app).post('/api/verifyOtpForReset').send({ emailOrPhone: phone, otp: '112233' });
    const record = await OTP.findOne({ phone, purpose: 'PASSWORD_RESET' });
    assert.equal(record.isUsed, false);
  });

  await t.test('valid OTP with no active user → generic 400', async () => {
    const phone = '9800001108';
    await seedOtp(phone, '998877');
    const res = await request(app).post('/api/verifyOtpForReset').send({ emailOrPhone: phone, otp: '998877' });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'Invalid or expired verification code.');
  });

  await t.test('unexpected failure → exact 500 body', async () => {
    const otpHelper = require('../../utils/otpHelper');
    const orig = otpHelper.verifyOTPCode;
    otpHelper.verifyOTPCode = async () => { throw new Error('db crash'); };
    try {
      const phone = '9800001109';
      await seedUser(phone); await seedOtp(phone, '334455');
      const res = await request(app).post('/api/verifyOtpForReset').send({ emailOrPhone: phone, otp: '334455' });
      assert.equal(res.status, 500); assert.equal(res.body.status, false);
      assert.equal(res.body.message, 'Internal Server Error');
    } finally { otpHelper.verifyOTPCode = orig; }
  });

  await t.test('email-started flow fails generically (known legacy defect)', async () => {
    const phone = '9800001110';
    const u = await seedUser(phone);
    u.email = 'ldefect@test.com'; await u.save();
    await seedOtp(phone, '667788');
    const res = await request(app).post('/api/verifyOtpForReset').send({ emailOrPhone: 'ldefect@test.com', otp: '667788' });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'Invalid or expired verification code.');
  });
});
