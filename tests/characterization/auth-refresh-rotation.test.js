'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const db = require('../helpers/db');
const app = require('../helpers/app');
const User = require('../../models/userModel');
const RefreshToken = require('../../models/refreshTokenModel');

test('Auth: Refresh Rotation Characterization', async (t) => {
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
      last_name: 'Rotation',
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
    validRefreshToken = cookies.find(c => c.startsWith('passengerRefreshToken=')).split(';')[0].split('=')[1];
  });

  await t.test('POST /api/refresh - Rotated token accepted for another refresh', async () => {
    const firstRes = await request(app)
      .post('/api/refresh')
      .set('Cookie', [`passengerRefreshToken=${validRefreshToken}`]);
    assert.equal(firstRes.status, 200);

    const cookies = firstRes.headers['set-cookie'] || [];
    const rotatedRaw = cookies.find(c => c.startsWith('passengerRefreshToken=')).split(';')[0].split('=')[1];

    const secondRes = await request(app)
      .post('/api/refresh')
      .set('Cookie', [`passengerRefreshToken=${rotatedRaw}`]);
    assert.equal(secondRes.status, 200);
    assert.equal(secondRes.body.success, true);
    assert.ok(secondRes.body.accessToken);
  });

  await t.test('POST /api/refresh - activeRole survives rotation', async () => {
    await request(app)
      .post('/api/refresh')
      .set('Cookie', [`passengerRefreshToken=${validRefreshToken}`]);

    const docs = await RefreshToken.find({ userId: user._id });
    assert.equal(docs.length, 1);
    assert.equal(docs[0].activeRole, 'passenger');
  });

  await t.test('POST /api/refresh - Original document replaced by exactly one new document', async () => {
    const before = await RefreshToken.findOne({ userId: user._id });
    assert.ok(before, 'a RefreshToken document must exist before rotation');
    const originalId = before._id.toString();

    await request(app)
      .post('/api/refresh')
      .set('Cookie', [`passengerRefreshToken=${validRefreshToken}`]);

    const docs = await RefreshToken.find({ userId: user._id });
    assert.equal(docs.length, 1, 'exactly one RefreshToken document should exist after rotation');
    assert.notEqual(docs[0]._id.toString(), originalId,
      'the replacement document must have a different _id');

    const gone = await RefreshToken.findById(originalId);
    assert.equal(gone, null, 'the original document must no longer exist');
  });

  await t.test('POST /api/refresh - ROLE_REVOKED exact response', async () => {
    await User.updateOne({ _id: user._id }, { roles: [] });

    const res = await request(app)
      .post('/api/refresh')
      .set('Cookie', [`passengerRefreshToken=${validRefreshToken}`]);
    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Your role has been revoked. Please login again.');
    assert.equal(res.body.errorCode, 'ROLE_REVOKED');
  });

  await t.test('POST /api/refresh - Expired token returns 401 with exact message', async () => {
    // Back-date the stored token so the service sees it as expired
    await RefreshToken.updateOne(
      { userId: user._id },
      { $set: { expiresAt: new Date(Date.now() - 1000) } }
    );

    const res = await request(app)
      .post('/api/refresh')
      .set('Cookie', [`passengerRefreshToken=${validRefreshToken}`]);
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Refresh token expired. Please login again.');
  });
});
