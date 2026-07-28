'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const request = require('supertest');
const app = require('../helpers/app');
const db = require('../helpers/db');
const User = require('../../models/userModel');
const OTP = require('../../models/otpModel');

const GOOD_PASSWORD = 'NewPass1';
const reset = (body) => request(app).post('/api/resetPassword').send(body);
const seedUser = (phone) => User.create({
  name: 'Reset Errors', phone, password: 'OldPass1', role: 'passenger',
  roles: ['passenger'], isVerified: true, deletedAt: null,
});
const seedOtp = async (phone, code) => {
  const otp = crypto.createHmac('sha256', process.env.SECRET_KEY).update(code).digest('hex');
  await OTP.findOneAndUpdate(
    { phone, purpose: 'PASSWORD_RESET' },
    { otp, otpExpiry: new Date(Date.now() + 300000), isUsed: false, attempts: 0, sendCount: 1, maxAttempts: 5 },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

test('Auth: resetPassword error contracts and ordering', async (t) => {
  await db.connect();
  t.after(() => db.disconnect());
  t.beforeEach(() => db.clearAll());

  const requiredBody = { status: false, message: 'All fields are required.' };

  await t.test('missing emailOrPhone -> exact 400', async () => {
    const res = await reset({ otp: '123456', newPassword: GOOD_PASSWORD });
    assert.equal(res.status, 400); assert.deepEqual(res.body, requiredBody);
  });

  await t.test('missing OTP -> exact 400', async () => {
    const res = await reset({ emailOrPhone: '9800002201', newPassword: GOOD_PASSWORD });
    assert.equal(res.status, 400); assert.deepEqual(res.body, requiredBody);
  });

  await t.test('missing newPassword -> exact 400', async () => {
    const res = await reset({ emailOrPhone: '9800002202', otp: '123456' });
    assert.equal(res.status, 400); assert.deepEqual(res.body, requiredBody);
  });

  await t.test('invalid sanitized OTP length -> exact 400', async () => {
    const res = await reset({ emailOrPhone: '9800002204', otp: '12', newPassword: GOOD_PASSWORD });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { status: false, message: 'Verification code must be 6 digits.' });
  });

  await t.test('incorrect OTP -> exact helper response', async () => {
    const phone = '9800002205';
    await seedUser(phone); await seedOtp(phone, '999000');
    const res = await reset({ emailOrPhone: phone, otp: '000001', newPassword: GOOD_PASSWORD });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { status: false, message: 'Incorrect OTP. 4 attempt(s) remaining.' });
  });

  await t.test('valid consumed OTP with no user -> exact 400', async () => {
    const phone = '9800002206';
    await seedOtp(phone, '111222');
    const res = await reset({ emailOrPhone: phone, otp: '111222', newPassword: GOOD_PASSWORD });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { status: false, message: 'No account found with this phone or email.' });
  });

  await t.test('OTP consumed before user-not-found response', async () => {
    const phone = '9800002207';
    await seedOtp(phone, '333444');
    await reset({ emailOrPhone: phone, otp: '333444', newPassword: GOOD_PASSWORD });
    const record = await OTP.findOne({ phone, purpose: 'PASSWORD_RESET' });
    assert.equal(record.isUsed, true);
  });

  await t.test('weak password -> exact 400 and consumes OTP', async () => {
    const phone = '9800002208';
    await seedUser(phone); await seedOtp(phone, '444555');
    const res = await reset({ emailOrPhone: phone, otp: '444555', newPassword: 'weak' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, {
      status: false,
      message: 'Password must be at least 8 characters long.',
      errors: [
        'Password must be at least 8 characters long.',
        'Password must contain at least one uppercase letter.',
        'Password must contain at least one number.',
      ],
    });
    const record = await OTP.findOne({ phone, purpose: 'PASSWORD_RESET' });
    assert.equal(record.isUsed, true);
  });
});
