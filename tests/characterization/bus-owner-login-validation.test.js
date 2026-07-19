'use strict';

process.env.SECRET_KEY ||= 'test-only-secret-32chars-minimum!!';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const db = require('../helpers/db');
const app = require('../helpers/app');
const User = require('../../models/userModel');

const credential = crypto.randomBytes(24).toString('hex');
const seed = (phone, fields = {}) => User.create({
  name: 'Operator Login',
  phone,
  password: bcrypt.hashSync(credential, 10),
  role: 'busOwner',
  roles: ['busOwner'],
  status: 'active',
  ...fields,
});

test('Bus-owner login validation characterization', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('route exists and empty JSON body returns missing phone', async () => {
    const res = await request(app).post('/api/auth/busowner/login').send({});
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { success: false, message: 'Phone number is required.' });
  });

  await t.test('missing phone with password returns missing phone first', async () => {
    const res = await request(app).post('/api/auth/busowner/login').send({ password: credential });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { success: false, message: 'Phone number is required.' });
  });

  await t.test('existing phone without password returns missing password', async () => {
    await seed('9814100001');
    const res = await request(app)
      .post('/api/auth/busowner/login')
      .send({ phone: '9814100001' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { success: false, message: 'Password is required.' });
  });

  await t.test('phone is preferred over emailOrPhone when both are truthy', async () => {
    await seed('9814100002');
    const res = await request(app)
      .post('/api/auth/busowner/login')
      .send({ phone: '9814999999', emailOrPhone: '9814100002', password: credential });
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { success: false, message: 'Invalid phone number or password.' });
  });

  await t.test('emailOrPhone is accepted as phone fallback', async () => {
    await seed('9814100003');
    const res = await request(app)
      .post('/api/auth/busowner/login')
      .send({ emailOrPhone: '9814100003', password: credential });
    assert.equal(res.status, 200);
    assert.equal(res.body.message, 'Login successful.');
  });

  await t.test('unknown account returns exact invalid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/busowner/login')
      .send({ phone: '9814100004', password: credential });
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { success: false, message: 'Invalid phone number or password.' });
  });

  await t.test('request with no parsed body preserves generic 500', async () => {
    const res = await request(app).post('/api/auth/busowner/login');
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, { success: false, message: 'Login failed. Please try again.' });
  });
});
