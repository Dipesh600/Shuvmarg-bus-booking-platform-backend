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
const service = require('../../src/modules/bus-owner/auth/session/bus-owner-session.service');

const seed = async (phone = '9840000001') => {
  const user = await User.create({
    name: 'Bus Owner Logout',
    phone,
    password: await bcrypt.hash('BusOwnerPass123!', 10),
    role: 'busOwner',
    roles: ['busOwner'],
    status: 'active',
    tokenVersion: 3,
  });
  const pair = await tokenService.generateTokenPair(user, { activeRole: 'busOwner' });
  return { user, refreshToken: pair.refreshToken };
};

const assertLogout = (res) => {
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, {
    success: true,
    message: 'Logged out successfully.',
  });
  assert.equal(res.body.refreshToken, undefined);
};

const patch = (name, fn) => {
  const orig = service[name];
  service[name] = fn;
  return () => { service[name] = orig; };
};

test('Bus-owner session logout characterization', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('route exists; no token succeeds and clears cookie', async () => {
    const res = await request(app).post('/api/auth/busowner/logout');
    assertLogout(res);
    const cleared = (res.headers['set-cookie'] || [])
      .find((c) => c.startsWith('refreshToken='));
    assert.ok(cleared);
    assert.match(cleared, /Expires=/i);
    assert.match(cleared, /HttpOnly/i);
    assert.match(cleared, /SameSite=Lax/i);
  });

  await t.test('body and cookie tokens are revoked; cookie wins over body', async () => {
    const bodyPair = await seed();
    const bodyHash = tokenService.hashToken(bodyPair.refreshToken);
    const bodyRes = await request(app)
      .post('/api/auth/busowner/logout')
      .send({ refreshToken: bodyPair.refreshToken });
    assertLogout(bodyRes);
    assert.equal(await RefreshToken.findOne({ tokenHash: bodyHash }), null);

    const cookiePair = await seed('9840000002');
    const sparePair = await seed('9840000003');
    const spareHash = tokenService.hashToken(sparePair.refreshToken);
    const res = await request(app)
      .post('/api/auth/busowner/logout')
      .set('Cookie', [`refreshToken=${cookiePair.refreshToken}`])
      .send({ refreshToken: sparePair.refreshToken });
    assertLogout(res);
    assert.ok(await RefreshToken.findOne({ tokenHash: spareHash }));
    assert.equal(
      await RefreshToken.findOne({ tokenHash: tokenService.hashToken(cookiePair.refreshToken) }),
      null,
    );
  });

  await t.test('optional user ID increments tokenVersion only when present', async () => {
    const calls = [];
    const restore = patch('invalidateAccessToken', async (id) => calls.push(id));
    try {
      const missing = await request(app).post('/api/auth/busowner/logout');
      assertLogout(missing);
      assert.deepEqual(calls, []);
      const req = {
        cookies: {},
        body: {},
        userInfo: { id: 'u1' },
      };
      const res = {
        clearCookie: () => {},
        status: (code) => ({
          json: (body) => ({ code, body }),
        }),
      };
      await require('../../src/modules/bus-owner/auth/session').logout(req, res, assert.fail);
      assert.deepEqual(calls, ['u1']);
    } finally { restore(); }
  });

  await t.test('revocation failure returns exact 200 and attempts fallback clear', async () => {
    const restore = patch('revokeSessionToken', async () => { throw new Error('revoke'); });
    try {
      const res = await request(app)
        .post('/api/auth/busowner/logout')
        .send({ refreshToken: 'tok' });
      assertLogout(res);
      const clears = (res.headers['set-cookie'] || [])
        .filter((c) => c.startsWith('refreshToken='));
      assert.ok(clears.length >= 1);
    } finally { restore(); }
  });
});
