'use strict';

process.env.SECRET_KEY = process.env.SECRET_KEY || 'test-only-secret-32chars-minimum!!';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const db = require('../helpers/db');
const app = require('../helpers/app');
const User = require('../../models/userModel');
const tokenService = require('../../utils/tokenService');

const password = 'AgentPass123!';
const cookieToken = (res) => (res.headers['set-cookie'] || [])
  .find((c) => c.startsWith('refreshToken='))
  ?.split(';')[0]
  .split('=')[1];

const seed = async (phone = '9810000001') => {
  const user = await User.create({
    name: 'Agent Refresh',
    phone,
    password: await bcrypt.hash(password, 10),
    role: 'agent',
    roles: ['agent'],
    status: 'active',
  });
  const pair = await tokenService.generateTokenPair(user, {
    activeRole: 'agent',
    deviceInfo: 'seed',
    ipAddress: '127.0.0.1',
  });
  return { user, refreshToken: pair.refreshToken };
};

test('Agent session refresh characterization', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('route exists and missing token returns exact 401', async () => {
    const res = await request(app).post('/api/auth/agent/refresh');
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, {
      success: false,
      message: 'Session expired. Please sign in again.',
    });
  });

  await t.test('body refresh token rotates and omits refreshToken JSON', async () => {
    const { refreshToken } = await seed();
    const res = await request(app)
      .post('/api/auth/agent/refresh')
      .send({ refreshToken });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.message, 'Token refreshed successfully.');
    assert.ok(res.body.accessToken);
    assert.equal(res.body.refreshToken, undefined);
  });

  await t.test('cookie token rotates, sets exact cookie traits, and old token is unusable', async () => {
    const { refreshToken } = await seed('9810000002');
    const res = await request(app)
      .post('/api/auth/agent/refresh')
      .set('Cookie', [`refreshToken=${refreshToken}`]);
    assert.equal(res.status, 200);
    const setCookie = res.headers['set-cookie'] || [];
    const refreshCookie = setCookie.find((c) => c.startsWith('refreshToken='));
    assert.ok(refreshCookie);
    assert.match(refreshCookie, /HttpOnly/i);
    assert.match(refreshCookie, /SameSite=Lax/i);
    assert.match(refreshCookie, /Max-Age=604800/i);

    const oldRes = await request(app)
      .post('/api/auth/agent/refresh')
      .set('Cookie', [`refreshToken=${refreshToken}`]);
    assert.equal(oldRes.status, 401);
    assert.deepEqual(oldRes.body, {
      success: false,
      message: 'Session expired. Please sign in again.',
    });

    const newToken = cookieToken(res);
    const newRes = await request(app)
      .post('/api/auth/agent/refresh')
      .set('Cookie', [`refreshToken=${newToken}`]);
    assert.equal(newRes.status, 200);
    assert.ok(newRes.body.accessToken);
  });

  await t.test('cookie wins over body token', async () => {
    const cookiePair = await seed('9810000003');
    const bodyPair = await seed('9810000004');
    const res = await request(app)
      .post('/api/auth/agent/refresh')
      .set('Cookie', [`refreshToken=${cookiePair.refreshToken}`])
      .send({ refreshToken: bodyPair.refreshToken });
    assert.equal(res.status, 200);

    const bodyStillWorks = await request(app)
      .post('/api/auth/agent/refresh')
      .set('Cookie', [`refreshToken=${bodyPair.refreshToken}`]);
    assert.equal(bodyStillWorks.status, 200);
  });

  await t.test('invalid refresh token maps to exact session-expired 401', async () => {
    const res = await request(app)
      .post('/api/auth/agent/refresh')
      .send({ refreshToken: 'invalid' });
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, {
      success: false,
      message: 'Session expired. Please sign in again.',
    });
  });
});
