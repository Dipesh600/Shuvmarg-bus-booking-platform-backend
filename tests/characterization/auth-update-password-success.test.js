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
const newPassword = 'NewPass1';
const access = (u) => jwt.sign({
  id: u._id,
  role: 'passenger',
  activeRole: 'passenger',
  roles: ['passenger'],
  purpose: 'access',
  tokenVersion: u.tokenVersion ?? 0,
}, process.env.SECRET_KEY);

const makeUser = async () => User.create({
  name: 'Success User',
  phone: `9866${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`,
  password: await bcrypt.hash(oldPassword, 10),
  role: 'passenger',
  roles: ['passenger'],
  status: 'active',
  phoneVerified: true,
  isVerified: true,
  failedLoginAttempts: 2,
  lockedUntil: new Date(Date.now() + 50000),
  tokenVersion: 5,
});

test('Auth: updatePassword success contract', async (t) => {
  await db.connect();
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('successful password update clears state and revokes refresh tokens', async () => {
    const u = await makeUser();
    await tokenService.generateTokenPair(u);
    const res = await request(app).put('/api/updatePassword')
      .set('Authorization', `Bearer ${access(u)}`)
      .send({ oldPassword, newPassword });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      status: true,
      message: 'Password updated successfully! Please login again on all devices.',
    });
    assert.equal(res.body.accessToken, undefined);
    assert.equal(res.body.refreshToken, undefined);
    assert.equal(res.headers['set-cookie'], undefined);
    const stored = await User.findById(u._id).select('+password');
    assert.equal(await bcrypt.compare(newPassword, stored.password), true);
    assert.equal(await bcrypt.compare(oldPassword, stored.password), false);
    assert.equal(stored.failedLoginAttempts, 0);
    assert.equal(stored.lockedUntil, null);
    assert.equal(stored.tokenVersion, 5);
    assert.equal(await RefreshToken.countDocuments({ userId: u._id }), 0);
  });
});
