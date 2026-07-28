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
let n = 0;
const seed = (fields = {}) => User.create({
  name: 'Agent Attempts',
  phone: `98133${String(++n).padStart(5, '0')}`,
  password: bcrypt.hashSync(password, 10),
  role: 'agent',
  roles: ['agent'],
  status: 'active',
  ...fields,
});
const wrong = (u) => request(app).post('/api/auth/agent/login').send({ phone: u.phone, password: 'bad' });
const right = (u) => request(app).post('/api/auth/agent/login').send({ phone: u.phone, password });

test('Agent login failed-attempt characterization', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('wrong password increments attempts and reports first remaining count', async () => {
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

  await t.test('fifth wrong attempt locks account with second update effect', async () => {
    const u = await seed({ failedLoginAttempts: 4 });
    const before = Date.now();
    const res = await wrong(u);
    assert.equal(res.status, 401);
    assert.equal(res.body.message, 'Too many failed attempts. Account locked for 15 minutes.');
    const fresh = await User.findById(u._id);
    assert.equal(fresh.failedLoginAttempts, 5);
    assert.ok(fresh.lockedUntil.getTime() >= before + 14 * 60 * 1000);
  });

  await t.test('correct password after prior failures resets counters and lock', async () => {
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
