const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const db = require('../helpers/db');
const app = require('../helpers/app');
const User = require('../../models/userModel');

test('Auth: Login Characterization', async (t) => {
  let user;
  const password = 'TestPassword123!';
  const hashedPassword = await bcrypt.hash(password, 10);

  t.before(async () => await db.connect());
  t.after(async () => await db.disconnect());

  t.beforeEach(async () => {
    await User.deleteMany({});
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

  await t.test('POST /api/login - Missing credentials', async () => {
    const res = await request(app).post('/api/login').send({});
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });

  await t.test('POST /api/login - Unknown account', async () => {
    const res = await request(app).post('/api/login').send({
      emailOrPhone: '9811111111',
      password: 'wrong',
    });
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
  });

  await t.test('POST /api/login - Wrong password', async () => {
    const res = await request(app).post('/api/login').send({
      emailOrPhone: '9800000000',
      password: 'wrongpassword',
    });
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
  });

  await t.test('POST /api/login - Valid credentials', async () => {
    const res = await request(app).post('/api/login').send({
      emailOrPhone: '9800000000',
      password: password,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.accessToken);
    const cookies = res.headers['set-cookie'] || [];
    assert.ok(cookies.some(cookie => cookie.includes('refreshToken=')));
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

  await t.test('POST /api/login - forcePasswordChange', async () => {
    await User.findByIdAndUpdate(user._id, { forcePasswordChange: true });
    const res = await request(app).post('/api/login').send({
      emailOrPhone: '9800000000',
      password: password,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.forcePasswordChange, true);
    assert.ok(res.body.tempToken);
  });
});
