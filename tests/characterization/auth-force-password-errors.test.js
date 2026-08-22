'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const createAuthTestApp = require('../helpers/auth-app');
const db = require('../helpers/db');
const User = require('../../models/userModel');
const otpHelper = require('../../utils/otpHelper');

const sign = (id, purpose = 'FORCE_PASSWORD_CHANGE', opts = {}) =>
  jwt.sign({ id, purpose }, process.env.SECRET_KEY, opts);

const user = (overrides = {}) => User.create({
  name: 'Force User',
  phone: `9800${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`,
  password: 'TempPass1',
  address: 'Kathmandu',
  gender: 'male',
  role: 'passenger',
  roles: ['passenger'],
  forcePasswordChange: true,
  ...overrides,
});

test('Auth: changeForcePassword error contracts', async (t) => {
  const { app, loginRateLimiters, teardown } = createAuthTestApp();
  await db.connect();
  t.after(async () => { await teardown(); await db.disconnect(); });
  t.beforeEach(async () => { await db.clearAll(); await loginRateLimiters.reset(); });

  await t.test('missing tempToken and missing newPassword', async () => {
    let res = await request(app).post('/api/changeForcePassword').send({ newPassword: 'Password1' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { success: false, message: 'Temp token and new password are required.' });
    res = await request(app).post('/api/changeForcePassword').send({ tempToken: 't' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { success: false, message: 'Temp token and new password are required.' });
  });

  await t.test('invalid and expired JWT', async () => {
    let res = await request(app).post('/api/changeForcePassword')
      .send({ tempToken: 'bad', newPassword: 'Password1' });
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { success: false, message: 'Temp token is invalid or expired. Please login again.' });
    const expired = jwt.sign({ id: 'x', purpose: 'FORCE_PASSWORD_CHANGE' }, process.env.SECRET_KEY, { expiresIn: -1 });
    res = await request(app).post('/api/changeForcePassword')
      .send({ tempToken: expired, newPassword: 'Password1' });
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { success: false, message: 'Temp token is invalid or expired. Please login again.' });
  });

  await t.test('wrong purpose and weak password', async () => {
    const u = await user();
    let res = await request(app).post('/api/changeForcePassword')
      .send({ tempToken: sign(u._id, 'OTHER'), newPassword: 'Password1' });
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { success: false, message: 'Invalid token purpose.' });
    res = await request(app).post('/api/changeForcePassword')
      .send({ tempToken: sign(u._id), newPassword: 'weak' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, {
      success: false,
      message: 'Password must be at least 8 characters long.',
      errors: [
        'Password must be at least 8 characters long.',
        'Password must contain at least one uppercase letter.',
        'Password must contain at least one number.',
      ],
    });
  });

  await t.test('invalid optional OTP preserves helper message and purpose', async () => {
    const u = await user();
    const orig = otpHelper.verifyOTPCode;
    try {
      otpHelper.verifyOTPCode = async (phone, otp, purpose) => {
        assert.deepEqual([phone, otp, purpose], ['9800000000', '123456', 'ACCOUNT_ACTIVATION']);
        return { valid: false, error: 'otp bad' };
      };
      const res = await request(app).post('/api/changeForcePassword').send({
        tempToken: sign(u._id),
        newPassword: 'Password1',
        phone: '9800000000',
        otp: '123456',
      });
      assert.equal(res.status, 400);
      assert.deepEqual(res.body, { success: false, message: 'otp bad' });
    } finally { otpHelper.verifyOTPCode = orig; }
  });

  await t.test('user not found and forcePasswordChange false', async () => {
    let res = await request(app).post('/api/changeForcePassword')
      .send({ tempToken: sign('64b64c64b64c64b64c64b64c'), newPassword: 'Password1' });
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { success: false, message: 'User not found.' });
    const u = await user({ forcePasswordChange: false });
    res = await request(app).post('/api/changeForcePassword')
      .send({ tempToken: sign(u._id), newPassword: 'Password1' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, {
      success: false,
      message: 'Password change is not required for this account.',
    });
  });

  await t.test('unexpected failure exact 500', async () => {
    const u = await user();
    const orig = bcrypt.hash;
    try {
      bcrypt.hash = async () => { throw new Error('hash down'); };
      const res = await request(app).post('/api/changeForcePassword')
        .send({ tempToken: sign(u._id), newPassword: 'Password1' });
      assert.equal(res.status, 500);
      assert.deepEqual(res.body, { success: false, message: 'Internal Server Error' });
    } finally { bcrypt.hash = orig; }
  });
});
