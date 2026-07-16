'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const db = require('../helpers/db');
const app = require('../helpers/app');
const User = require('../../models/userModel');

test('Auth: Logout Contract Characterization', async (t) => {
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
      last_name: 'Contract',
      phone: '9855555555',
      password: hashedPassword,
      status: 'active',
      roles: ['passenger'],
      activeRole: 'passenger',
      tokenVersion: 0,
    });

    const loginRes = await request(app).post('/api/login').send({
      emailOrPhone: '9855555555',
      password,
    });
    const cookies = loginRes.headers['set-cookie'] || [];
    validRefreshToken = cookies.find(c => c.includes('refreshToken=')).split(';')[0].split('=')[1];
  });

  await t.test('POST /api/logout - Invalid token returns success response', async () => {
    const res = await request(app)
      .post('/api/logout')
      .set('Cookie', ['refreshToken=invalid-garbage-token']);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.message, 'Logged out successfully.');
  });

  await t.test('POST /api/logout - Already-revoked token returns success response', async () => {
    await request(app).post('/api/logout').set('Cookie', [`refreshToken=${validRefreshToken}`]);
    const res = await request(app)
      .post('/api/logout')
      .set('Cookie', [`refreshToken=${validRefreshToken}`]);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.message, 'Logged out successfully.');
  });

  await t.test('POST /api/logout - Cleared cookie includes Expires header', async () => {
    const res = await request(app).post('/api/logout');
    const cookies = res.headers['set-cookie'] || [];
    const cleared = cookies.find(c => c.includes('refreshToken='));
    assert.ok(cleared, 'set-cookie header must be present');
    assert.ok(cleared.toLowerCase().includes('expires='),
      `cookie must include Expires; got: ${cleared}`);
  });

  await t.test('POST /api/logout - Cleared cookie includes HttpOnly', async () => {
    const res = await request(app).post('/api/logout');
    const cookies = res.headers['set-cookie'] || [];
    const cleared = cookies.find(c => c.includes('refreshToken='));
    assert.ok(cleared.toLowerCase().includes('httponly'),
      `cookie must include HttpOnly; got: ${cleared}`);
  });

  await t.test('POST /api/logout - Cleared cookie includes SameSite=Lax', async () => {
    const res = await request(app).post('/api/logout');
    const cookies = res.headers['set-cookie'] || [];
    const cleared = cookies.find(c => c.includes('refreshToken='));
    assert.ok(cleared.toLowerCase().includes('samesite=lax'),
      `cookie must include SameSite=Lax; got: ${cleared}`);
  });

  await t.test('POST /api/logout - Body token fallback actually revokes the token', async () => {
    // Logout with token in body only (no cookie)
    const logoutRes = await request(app)
      .post('/api/logout')
      .send({ refreshToken: validRefreshToken });
    assert.equal(logoutRes.status, 200);
    assert.equal(logoutRes.body.success, true);

    // Prove the token was consumed — it must no longer be refreshable
    const refreshRes = await request(app)
      .post('/api/refresh')
      .set('Cookie', [`refreshToken=${validRefreshToken}`]);
    assert.equal(refreshRes.status, 401);
    assert.equal(refreshRes.body.success, false);
    assert.equal(refreshRes.body.message, 'Invalid or revoked refresh token. Please login again.');
  });

  await t.test('POST /api/logout - Revoked token cannot refresh', async () => {
    await request(app).post('/api/logout').set('Cookie', [`refreshToken=${validRefreshToken}`]);

    const res = await request(app)
      .post('/api/refresh')
      .set('Cookie', [`refreshToken=${validRefreshToken}`]);
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Invalid or revoked refresh token. Please login again.');
  });

  await t.test('POST /api/logout - Public route leaves tokenVersion unchanged', async () => {
    const before = (await User.findById(user._id)).tokenVersion ?? 0;
    await request(app).post('/api/logout').set('Cookie', [`refreshToken=${validRefreshToken}`]);
    const after = (await User.findById(user._id)).tokenVersion ?? 0;
    assert.equal(after, before, 'tokenVersion must not change on public logout');
  });
});
