'use strict';

process.env.SECRET_KEY = process.env.SECRET_KEY || 'test-only-secret-32chars-minimum!!';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const db = require('../helpers/db');
const app = require('../helpers/app');
const User = require('../../models/userModel');
const RefreshToken = require('../../models/refreshTokenModel');
const tokenService = require('../../utils/tokenService');

const seed = async (phone = '9820000001') => {
  const user = await User.create({
    name: 'Agent Logout',
    phone,
    password: await bcrypt.hash('AgentPass123!', 10),
    role: 'agent',
    roles: ['agent'],
    status: 'active',
    tokenVersion: 3,
  });
  const pair = await tokenService.generateTokenPair(user, { activeRole: 'agent' });
  return { user, refreshToken: pair.refreshToken };
};

const assertNormalLogout = (res) => {
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, {
    success: true,
    message: 'Logged out successfully.',
  });
  assert.equal(res.body.refreshToken, undefined);
};

test('Agent session logout characterization', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('route exists; no token still succeeds and clears cookie', async () => {
    const res = await request(app).post('/api/auth/agent/logout');
    assertNormalLogout(res);
    const cleared = (res.headers['set-cookie'] || [])
      .find((c) => c.startsWith('refreshToken='));
    assert.ok(cleared);
    assert.match(cleared, /Expires=/i);
    assert.match(cleared, /HttpOnly/i);
    assert.match(cleared, /SameSite=Lax/i);
  });

  await t.test('body token is accepted and existing refresh token is revoked', async () => {
    const { refreshToken } = await seed();
    const tokenHash = tokenService.hashToken(refreshToken);
    const res = await request(app)
      .post('/api/auth/agent/logout')
      .send({ refreshToken });
    assertNormalLogout(res);
    assert.equal(await RefreshToken.findOne({ tokenHash }), null);
  });

  await t.test('cookie token is accepted and revoked', async () => {
    const { refreshToken } = await seed('9820000002');
    const res = await request(app)
      .post('/api/auth/agent/logout')
      .set('Cookie', [`refreshToken=${refreshToken}`]);
    assertNormalLogout(res);
    const reuse = await request(app)
      .post('/api/auth/agent/refresh')
      .set('Cookie', [`refreshToken=${refreshToken}`]);
    assert.equal(reuse.status, 401);
  });

  await t.test('cookie wins over body token', async () => {
    const cookiePair = await seed('9820000003');
    const bodyPair = await seed('9820000004');
    const bodyHash = tokenService.hashToken(bodyPair.refreshToken);
    const res = await request(app)
      .post('/api/auth/agent/logout')
      .set('Cookie', [`refreshToken=${cookiePair.refreshToken}`])
      .send({ refreshToken: bodyPair.refreshToken });
    assertNormalLogout(res);
    assert.ok(await RefreshToken.findOne({ tokenHash: bodyHash }));
    assert.equal(
      await RefreshToken.findOne({ tokenHash: tokenService.hashToken(cookiePair.refreshToken) }),
      null,
    );
  });
});
