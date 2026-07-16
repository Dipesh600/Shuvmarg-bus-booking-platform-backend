const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const db = require('../helpers/db');
const app = require('../helpers/app');
const User = require('../../models/userModel');

test('Auth: Session Characterization', async (t) => {
  let user;
  let validRefreshToken;
  let validAccessToken;

  const password = 'TestPassword123!';
  const hashedPassword = await bcrypt.hash(password, 10);

  t.before(async () => {
    await db.connect();
    user = await User.create({
      first_name: 'Test',
      last_name: 'Session',
      phone: '9822222222',
      password: hashedPassword,
      status: 'active',
      roles: ['passenger'],
      activeRole: 'passenger'
    });

    // Login to get tokens
    const loginRes = await request(app).post('/api/login').send({
      emailOrPhone: '9822222222',
      password: password,
    });
    
    validAccessToken = loginRes.body.accessToken;
    const cookies = loginRes.headers['set-cookie'] || [];
    validRefreshToken = cookies.find(c => c.includes('refreshToken=')).split(';')[0].split('=')[1];
  });

  t.after(async () => {
    await db.disconnect();
  });

  await t.test('GET /api/getUserDetail - Protected without token', async () => {
    const res = await request(app).get('/api/getUserDetail');
    // Auth middleware returns 401 without token
    assert.equal(res.status, 401);
  });

  await t.test('GET /api/getUserDetail - Protected with valid token', async () => {
    const res = await request(app)
      .get('/api/getUserDetail')
      .set('Authorization', `Bearer ${validAccessToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.status, true);
    assert.equal(res.body.data.phone, '9822222222');
  });

  await t.test('POST /api/refresh - Invalid refresh token', async () => {
    const res = await request(app)
      .post('/api/refresh')
      .set('Cookie', [`refreshToken=invalid_token`]);
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
  });

  await t.test('POST /api/refresh - Valid refresh token', async () => {
    const res = await request(app)
      .post('/api/refresh')
      .set('Cookie', [`refreshToken=${validRefreshToken}`]);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.accessToken);
    // Refresh token should be rotated
    const cookies = res.headers['set-cookie'] || [];
    const newRefreshCookie = cookies.find(c => c.includes('refreshToken='));
    assert.ok(newRefreshCookie);
    validRefreshToken = newRefreshCookie.split(';')[0].split('=')[1];
  });

  await t.test('POST /api/logout', async () => {
    const res = await request(app)
      .post('/api/logout')
      .set('Cookie', [`refreshToken=${validRefreshToken}`]);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });

  await t.test('POST /api/refresh - Reuse logged-out refresh token', async () => {
    const res = await request(app)
      .post('/api/refresh')
      .set('Cookie', [`refreshToken=${validRefreshToken}`]);
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
  });
});
