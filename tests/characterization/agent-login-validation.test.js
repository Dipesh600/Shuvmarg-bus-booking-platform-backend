'use strict';

process.env.SECRET_KEY ||= 'test-only-secret-32chars-minimum!!';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const db = require('../helpers/db');
const app = require('../helpers/app');
const User = require('../../models/userModel');

const password = 'AgentPass123!';
const seed = (phone) => User.create({
  name: 'Agent Login',
  phone,
  password: bcrypt.hashSync(password, 10),
  role: 'agent',
  roles: ['agent'],
  status: 'active',
});

test('Agent login validation characterization', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('route exists and empty JSON body returns missing phone', async () => {
    const res = await request(app).post('/api/auth/agent/login').send({});
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { success: false, message: 'Phone number is required.' });
  });

  await t.test('missing phone with password returns missing phone first', async () => {
    const res = await request(app).post('/api/auth/agent/login').send({ password });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { success: false, message: 'Phone number is required.' });
  });

  await t.test('existing phone without password returns missing password', async () => {
    await seed('9813100001');
    const res = await request(app).post('/api/auth/agent/login').send({ phone: '9813100001' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { success: false, message: 'Password is required.' });
  });

  await t.test('phone is preferred over emailOrPhone when both are truthy', async () => {
    await seed('9813100002');
    const res = await request(app)
      .post('/api/auth/agent/login')
      .send({ phone: '9813999999', emailOrPhone: '9813100002', password });
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { success: false, message: 'Invalid phone number or password.' });
  });

  await t.test('emailOrPhone is accepted as phone fallback', async () => {
    await seed('9813100003');
    const res = await request(app)
      .post('/api/auth/agent/login')
      .send({ emailOrPhone: '9813100003', password });
    assert.equal(res.status, 200);
    assert.equal(res.body.message, 'Login successful.');
  });

  await t.test('unknown account returns exact invalid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/agent/login')
      .send({ phone: '9813100004', password });
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { success: false, message: 'Invalid phone number or password.' });
  });

  await t.test('request with no parsed body preserves generic 500', async () => {
    const res = await request(app).post('/api/auth/agent/login');
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, { success: false, message: 'Login failed. Please try again.' });
  });
});
