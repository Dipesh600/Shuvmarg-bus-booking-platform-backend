const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const db = require('../helpers/db');
const app = require('../helpers/app');
const User = require('../../models/userModel');

test('Auth: Refresh Characterization', async (t) => {
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
      last_name: 'Refresh',
      phone: '9833333333',
      password: hashedPassword,
      status: 'active',
      roles: ['passenger'],
      activeRole: 'passenger'
    });

    const loginRes = await request(app).post('/api/login').send({
      emailOrPhone: '9833333333',
      password: password,
    });
    
    const cookies = loginRes.headers['set-cookie'] || [];
    validRefreshToken = cookies.find(c => c.startsWith('passengerRefreshToken=')).split(';')[0].split('=')[1];
  });

  await t.test('POST /api/refresh - Missing refresh token', async () => {
    const res = await request(app).post('/api/refresh');
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Refresh token is required.');
  });

  await t.test('POST /api/refresh - Invalid refresh token', async () => {
    const res = await request(app).post('/api/refresh').set('Cookie', [`refreshToken=invalid_token`]);
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Invalid or revoked refresh token. Please login again.');
  });

  await t.test('POST /api/refresh - User not found (deleted after login)', async () => {
    await User.deleteOne({ _id: user._id });
    const res = await request(app).post('/api/refresh').set('Cookie', [`refreshToken=${validRefreshToken}`]);
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'User not found. Please login again.');
  });

  await t.test('POST /api/refresh - Account deactivated', async () => {
    await User.updateOne({ _id: user._id }, { deletedAt: new Date() });
    const res = await request(app).post('/api/refresh').set('Cookie', [`refreshToken=${validRefreshToken}`]);
    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'This account has been deactivated. Contact support.');
  });

  await t.test('POST /api/refresh - Account banned', async () => {
    await User.updateOne({ _id: user._id }, { status: 'banned' });
    const res = await request(app).post('/api/refresh').set('Cookie', [`refreshToken=${validRefreshToken}`]);
    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Your account has been banned. Contact support.');
  });

  await t.test('POST /api/refresh - Rotation and reuse prevention', async () => {
    const res = await request(app).post('/api/refresh').set('Cookie', [`refreshToken=${validRefreshToken}`]);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.message, 'Token refreshed successfully.');
    assert.ok(res.body.accessToken);
    assert.equal(res.body.refreshToken, undefined, 'refreshToken must not appear in body');

    const cookies = res.headers['set-cookie'] || [];
    const rotatedCookie = cookies.find(c => c.startsWith('passengerRefreshToken='));
    assert.ok(rotatedCookie, 'rotated refreshToken cookie must be set');
    assert.ok(rotatedCookie.toLowerCase().includes('httponly'), 'rotated cookie must be HttpOnly');
    assert.ok(rotatedCookie.toLowerCase().includes('samesite=lax'), 'rotated cookie must be SameSite=Lax');

    // reuse of original token must be rejected
    const reuseRes = await request(app).post('/api/refresh').set('Cookie', [`refreshToken=${validRefreshToken}`]);
    assert.equal(reuseRes.status, 401);
    assert.equal(reuseRes.body.success, false);
    assert.equal(reuseRes.body.message, 'Invalid or revoked refresh token. Please login again.');
  });

  await t.test('POST /api/refresh - Body token fallback', async () => {
    const res = await request(app)
      .post('/api/refresh')
      .send({ refreshToken: validRefreshToken });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.accessToken);
  });

  await t.test('POST /api/refresh - Cookie takes precedence over body', async () => {
    // Body carries a garbage token; cookie carries the real one.
    const res = await request(app)
      .post('/api/refresh')
      .set('Cookie', [`refreshToken=${validRefreshToken}`])
      .send({ refreshToken: 'wrong-body-token' });
    assert.equal(res.status, 200, 'cookie token should win and refresh successfully');
    assert.equal(res.body.success, true);
    assert.ok(res.body.accessToken);
  });
});
