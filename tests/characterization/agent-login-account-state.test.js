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
const passwordHash = bcrypt.hashSync(password, 10);
let n = 0;
const seed = (fields = {}) => User.create({
  name: 'Agent State',
  phone: `98132${String(++n).padStart(5, '0')}`,
  password: passwordHash,
  role: 'agent',
  roles: ['agent'],
  status: 'active',
  ...fields,
});
const login = (phone) => request(app).post('/api/auth/agent/login').send({ phone, password });

test('Agent login account-state characterization', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('active future lock returns exact 429 with ceiling minutes', async () => {
    const u = await seed();
    await User.updateOne(
      { _id: u._id },
      { $set: { lockedUntil: new Date(Date.now() + 119 * 1000) } },
    );
    const res = await login(u.phone);
    assert.equal(res.status, 429);
    assert.equal(res.body.errorCode, 'ACCOUNT_LOCKED');
    assert.match(res.body.message, /Try again in 2 minute\(s\)\./);
  });

  await t.test('expired lock does not block login', async () => {
    const u = await seed({ lockedUntil: new Date(Date.now() - 1000) });
    const res = await login(u.phone);
    assert.notEqual(res.status, 429);
  });

  await t.test('banned and inactive messages preserve reason variants', async () => {
    const banned = await seed({ status: 'banned' });
    const bannedReason = await seed({ status: 'banned', suspensionReason: 'fraud' });
    const inactive = await seed({ status: 'inactive' });
    const inactiveReason = await seed({ status: 'inactive', suspensionReason: 'docs' });
    assert.deepEqual((await login(banned.phone)).body, {
      success: false,
      message: 'Your account has been suspended. Please contact support.',
      errorCode: 'ACCOUNT_BANNED',
    });
    assert.equal((await login(bannedReason.phone)).body.message, 'Your account has been suspended. Reason: fraud');
    assert.deepEqual((await login(inactive.phone)).body, {
      success: false,
      message: 'Your account has been deactivated. Please contact support.',
      errorCode: 'ACCOUNT_INACTIVE',
    });
    assert.equal((await login(inactiveReason.phone)).body.message, 'Your account has been deactivated. Reason: docs');
  });

  await t.test('agent role fallback works and roles array wins over legacy role', async () => {
    const fallbackPhone = `98132${String(++n).padStart(5, '0')}`;
    await User.collection.insertOne({
      name: 'Legacy Agent',
      phone: fallbackPhone,
      password: bcrypt.hashSync(password, 10),
      role: 'agent',
      roles: [],
      status: 'active',
      deletedAt: null,
    });
    const rolesWinPhone = `98132${String(++n).padStart(5, '0')}`;
    await User.collection.insertOne({
      name: 'Roles Win',
      phone: rolesWinPhone,
      password: bcrypt.hashSync(password, 10),
      role: 'agent',
      roles: ['passenger'],
      status: 'active',
      deletedAt: null,
    });
    const nonAgent = await seed({ roles: ['passenger'], role: 'passenger' });
    assert.equal((await login(fallbackPhone)).status, 200);
    const blocked = await login(rolesWinPhone);
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.errorCode, 'ROLE_NOT_FOUND');
    assert.equal((await login(nonAgent.phone)).body.errorCode, 'ROLE_NOT_FOUND');
  });

  await t.test('soft-deleted matching account remains hidden by lookup', async () => {
    const u = await seed({ deletedAt: new Date() });
    const res = await login(u.phone);
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { success: false, message: 'Invalid phone number or password.' });
  });
});
