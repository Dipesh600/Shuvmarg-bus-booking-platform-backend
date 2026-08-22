'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const createAuthTestApp = require('../helpers/auth-app');
const db = require('../helpers/db');
const User = require('../../models/userModel');
const RefreshToken = require('../../models/refreshTokenModel');
const otpHelper = require('../../utils/otpHelper');
const tokenService = require('../../utils/tokenService');

const makeUser = () => User.create({
  name: 'Force User',
  phone: `9811${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`,
  password: 'TempPass1',
  address: 'Kathmandu',
  gender: 'male',
  role: 'passenger',
  roles: ['passenger'],
  forcePasswordChange: true,
  phoneVerified: false,
  tokenVersion: 2,
});
const sign = (id) => jwt.sign({ id, purpose: 'FORCE_PASSWORD_CHANGE' }, process.env.SECRET_KEY);

test('Auth: changeForcePassword success and partial OTP legacy behavior', async (t) => {
  const { app, loginRateLimiters, teardown } = createAuthTestApp();
  await db.connect();
  t.after(async () => { await teardown(); await db.disconnect(); });
  t.beforeEach(async () => { await db.clearAll(); await loginRateLimiters.reset(); });

  await t.test('success returns accessToken, cookie-only refreshToken, flags and token revocation', async () => {
    const u = await makeUser();
    const oldPair = await tokenService.generateTokenPair(u, { deviceInfo: 'old', ipAddress: 'oldip' });
    const oldHash = tokenService.hashToken(oldPair.refreshToken);
    const res = await request(app)
      .post('/api/changeForcePassword')
      .set('User-Agent', 'ForceBrowser/1.0')
      .send({ tempToken: sign(u._id), newPassword: 'NewPass1' });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.message, 'Password changed successfully. Welcome!');
    assert.ok(res.body.accessToken);
    assert.ok(res.body.user);
    assert.equal(res.body.refreshToken, undefined);
    assert.equal(res.body.user.password, undefined);
    const stored = await User.findById(u._id).select('+password');
    assert.equal(stored.forcePasswordChange, false);
    assert.equal(stored.phoneVerified, false);
    assert.equal(stored.tokenVersion, 3);
    assert.equal(await bcrypt.compare('NewPass1', stored.password), true);
    assert.equal(await RefreshToken.findOne({ tokenHash: oldHash }), null);
    const tokens = await RefreshToken.find({ userId: u._id });
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0].deviceInfo, 'ForceBrowser/1.0');
    const cookie = res.headers['set-cookie'].find((c) => c.startsWith('passengerRefreshToken='));
    assert.ok(cookie.includes('HttpOnly'));
    assert.ok(cookie.includes('SameSite=Lax'));
    assert.ok(cookie.includes('Max-Age=604800'));
  });

  await t.test('phone without otp is ignored and continues through success', async () => {
    const u = await makeUser();
    const orig = otpHelper.verifyOTPCode;
    let called = false;
    try {
      otpHelper.verifyOTPCode = async () => { called = true; throw new Error('should not verify'); };
      const res = await request(app).post('/api/changeForcePassword').send({
        tempToken: sign(u._id),
        newPassword: 'NewPass1',
        phone: '9800000000',
      });
      assert.equal(res.status, 200);
      assert.equal(called, false);
    } finally { otpHelper.verifyOTPCode = orig; }
  });

  await t.test('otp without phone is ignored and continues through success', async () => {
    const u = await makeUser();
    const orig = otpHelper.verifyOTPCode;
    let called = false;
    try {
      otpHelper.verifyOTPCode = async () => { called = true; throw new Error('should not verify'); };
      const res = await request(app).post('/api/changeForcePassword').send({
        tempToken: sign(u._id),
        newPassword: 'NewPass1',
        otp: '123456',
      });
      assert.equal(res.status, 200);
      assert.equal(called, false);
    } finally { otpHelper.verifyOTPCode = orig; }
  });

  await t.test('no cookie is set when generateTokenPair omits refreshToken', async () => {
    const u = await makeUser();
    const orig = tokenService.generateTokenPair;
    try {
      tokenService.generateTokenPair = async () => ({ accessToken: 'access-only', refreshToken: null });
      const res = await request(app).post('/api/changeForcePassword')
        .send({ tempToken: sign(u._id), newPassword: 'NewPass1' });
      assert.equal(res.status, 200);
      assert.equal(res.body.accessToken, 'access-only');
      assert.equal(res.headers['set-cookie'], undefined);
    } finally { tokenService.generateTokenPair = orig; }
  });
});
