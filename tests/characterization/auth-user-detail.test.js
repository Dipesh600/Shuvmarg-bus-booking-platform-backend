'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const db = require('../helpers/db');
const app = require('../helpers/app');
const User = require('../../models/userModel');

test('Auth: User Detail Characterization', async (t) => {
  let user;
  let validAccessToken;
  const password = 'TestPassword123!';

  t.before(async () => await db.connect());
  t.after(async () => await db.disconnect());

  t.beforeEach(async () => {
    await db.clearAll();
    const hashedPassword = await bcrypt.hash(password, 10);
    user = await User.create({
      first_name: 'Test',
      last_name: 'Detail',
      phone: '9822222222',
      password: hashedPassword,
      status: 'active',
      roles: ['passenger'],
      activeRole: 'passenger',
    });

    const loginRes = await request(app).post('/api/login').send({
      emailOrPhone: '9822222222',
      password,
    });
    validAccessToken = loginRes.body.accessToken;
  });

  await t.test('GET /api/getUserDetail - 401 without access token', async () => {
    const res = await request(app).get('/api/getUserDetail');
    assert.equal(res.status, 401);
  });

  await t.test('GET /api/getUserDetail - 200 with valid access token', async () => {
    const res = await request(app)
      .get('/api/getUserDetail')
      .set('Authorization', `Bearer ${validAccessToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.status, true);
    assert.equal(res.body.data.phone, '9822222222');
  });
});
