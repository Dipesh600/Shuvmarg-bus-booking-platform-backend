'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../helpers/app');
const db = require('../helpers/db');
const User = require('../../models/userModel');
const repository = require('../../src/modules/auth/update-password/update-password.repository');

const pass = 'OldPass1';
const token = (u) => jwt.sign({
  id: u._id,
  role: 'passenger',
  activeRole: 'passenger',
  roles: ['passenger'],
  purpose: 'access',
  tokenVersion: u.tokenVersion ?? 0,
}, process.env.SECRET_KEY);

const makeUser = async (extra = {}) => User.create({
  name: 'Update User',
  phone: `9844${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`,
  password: await bcrypt.hash(pass, 10),
  role: 'passenger',
  roles: ['passenger'],
  status: 'active',
  phoneVerified: true,
  isVerified: true,
  ...extra,
});

const put = (accessToken, body) =>
  request(app).put('/api/updatePassword').set('Authorization', `Bearer ${accessToken}`).send(body);

test('Auth: updatePassword error contracts', async (t) => {
  await db.connect();
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('missing oldPassword and missing newPassword', async () => {
    const u = await makeUser();
    let res = await put(token(u), { newPassword: 'NewPass1' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { status: false, message: 'Both old password and new password are required' });
    res = await put(token(u), { oldPassword: pass });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { status: false, message: 'Both old password and new password are required' });
  });

  await t.test('weak new password exact body', async () => {
    const u = await makeUser();
    const res = await put(token(u), { oldPassword: pass, newPassword: 'weak' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, {
      status: false,
      message: 'Password must be at least 8 characters long.',
      errors: [
        'Password must be at least 8 characters long.',
        'Password must contain at least one uppercase letter.',
        'Password must contain at least one number.',
      ],
    });
  });

  await t.test('user not found from repository preserves 404 body', async () => {
    const u = await makeUser();
    const orig = repository.findByIdWithPassword;
    try {
      repository.findByIdWithPassword = async () => null;
      const res = await put(token(u), { oldPassword: pass, newPassword: 'NewPass1' });
      assert.equal(res.status, 404);
      assert.deepEqual(res.body, { status: false, message: 'User not found' });
    } finally { repository.findByIdWithPassword = orig; }
  });

  await t.test('wrong old password with attempts remaining', async () => {
    const u = await makeUser();
    const res = await put(token(u), { oldPassword: 'WrongPass1', newPassword: 'NewPass1' });
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, {
      success: false,
      message: 'Current password is incorrect. 4 attempt(s) remaining.',
    });
  });

  await t.test('same-password rejection after valid old password', async () => {
    const u = await makeUser({ failedLoginAttempts: 2 });
    const res = await put(token(u), { oldPassword: pass, newPassword: pass });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, {
      status: false,
      message: 'New password must be different from current password',
    });
    const stored = await User.findById(u._id);
    assert.equal(stored.failedLoginAttempts, 0);
  });

  await t.test('unexpected failure exact 500', async () => {
    const u = await makeUser();
    const orig = bcrypt.hash;
    try {
      bcrypt.hash = async () => { throw new Error('hash down'); };
      const res = await put(token(u), { oldPassword: pass, newPassword: 'NewPass1' });
      assert.equal(res.status, 500);
      assert.deepEqual(res.body, { status: false, message: 'Internal server error' });
    } finally { bcrypt.hash = orig; }
  });
});
