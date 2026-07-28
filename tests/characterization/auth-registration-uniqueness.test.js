'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const db = require('../helpers/db');
const app = require('../helpers/app');
const User = require('../../models/userModel');
const OTP = require('../../models/otpModel');

function issueValidToken(phone) {
  return jwt.sign(
    { phone, purpose: 'REGISTRATION', nonce: crypto.randomBytes(8).toString('hex') },
    process.env.VERIFICATION_TOKEN_SECRET,
    { expiresIn: '30m' }
  );
}

async function seedUsedOtp(phone) {
  await OTP.findOneAndUpdate(
    { phone, purpose: 'REGISTRATION' },
    { otp: 'stub', otpExpiry: new Date(Date.now() + 300000),
      isUsed: true, attempts: 0, sendCount: 1, maxAttempts: 5 },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

const goodBody = (phone) => ({
  phone, name: 'Test User', address: 'Kathmandu', gender: 'male',
  password: 'StrongPass1', verificationToken: issueValidToken(phone),
});

test('Auth Registration: completeRegistration — uniqueness and password', async (t) => {
  t.before(async () => await db.connect());
  t.after(async () => await db.disconnect());
  t.beforeEach(async () => await db.clearAll());

  await t.test('duplicate phone → 409 with exact body and errorCode', async () => {
    const phone = '9800000022';
    await seedUsedOtp(phone);
    await User.create({ phone, name: 'Old', address: 'X', gender: 'male', password: 'hashedpwd!!!',
      phoneVerified: true, isVerified: true, roles: ['passenger'], referralCode: 'SHUV-OLD01' });
    const res = await request(app).post('/api/completeRegistration')
      .send({ ...goodBody(phone), verificationToken: issueValidToken(phone) });
    assert.equal(res.status, 409);
    assert.equal(res.body.status, false);
    assert.equal(res.body.message, 'This phone number is already registered.');
    assert.equal(res.body.errorCode, 'PHONE_ALREADY_REGISTERED');
  });

  await t.test('duplicate email → 400 exact message', async () => {
    const phone = '9800000123';
    await seedUsedOtp(phone);
    await User.create({ phone: '9800000124', name: 'Existing', address: 'Y', gender: 'male',
      password: 'hashedpwd!!!', email: 'dup@example.com', phoneVerified: true, isVerified: true,
      roles: ['passenger'], referralCode: 'SHUV-DUP01' });
    const res = await request(app).post('/api/completeRegistration')
      .send({ ...goodBody(phone), email: 'dup@example.com', verificationToken: issueValidToken(phone) });
    assert.equal(res.status, 400);
    assert.equal(res.body.status, false);
    assert.equal(res.body.message, 'Email already exists!');
  });

  await t.test('weak password → 400 with non-empty errors array', async () => {
    const phone = '9800000023';
    await seedUsedOtp(phone);
    const res = await request(app).post('/api/completeRegistration')
      .send({ ...goodBody(phone), password: 'weak', verificationToken: issueValidToken(phone) });
    assert.equal(res.status, 400);
    assert.equal(res.body.status, false);
    assert.ok(Array.isArray(res.body.errors));
    assert.ok(res.body.errors.length > 0);
  });
});
