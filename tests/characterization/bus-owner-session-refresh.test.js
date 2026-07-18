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
const service = require('../../src/modules/bus-owner/auth/session/bus-owner-session.service');

const password = 'BusOwnerPass123!';
const cookieToken = (res) => (res.headers['set-cookie'] || [])
  .find((c) => c.startsWith('refreshToken='))
  ?.split(';')[0]
  .split('=')[1];

const seed = async (phone = '9830000001', extra = {}) => {
  const user = await User.create({
    name: 'Bus Owner Refresh',
    phone,
    password: await bcrypt.hash(password, 10),
    role: 'busOwner',
    roles: ['busOwner'],
    status: 'active',
    ...extra,
  });
  const pair = await tokenService.generateTokenPair(user, {
    activeRole: 'busOwner',
    deviceInfo: 'seed',
    ipAddress: '127.0.0.1',
  });
  return { user, refreshToken: pair.refreshToken };
};

const patchRotate = (fn) => {
  const orig = service.rotateSession;
  service.rotateSession = fn;
  return () => { service.rotateSession = orig; };
};

test('Bus-owner session refresh characterization', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('route exists and missing token returns exact 401', async () => {
    const res = await request(app).post('/api/auth/busowner/refresh');
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, {
      success: false,
      message: 'Session expired. Please sign in again.',
    });
  });

  await t.test('body and cookie tokens rotate; cookie wins over body', async () => {
    const cookiePair = await seed('9830000002');
    const bodyPair = await seed('9830000003');
    const res = await request(app)
      .post('/api/auth/busowner/refresh')
      .set('Cookie', [`refreshToken=${cookiePair.refreshToken}`])
      .send({ refreshToken: bodyPair.refreshToken });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.message, 'Token refreshed successfully.');
    assert.ok(res.body.accessToken);
    assert.equal(res.body.refreshToken, undefined);

    const bodyStillWorks = await request(app)
      .post('/api/auth/busowner/refresh')
      .set('Cookie', [`refreshToken=${bodyPair.refreshToken}`]);
    assert.equal(bodyStillWorks.status, 200);
  });

  await t.test('sets exact refresh cookie traits and preserves rotation behavior', async () => {
    const { refreshToken } = await seed('9830000004');
    const res = await request(app)
      .post('/api/auth/busowner/refresh')
      .set('Cookie', [`refreshToken=${refreshToken}`]);
    assert.equal(res.status, 200);
    const refreshCookie = (res.headers['set-cookie'] || [])
      .find((c) => c.startsWith('refreshToken='));
    assert.ok(refreshCookie);
    assert.match(refreshCookie, /HttpOnly/i);
    assert.match(refreshCookie, /SameSite=Lax/i);
    assert.match(refreshCookie, /Max-Age=604800/i);

    const oldRes = await request(app)
      .post('/api/auth/busowner/refresh')
      .set('Cookie', [`refreshToken=${refreshToken}`]);
    assert.equal(oldRes.status, 401);
    const newRes = await request(app)
      .post('/api/auth/busowner/refresh')
      .set('Cookie', [`refreshToken=${cookieToken(res)}`]);
    assert.equal(newRes.status, 200);
  });

  await t.test('metadata is forwarded with exact fallbacks', async () => {
    const calls = [];
    const restore = patchRotate(async (input) => {
      calls.push(input);
      return { accessToken: 'access', refreshToken: 'next' };
    });
    try {
      await request(app)
        .post('/api/auth/busowner/refresh')
        .set('User-Agent', 'BusOwnerWeb/1')
        .send({ refreshToken: 'body-token' });
      await request(app)
        .post('/api/auth/busowner/refresh')
        .unset('User-Agent')
        .send({ refreshToken: 'second-token' });
      assert.equal(calls[0].refreshToken, 'body-token');
      assert.equal(calls[0].deviceInfo, 'BusOwnerWeb/1');
      assert.ok(calls[0].ipAddress);
      assert.deepEqual(calls[1], {
        refreshToken: 'second-token',
        deviceInfo: null,
        ipAddress: calls[1].ipAddress,
      });
    } finally { restore(); }
  });

  await t.test('refresh error mappings are exact', async () => {
    const cases = [
      ['INVALID_REFRESH_TOKEN', 401, 'Session expired. Please sign in again.'],
      ['REFRESH_TOKEN_EXPIRED', 401, 'Session expired. Please sign in again.'],
      ['ACCOUNT_BANNED', 403, 'Your account has been suspended.'],
      ['ROLE_REVOKED', 403, 'Access revoked. Please contact support.'],
      ['OTHER', 401, 'Session could not be renewed. Please sign in again.'],
    ];
    for (const [message, status, bodyMessage] of cases) {
      const restore = patchRotate(async () => { throw new Error(message); });
      try {
        const res = await request(app)
          .post('/api/auth/busowner/refresh')
          .send({ refreshToken: 'tok' });
        assert.equal(res.status, status);
        assert.deepEqual(res.body, { success: false, message: bodyMessage });
      } finally { restore(); }
    }
  });
});
