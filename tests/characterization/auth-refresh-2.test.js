'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const db = require('../helpers/db');
const app = require('../helpers/app');
const User = require('../../models/userModel');
const RefreshToken = require('../../models/refreshTokenModel');

test('Auth: Refresh Characterization 2', async (t) => {
  let user;
  let validRefreshToken;
  const password = 'TestPassword123!';

  t.before(async () => await db.connect());
  t.after(async () => await db.disconnect());

  t.beforeEach(async () => {
    await db.clearAll();
    const hashedPassword = await bcrypt.hash(password, 10);
    user = await User.create({
      first_name: 'Test',
      last_name: 'Refresh2',
      phone: '9811111111',
      password: hashedPassword,
      status: 'active',
      roles: ['passenger'],
      activeRole: 'passenger',
    });

    const loginRes = await request(app).post('/api/login').send({
      emailOrPhone: '9811111111',
      password,
    });
    const cookies = loginRes.headers['set-cookie'] || [];
    validRefreshToken = cookies.find(c => c.includes('refreshToken=')).split(';')[0].split('=')[1];
  });

  await t.test('POST /api/refresh - Rotated token accepted for another refresh', async () => {
    const firstRes = await request(app)
      .post('/api/refresh')
      .set('Cookie', [`refreshToken=${validRefreshToken}`]);
    assert.equal(firstRes.status, 200);

    const cookies = firstRes.headers['set-cookie'] || [];
    const rotatedRaw = cookies.find(c => c.includes('refreshToken=')).split(';')[0].split('=')[1];

    const secondRes = await request(app)
      .post('/api/refresh')
      .set('Cookie', [`refreshToken=${rotatedRaw}`]);
    assert.equal(secondRes.status, 200);
    assert.equal(secondRes.body.success, true);
    assert.ok(secondRes.body.accessToken);
  });

  await t.test('POST /api/refresh - activeRole survives rotation', async () => {
    const firstRes = await request(app)
      .post('/api/refresh')
      .set('Cookie', [`refreshToken=${validRefreshToken}`]);
    assert.equal(firstRes.status, 200);

    const cookies = firstRes.headers['set-cookie'] || [];
    const rotatedRaw = cookies.find(c => c.includes('refreshToken=')).split(';')[0].split('=')[1];

    const docs = await RefreshToken.find({ userId: user._id });
    assert.equal(docs.length, 1);
    assert.equal(docs[0].activeRole, 'passenger');

    // Rotated token also works
    const secondRes = await request(app)
      .post('/api/refresh')
      .set('Cookie', [`refreshToken=${rotatedRaw}`]);
    assert.equal(secondRes.status, 200);
  });

  await t.test('POST /api/refresh - Original RefreshToken document is removed after rotation', async () => {
    await request(app)
      .post('/api/refresh')
      .set('Cookie', [`refreshToken=${validRefreshToken}`]);

    const docs = await RefreshToken.find({ userId: user._id });
    // Old token is gone; exactly one new token exists
    assert.equal(docs.length, 1, 'exactly one RefreshToken document should exist after rotation');
  });

  await t.test('POST /api/refresh - ROLE_REVOKED exact response', async () => {
    // Trigger ROLE_REVOKED by removing the passenger role from the user in the DB
    await User.updateOne({ _id: user._id }, { roles: [] });

    const res = await request(app)
      .post('/api/refresh')
      .set('Cookie', [`refreshToken=${validRefreshToken}`]);
    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Your role has been revoked. Please login again.');
  });
});
