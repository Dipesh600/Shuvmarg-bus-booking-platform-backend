'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

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

const goodBody = (phone = '9800000200') => ({
  phone, name: 'Test User', address: 'Kathmandu', gender: 'male',
  password: 'StrongPass1', verificationToken: issueValidToken(phone),
});

test('Auth Registration: completeRegistration — success contracts', async (t) => {
  t.before(async () => await db.connect());
  t.after(async () => await db.disconnect());
  t.beforeEach(async () => await db.clearAll());

  await t.test('success without email → 201, exact status+message, correct fields', async () => {
    const phone = '9800000200';
    await seedUsedOtp(phone);
    const res = await request(app).post('/api/completeRegistration').send(goodBody(phone));
    assert.equal(res.status, 201);
    assert.equal(res.body.status, true);
    assert.equal(res.body.message, 'Registration completed successfully!');
    assert.ok(res.body.data.userId);
    assert.equal(res.body.data.phone, phone);

    const u = await User.findById(res.body.data.userId);
    assert.equal(u.phoneVerified, true);
    assert.equal(u.isVerified, true);
    assert.ok(u.roles.includes('passenger'));
    assert.ok(typeof u.referralCode === 'string' && u.referralCode.length > 0);
  });

  await t.test('success without email → email field absent from stored user', async () => {
    const phone = '9800000201';
    await seedUsedOtp(phone);
    const res = await request(app).post('/api/completeRegistration').send(goodBody(phone));
    assert.equal(res.status, 201);
    const u = await User.findById(res.body.data.userId);
    assert.equal(u.email, undefined);
    assert.equal(res.body.data.email, undefined);
  });

  await t.test('success with email → stored lowercase+trimmed, returned in response', async () => {
    const phone = '9800000202';
    await seedUsedOtp(phone);
    const res = await request(app).post('/api/completeRegistration')
      .send({ ...goodBody(phone), email: '  TEST@EXAMPLE.COM  ' });
    assert.equal(res.status, 201);
    const u = await User.findById(res.body.data.userId);
    assert.equal(u.email, 'test@example.com');
    assert.equal(res.body.data.email, 'test@example.com');
  });

  await t.test('stored password differs from plaintext and bcrypt.compare returns true', async () => {
    const phone = '9800000203';
    await seedUsedOtp(phone);
    const plaintext = 'StrongPass1';
    const res = await request(app).post('/api/completeRegistration')
      .send({ ...goodBody(phone), password: plaintext });
    assert.equal(res.status, 201);
    const u = await User.findById(res.body.data.userId).select('+password');
    assert.ok(u.password !== plaintext, 'stored password must not equal plaintext');
    const match = await bcrypt.compare(plaintext, u.password);
    assert.ok(match, 'bcrypt.compare must return true');
  });

  await t.test('phoneVerified and isVerified are true; roles contains passenger', async () => {
    const phone = '9800000204';
    await seedUsedOtp(phone);
    const res = await request(app).post('/api/completeRegistration').send(goodBody(phone));
    assert.equal(res.status, 201);
    const u = await User.findById(res.body.data.userId);
    assert.equal(u.phoneVerified, true);
    assert.equal(u.isVerified, true);
    assert.ok(u.roles.includes('passenger'));
  });

  await t.test('generated referralCode is present on new user', async () => {
    const phone = '9800000205';
    await seedUsedOtp(phone);
    const res = await request(app).post('/api/completeRegistration').send(goodBody(phone));
    assert.equal(res.status, 201);
    const u = await User.findById(res.body.data.userId);
    assert.ok(u.referralCode, 'referralCode must be set');
    assert.match(u.referralCode, /^[A-Z0-9-]+$/);
  });
});
