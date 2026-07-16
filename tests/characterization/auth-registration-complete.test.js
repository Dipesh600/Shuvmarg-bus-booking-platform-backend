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

// Seed a fresh used OTP + issue a valid verification token for `phone`
function issueValidToken(phone) {
  return jwt.sign(
    { phone, purpose: 'REGISTRATION', nonce: crypto.randomBytes(8).toString('hex') },
    process.env.VERIFICATION_TOKEN_SECRET,
    { expiresIn: '30m' }
  );
}

async function seedUsedOtp(phone, daysAgo = 0) {
  const updatedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  await OTP.findOneAndUpdate(
    { phone, purpose: 'REGISTRATION' },
    { otp: 'stub', otpExpiry: new Date(Date.now() + 300000), isUsed: true, attempts: 0, sendCount: 1, maxAttempts: 5 },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  // Force updatedAt back if testing expiry
  if (daysAgo > 0) {
    await OTP.updateOne({ phone, purpose: 'REGISTRATION' }, { $set: { updatedAt } });
  }
}

test('Auth Registration: completeRegistration', async (t) => {
  t.before(async () => await db.connect());
  t.after(async () => await db.disconnect());
  t.beforeEach(async () => await db.clearAll());

  const goodBody = (phone = '9800000020') => ({
    phone, name: 'Test User', address: 'Kathmandu', gender: 'male',
    password: 'StrongPass1', verificationToken: issueValidToken(phone),
  });

  await t.test('missing phone → 400', async () => {
    const res = await request(app).post('/api/completeRegistration').send({ name: 'A', address: 'B', gender: 'male', password: 'StrongPass1', verificationToken: 'x' });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /phone/i);
  });

  await t.test('invalid verification token → 400', async () => {
    const res = await request(app).post('/api/completeRegistration').send({ ...goodBody(), verificationToken: 'bad.token.here' });
    assert.equal(res.status, 400);
    assert.equal(res.body.status, false);
  });

  await t.test('no used OTP record → 400', async () => {
    const phone = '9800000021';
    const res = await request(app).post('/api/completeRegistration').send({ ...goodBody(phone), verificationToken: issueValidToken(phone) });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /not verified/i);
  });

  await t.test('duplicate phone → 409', async () => {
    const phone = '9800000022';
    await seedUsedOtp(phone);
    await User.create({ phone, name: 'Old', address: 'X', gender: 'male', password: 'hashedpwd!!!', phoneVerified: true, isVerified: true, roles: ['passenger'], referralCode: 'SHUV-OLD01' });
    const res = await request(app).post('/api/completeRegistration').send({ ...goodBody(phone), verificationToken: issueValidToken(phone) });
    assert.equal(res.status, 409);
    assert.equal(res.body.errorCode, 'PHONE_ALREADY_REGISTERED');
  });

  await t.test('weak password → 400 with errors array', async () => {
    const phone = '9800000023';
    await seedUsedOtp(phone);
    const res = await request(app).post('/api/completeRegistration').send({ ...goodBody(phone), password: 'weak', verificationToken: issueValidToken(phone) });
    assert.equal(res.status, 400);
    assert.ok(Array.isArray(res.body.errors));
    assert.ok(res.body.errors.length > 0);
  });

  await t.test('success without email → 201, correct fields', async () => {
    const phone = '9800000024';
    await seedUsedOtp(phone);
    const res = await request(app).post('/api/completeRegistration').send({ ...goodBody(phone), verificationToken: issueValidToken(phone) });
    assert.equal(res.status, 201);
    assert.equal(res.body.status, true);
    assert.ok(res.body.data.userId);
    assert.equal(res.body.data.phone, phone);

    const u = await User.findById(res.body.data.userId);
    assert.equal(u.phoneVerified, true);
    assert.equal(u.isVerified, true);
    assert.ok(u.roles.includes('passenger'));
    assert.ok(typeof u.referralCode === 'string');
  });

  await t.test('success with email → stored lowercase', async () => {
    const phone = '9800000025';
    await seedUsedOtp(phone);
    const res = await request(app).post('/api/completeRegistration').send({ ...goodBody(phone), email: 'TEST@EXAMPLE.COM', verificationToken: issueValidToken(phone) });
    assert.equal(res.status, 201);
    const u = await User.findById(res.body.data.userId);
    assert.equal(u.email, 'test@example.com');
  });
});
