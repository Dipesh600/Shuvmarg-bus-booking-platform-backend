'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../helpers/app');
const db = require('../helpers/db');
const User = require('../../models/userModel');
const RefreshToken = require('../../models/refreshTokenModel');
const tokenService = require('../../utils/tokenService');

const oldPassword = 'OldPass1';
const token = (u) => jwt.sign({
  id: u._id,
  role: 'passenger',
  activeRole: 'passenger',
  roles: ['passenger'],
  purpose: 'access',
  tokenVersion: u.tokenVersion ?? 0,
}, process.env.SECRET_KEY);

const user = async (failedLoginAttempts, tokenVersion = 3) => User.create({
  name: 'Attempt User',
  phone: `9855${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`,
  password: await bcrypt.hash(oldPassword, 10),
  role: 'passenger',
  roles: ['passenger'],
  status: 'active',
  phoneVerified: true,
  isVerified: true,
  failedLoginAttempts,
  lockedUntil: null,
  tokenVersion,
});

const wrong = (u) => request(app).put('/api/updatePassword')
  .set('Authorization', `Bearer ${token(u)}`)
  .send({ oldPassword: 'WrongPass1', newPassword: 'NewPass1' });

test('Auth: updatePassword failed-attempt characterization', async (t) => {
  await db.connect();
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('first wrong attempt increments only counter and keeps refresh tokens', async () => {
    const u = await user(0, 2);
    const pair = await tokenService.generateTokenPair(u);
    const hash = tokenService.hashToken(pair.refreshToken);
    const res = await wrong(u);
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, {
      success: false,
      message: 'Current password is incorrect. 4 attempt(s) remaining.',
    });
    const stored = await User.findById(u._id).select('+password');
    assert.equal(stored.failedLoginAttempts, 1);
    assert.equal(stored.lockedUntil, null);
    assert.equal(stored.tokenVersion, 2);
    assert.equal(await bcrypt.compare(oldPassword, stored.password), true);
    assert.ok(await RefreshToken.findOne({ tokenHash: hash }));
  });

  await t.test('wrong attempt after existing count preserves remaining math', async () => {
    const u = await user(3, 4);
    const res = await wrong(u);
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, {
      success: false,
      message: 'Current password is incorrect. 1 attempt(s) remaining.',
    });
    const stored = await User.findById(u._id);
    assert.equal(stored.failedLoginAttempts, 4);
    assert.equal(stored.lockedUntil, null);
    assert.equal(stored.tokenVersion, 4);
  });

  await t.test('fifth wrong attempt locks account and increments tokenVersion once', async () => {
    const u = await user(4, 8);
    const pair = await tokenService.generateTokenPair(u);
    const hash = tokenService.hashToken(pair.refreshToken);
    const before = Date.now();
    const res = await wrong(u);
    const after = Date.now();
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, {
      success: false,
      message: 'Too many failed attempts. Account locked for 15 minutes and all sessions revoked.',
    });
    const stored = await User.findById(u._id);
    assert.equal(stored.failedLoginAttempts, 5);
    assert.equal(stored.tokenVersion, 9);
    assert.ok(stored.lockedUntil.getTime() >= before + 15 * 60 * 1000 - 1000);
    assert.ok(stored.lockedUntil.getTime() <= after + 15 * 60 * 1000 + 1000);
    assert.ok(
      await RefreshToken.findOne({ tokenHash: hash }),
      'legacy flow must not revoke refresh tokens on lock',
    );
  });
});
