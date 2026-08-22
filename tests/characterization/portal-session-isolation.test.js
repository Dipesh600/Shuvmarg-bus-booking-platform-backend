'use strict';

process.env.SECRET_KEY ||= 'portal-session-isolation-secret-32chars';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const db = require('../helpers/db');
const app = require('../helpers/app');
const User = require('../../models/userModel');
const tokenService = require('../../utils/tokenService');

const seed = async (phone, activeRole) => {
  const user = await User.create({
    name: `${activeRole} session`, phone,
    password: await bcrypt.hash('PortalPass123!', 10),
    role: activeRole, roles: [activeRole], status: 'active',
  });
  return tokenService.generateTokenPair(user, { activeRole });
};

test('portal refresh sessions are isolated', async (t) => {
  await db.connect();
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('bus-owner refresh rejects a passenger session without consuming it', async () => {
    const passenger = await seed('9811111201', 'passenger');
    const wrongPortal = await request(app)
      .post('/api/auth/busowner/refresh')
      .set('Cookie', [`refreshToken=${passenger.refreshToken}`]);
    assert.equal(wrongPortal.status, 401);
    assert.equal(wrongPortal.body.errorCode, 'SESSION_ROLE_MISMATCH');

    const correctPortal = await request(app)
      .post('/api/refresh')
      .set('Cookie', [`passengerRefreshToken=${passenger.refreshToken}`]);
    assert.equal(correctPortal.status, 200);
  });

  await t.test('portal cookie wins over a stale legacy cookie', async () => {
    const passenger = await seed('9811111202', 'passenger');
    const owner = await seed('9811111203', 'busOwner');
    const response = await request(app)
      .post('/api/auth/busowner/refresh')
      .set('Cookie', [
        `refreshToken=${passenger.refreshToken}`,
        `busOwnerRefreshToken=${owner.refreshToken}`,
      ]);
    assert.equal(response.status, 200);
    assert.ok(response.body.accessToken);
  });
});
