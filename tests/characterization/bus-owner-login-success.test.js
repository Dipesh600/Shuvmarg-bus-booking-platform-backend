'use strict';

process.env.SECRET_KEY ||= 'test-only-secret-32chars-minimum!!';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const db = require('../helpers/db');
const app = require('../helpers/app');
const User = require('../../models/userModel');

const credential = crypto.randomBytes(24).toString('hex');
let n = 0;
const seed = (fields = {}) => User.create({
  name: 'Operator Success',
  phone: `98144${String(++n).padStart(5, '0')}`,
  password: bcrypt.hashSync(credential, 10),
  role: 'busOwner',
  roles: ['busOwner'],
  status: 'active',
  failedLoginAttempts: 2,
  lockedUntil: new Date(Date.now() - 1000),
  ...fields,
});
const login = (u) => request(app)
  .post('/api/auth/busowner/login')
  .send({ phone: u.phone, password: credential });
const refreshCookie = (res) => (res.headers['set-cookie'] || []).find((c) => c.startsWith('busOwnerRefreshToken='));

test('Bus-owner login success and force-password characterization', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('force-password branch returns tempToken, no normal session', async () => {
    const u = await seed({ forcePasswordChange: true });
    const res = await login(u);
    assert.equal(res.status, 200);
    assert.equal(res.body.message, 'You must change your temporary password before proceeding.');
    assert.equal(res.body.forcePasswordChange, true);
    assert.ok(res.body.tempToken);
    const decoded = jwt.verify(res.body.tempToken, process.env.SECRET_KEY);
    assert.equal(String(decoded.id), String(u._id));
    assert.equal(decoded.purpose, 'FORCE_PASSWORD_CHANGE');
    assert.equal(decoded.activeRole, 'busOwner');
    assert.ok(decoded.exp - decoded.iat <= 15 * 60);
    assert.equal(res.body.accessToken, undefined);
    assert.equal(refreshCookie(res), undefined);
    const fresh = await User.findById(u._id);
    assert.equal(fresh.failedLoginAttempts, 2);
    assert.equal(fresh.lastLoginAt, null);
  });

  await t.test('successful login body, cookie, and reset effects', async () => {
    const u = await seed();
    const res = await login(u);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.message, 'Login successful.');
    assert.ok(res.body.accessToken);
    assert.equal(res.body.activeRole, 'busOwner');
    assert.ok(res.body.user);
    assert.equal(res.body.user.password, undefined);
    assert.equal(res.body.refreshToken, undefined);
    const cookie = refreshCookie(res);
    assert.ok(cookie);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    assert.match(cookie, /Max-Age=604800/i);
    const token = cookie.split(';')[0].split('=')[1];
    const refresh = await request(app)
      .post('/api/auth/busowner/refresh')
      .set('Cookie', [`busOwnerRefreshToken=${token}`]);
    assert.equal(refresh.status, 200);
    const fresh = await User.findById(u._id);
    assert.equal(fresh.failedLoginAttempts, 0);
    assert.equal(fresh.lockedUntil, null);
    assert.ok(fresh.lastLoginAt);
  });
});
