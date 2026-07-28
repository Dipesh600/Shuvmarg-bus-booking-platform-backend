'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../helpers/app');
const db = require('../helpers/db');
const User = require('../../models/userModel');

const access = (u) => jwt.sign({
  id: u._id, role: 'passenger', activeRole: 'passenger',
  roles: ['passenger'], purpose: 'access', tokenVersion: u.tokenVersion ?? 0,
}, process.env.SECRET_KEY);
const user = () => User.create({
  name: 'Profile User', phone: `97${Math.random().toString().slice(2, 10)}`,
  password: 'Password1', role: 'passenger', roles: ['passenger'],
  status: 'active', isVerified: true, phoneVerified: true,
  referralCode: 'SHUV-PROFILE',
});

test('Auth profile update error contracts', async (t) => {
  await db.connect();
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('missing auth and no update fields preserve exact bodies', async () => {
    assert.equal((await request(app).patch('/api/updateProfile')).status, 401);
    const u = await user();
    const res = await request(app).patch('/api/updateProfile')
      .set('Authorization', `Bearer ${access(u)}`).send({});
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, {
      status: false,
      message: 'At least one field (name, address, gender, or profilePic) is required to update',
    });
  });

  await t.test('field validation messages and non-string gender generic 500', async () => {
    const u = await user();
    const cases = [
      [{ name: 'ab' }, 'Name must be at least 3 characters long'],
      [{ address: 'road' }, 'Address must be at least 5 characters long'],
      [{ gender: 'other' }, "Gender must be either 'male' or 'female'"],
    ];
    for (const [body, message] of cases) {
      const res = await request(app).patch('/api/updateProfile')
        .set('Authorization', `Bearer ${access(u)}`).send(body);
      assert.equal(res.status, 400);
      assert.deepEqual(res.body, { status: false, message });
    }
    const generic = await request(app).patch('/api/updateProfile')
      .set('Authorization', `Bearer ${access(u)}`).send({ gender: 1 });
    assert.equal(generic.status, 500);
    assert.deepEqual(generic.body, { status: false, message: 'Internal server error' });
  });

  await t.test('unsupported file type is endpoint-specific', async () => {
    const u = await user();
    const res = await request(app).patch('/api/updateProfile')
      .set('Authorization', `Bearer ${access(u)}`)
      .attach('profilePic', Buffer.from('x'), { filename: 'x.txt', contentType: 'text/plain' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, {
      status: false,
      message: 'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed',
    });
  });
});
