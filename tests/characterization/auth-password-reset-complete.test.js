'use strict';

require('../helpers/app');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../helpers/app');
const db = require('../helpers/db');
const User = require('../../models/userModel');
const OTP = require('../../models/otpModel');
const RefreshToken = require('../../models/refreshTokenModel');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const HASHED_PW = '$2a$12$aaaaaaaaaaaaaaaaaaaaaa.BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

const seedUser = async (phone) => User.create({
  name: 'Reset Complete', phone, password: HASHED_PW,
  role: 'passenger', roles: ['passenger'], isVerified: true, deletedAt: null,
});
const seedOtp = async (phone, code) => {
  const hash = crypto.createHmac('sha256', process.env.SECRET_KEY).update(code).digest('hex');
  await OTP.findOneAndUpdate(
    { phone, purpose: 'PASSWORD_RESET' },
    { otp: hash, otpExpiry: new Date(Date.now() + 300000), isUsed: false, attempts: 0, sendCount: 1, maxAttempts: 5 },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};
const GOOD_PW = 'NewPass1';

test('Auth: resetPassword', async (t) => {
  await db.connect();
  t.after(() => db.disconnect());
  t.beforeEach(() => db.clearAll());

  await t.test('missing emailOrPhone → 400', async () => {
    const res = await request(app).post('/api/resetPassword').send({ otp: '123456', newPassword: GOOD_PW });
    assert.equal(res.status, 400); assert.equal(res.body.message, 'All fields are required.');
  });

  await t.test('missing otp → 400', async () => {
    const res = await request(app).post('/api/resetPassword').send({ emailOrPhone: '9800002201', newPassword: GOOD_PW });
    assert.equal(res.status, 400); assert.equal(res.body.message, 'All fields are required.');
  });

  await t.test('missing newPassword → 400', async () => {
    const res = await request(app).post('/api/resetPassword').send({ emailOrPhone: '9800002202', otp: '123456' });
    assert.equal(res.status, 400); assert.equal(res.body.message, 'All fields are required.');
  });

  await t.test('invalid sanitized OTP length → exact 400', async () => {
    const res = await request(app).post('/api/resetPassword').send({ emailOrPhone: '9800002204', otp: '12', newPassword: GOOD_PW });
    assert.equal(res.status, 400); assert.equal(res.body.message, 'Verification code must be 6 digits.');
  });

  await t.test('incorrect OTP → 400', async () => {
    const phone = '9800002205';
    await seedUser(phone); await seedOtp(phone, '999000');
    const res = await request(app).post('/api/resetPassword').send({ emailOrPhone: phone, otp: '000001', newPassword: GOOD_PW });
    assert.equal(res.status, 400); assert.equal(res.body.status, false);
  });

  await t.test('valid OTP, missing user → 400', async () => {
    const phone = '9800002206';
    await seedOtp(phone, '111222');
    const res = await request(app).post('/api/resetPassword').send({ emailOrPhone: phone, otp: '111222', newPassword: GOOD_PW });
    assert.equal(res.status, 400); assert.equal(res.body.message, 'No account found with this phone or email.');
  });

  await t.test('OTP consumed before user-not-found response', async () => {
    const phone = '9800002207';
    await seedOtp(phone, '333444');
    await request(app).post('/api/resetPassword').send({ emailOrPhone: phone, otp: '333444', newPassword: GOOD_PW });
    const rec = await OTP.findOne({ phone, purpose: 'PASSWORD_RESET' });
    assert.equal(rec.isUsed, true);
  });

  await t.test('weak password → 400 with errors array', async () => {
    const phone = '9800002208';
    await seedUser(phone); await seedOtp(phone, '444555');
    const res = await request(app).post('/api/resetPassword').send({ emailOrPhone: phone, otp: '444555', newPassword: 'weak' });
    assert.equal(res.status, 400); assert.ok(Array.isArray(res.body.errors));
  });

  await t.test('successful reset → exact 200 body', async () => {
    const phone = '9800002210';
    await seedUser(phone); await seedOtp(phone, '666777');
    const res = await request(app).post('/api/resetPassword').send({ emailOrPhone: phone, otp: '666777', newPassword: GOOD_PW });
    assert.equal(res.status, 200); assert.equal(res.body.status, true);
    assert.equal(res.body.message, 'Password reset successful. Please log in with your new password.');
  });

  await t.test('password stored hashed — compare succeeds', async () => {
    const phone = '9800002211';
    await seedUser(phone); await seedOtp(phone, '777888');
    await request(app).post('/api/resetPassword').send({ emailOrPhone: phone, otp: '777888', newPassword: GOOD_PW });
    const u = await User.findOne({ phone }).select('+password');
    assert.ok(await bcrypt.compare(GOOD_PW, u.password));
  });

  await t.test('refresh tokens revoked after reset', async () => {
    const phone = '9800002213';
    const u = await seedUser(phone);
    await RefreshToken.create({ userId: u._id, tokenHash: 'abc', expiresAt: new Date(Date.now() + 9999) });
    await seedOtp(phone, '889900');
    await request(app).post('/api/resetPassword').send({ emailOrPhone: phone, otp: '889900', newPassword: GOOD_PW });
    assert.equal(await RefreshToken.countDocuments({ userId: u._id }), 0);
  });

  await t.test('tokenVersion increments by 1', async () => {
    const phone = '9800002214';
    const u = await seedUser(phone);
    const before = u.tokenVersion || 0;
    await seedOtp(phone, '990011');
    await request(app).post('/api/resetPassword').send({ emailOrPhone: phone, otp: '990011', newPassword: GOOD_PW });
    const after = await User.findOne({ phone });
    assert.equal(after.tokenVersion, before + 1);
  });
});
