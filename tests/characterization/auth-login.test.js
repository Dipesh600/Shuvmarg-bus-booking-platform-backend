const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const db = require('../helpers/db');
const app = require('../helpers/app');
const User = require('../../models/userModel');
const RefreshToken = require('../../models/refreshTokenModel');

test('Auth: Login Characterization', async (t) => {
  let user;
  const password = 'TestPassword123!';
  const hashedPassword = await bcrypt.hash(password, 10);

  t.before(async () => await db.connect());
  t.after(async () => await db.disconnect());

  t.beforeEach(async () => {
    await db.clearAll();
    user = await User.create({
      first_name: 'Test',
      last_name: 'User',
      phone: '9800000000',
      password: hashedPassword,
      status: 'active',
      roles: ['passenger'],
      activeRole: 'passenger'
    });
  });

  await t.test('POST /api/login - Missing emailOrPhone', async () => {
    const res = await request(app).post('/api/login').send({ password: 'x' });
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Email or Phone is required!');
  });

  await t.test('POST /api/login - Missing password', async () => {
    const res = await request(app).post('/api/login').send({ emailOrPhone: '9800000000' });
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Password is required!');
  });

  await t.test('POST /api/login - Unknown account', async () => {
    const res = await request(app).post('/api/login').send({
      emailOrPhone: '9811111111',
      password: 'wrong',
    });
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Invalid credentials!');
  });

  await t.test('POST /api/login - Wrong password', async () => {
    const res = await request(app).post('/api/login').send({
      emailOrPhone: '9800000000',
      password: 'wrongpassword',
    });
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    // First wrong attempt: 4 remaining
    assert.equal(res.body.message, 'Invalid credentials! 4 attempt(s) remaining.');
  });

  await t.test('POST /api/login - Valid credentials', async () => {
    const res = await request(app).post('/api/login').send({
      emailOrPhone: '9800000000',
      password: password,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.message, 'Login successful');
    assert.equal(res.body.activeRole, 'passenger');
    assert.ok(res.body.accessToken);

    // user object: phone matches, no password field, no refreshToken in body
    assert.equal(res.body.user.phone, '9800000000');
    assert.equal(res.body.user.password, undefined);
    assert.equal(res.body.refreshToken, undefined);

    // refresh token delivered only via httpOnly cookie
    const cookies = res.headers['set-cookie'] || [];
    const refreshCookie = cookies.find(c => c.startsWith('passengerRefreshToken='));
    assert.ok(refreshCookie, 'refreshToken cookie must be set');
    assert.ok(refreshCookie.toLowerCase().includes('httponly'), 'cookie must be HttpOnly');
    assert.ok(refreshCookie.toLowerCase().includes('samesite=lax'), 'cookie must be SameSite=Lax');

    // RefreshToken record persisted with correct activeRole (stable assertions only)
    const stored = await RefreshToken.findOne({ userId: user._id });
    assert.ok(stored, 'RefreshToken document must exist for user');
    assert.equal(stored.activeRole, 'passenger', 'stored activeRole must be passenger');
  });

  await t.test('POST /api/login - Banned account', async () => {
    await User.findByIdAndUpdate(user._id, { status: 'banned' });
    const res = await request(app).post('/api/login').send({
      emailOrPhone: '9800000000',
      password: password,
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.equal(res.body.errorCode, 'ACCOUNT_BANNED');
    assert.equal(res.body.message, 'Your account has been banned.');
  });

  await t.test('POST /api/login - Invited account', async () => {
    await User.findByIdAndUpdate(user._id, { status: 'invited' });
    const res = await request(app).post('/api/login').send({
      emailOrPhone: '9800000000',
      password: password,
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.equal(res.body.errorCode, 'ACCOUNT_NOT_ACTIVATED');
  });

  await t.test('POST /api/login - forcePasswordChange: no accessToken, has tempToken', async () => {
    await User.findByIdAndUpdate(user._id, { forcePasswordChange: true });
    const res = await request(app).post('/api/login').send({
      emailOrPhone: '9800000000',
      password: password,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.forcePasswordChange, true);
    assert.ok(res.body.tempToken, 'tempToken must be present');
    assert.equal(res.body.accessToken, undefined, 'accessToken must be absent');
    assert.equal(res.body.message, 'You must change your temporary password before proceeding.');
  });
});
