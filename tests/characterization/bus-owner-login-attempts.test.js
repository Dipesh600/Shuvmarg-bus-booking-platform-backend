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
let n = 0;
const seed = (fields = {}) => User.create({
  name: 'Operator Attempts',
  phone: `98143${String(++n).padStart(5, '0')}`,
  password: bcrypt.hashSync(credential, 10),
  role: 'busOwner',
  roles: ['busOwner'],
  status: 'active',
  ...fields,
});
const wrong = (u) => request(app)
  .post('/api/auth/busowner/login')
  .send({ phone: u.phone, password: 'bad' });
const right = (u) => request(app)
  .post('/api/auth/busowner/login')
  .send({ phone: u.phone, password: credential });

test('Bus-owner login failed-attempt characterization', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('first wrong attempt reports four remaining', async () => {
    const u = await seed();
    const res = await wrong(u);
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, {
      success: false,
      message: 'Invalid phone number or password. 4 attempt(s) remaining.',
    });
    assert.equal((await User.findById(u._id)).failedLoginAttempts, 1);
    assert.equal(res.body.accessToken, undefined);
    assert.equal((res.headers['set-cookie'] || []).some((c) => c.startsWith('refreshToken=')), false);
  });

  await t.test('fourth wrong attempt reports one remaining', async () => {
    const u = await seed({ failedLoginAttempts: 3 });
    const res = await wrong(u);
    assert.equal(res.status, 401);
    assert.equal(res.body.message, 'Invalid phone number or password. 1 attempt(s) remaining.');
    assert.equal((await User.findById(u._id)).failedLoginAttempts, 4);
  });

  await t.test('fifth wrong attempt locks and returns locked message', async () => {
    const u = await seed({ failedLoginAttempts: 4 });
    const before = Date.now();
    const res = await wrong(u);
    assert.equal(res.status, 401);
    assert.equal(res.body.message, 'Too many failed attempts. Account locked for 15 minutes.');
    const fresh = await User.findById(u._id);
    assert.equal(fresh.failedLoginAttempts, 5);
    assert.ok(fresh.lockedUntil.getTime() >= before + 14 * 60 * 1000);
  });

  await t.test('correct password after prior failures resets counters', async () => {
    const u = await seed({
      failedLoginAttempts: 3,
      lockedUntil: new Date(Date.now() - 1000),
    });
    const res = await right(u);
    assert.equal(res.status, 200);
    const fresh = await User.findById(u._id);
    assert.equal(fresh.failedLoginAttempts, 0);
    assert.equal(fresh.lockedUntil, null);
    assert.ok(fresh.lastLoginAt);
  });
});
