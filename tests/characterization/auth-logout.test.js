const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const db = require('../helpers/db');
const app = require('../helpers/app');
const User = require('../../models/userModel');

test('Auth: Logout Characterization', async (t) => {
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
      last_name: 'Logout',
      phone: '9844444444',
      password: hashedPassword,
      status: 'active',
      roles: ['passenger'],
      activeRole: 'passenger',
      tokenVersion: 1
    });

    const loginRes = await request(app).post('/api/login').send({
      emailOrPhone: '9844444444',
      password: password,
    });
    
    const cookies = loginRes.headers['set-cookie'] || [];
    validRefreshToken = cookies.find(c => c.includes('refreshToken=')).split(';')[0].split('=')[1];
  });

  await t.test('POST /api/logout - Success without token', async () => {
    const res = await request(app).post('/api/logout');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.message, 'Logged out successfully.');

    const cookies = res.headers['set-cookie'] || [];
    const clearedCookie = cookies.find(c => c.includes('refreshToken='));
    assert.ok(clearedCookie, 'should set a cookie');
    assert.ok(clearedCookie.toLowerCase().includes('expires='), 'should expire the cookie');
  });

  await t.test('POST /api/logout - Success with valid token (revokes token)', async () => {
    const res = await request(app).post('/api/logout').set('Cookie', [`refreshToken=${validRefreshToken}`]);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.message, 'Logged out successfully.');

    const cookies = res.headers['set-cookie'] || [];
    const clearedCookie = cookies.find(c => c.includes('refreshToken='));
    assert.ok(clearedCookie, 'should set a cookie');
    assert.ok(clearedCookie.toLowerCase().includes('expires='), 'should expire the cookie');

    // Token reuse should be prevented
    const reuseRes = await request(app).post('/api/refresh').set('Cookie', [`refreshToken=${validRefreshToken}`]);
    assert.equal(reuseRes.status, 401);
    assert.equal(reuseRes.body.success, false);
    assert.equal(reuseRes.body.message, 'Invalid or revoked refresh token. Please login again.');
  });
  
  await t.test('POST /api/logout - Does not increment tokenVersion (because no auth middleware)', async () => {
    const userBefore = await User.findById(user._id);
    const beforeTokenVersion = userBefore.tokenVersion || 0;
    
    await request(app).post('/api/logout').set('Cookie', [`refreshToken=${validRefreshToken}`]);
    
    const userAfter = await User.findById(user._id);
    assert.equal(userAfter.tokenVersion || 0, beforeTokenVersion);
  });
});
