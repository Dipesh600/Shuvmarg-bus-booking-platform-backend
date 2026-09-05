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
const credentialHash = bcrypt.hashSync(credential, 10);
let n = 0;
const seed = (fields = {}) => User.create({
  name: 'Operator State',
  phone: `98142${String(++n).padStart(5, '0')}`,
  password: credentialHash,
  role: 'busOwner',
  roles: ['busOwner'],
  status: 'active',
  ...fields,
});
const login = (phone) => request(app)
  .post('/api/auth/busowner/login')
  .send({ phone, password: credential });

test('Bus-owner login account-state characterization', async (t) => {
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

  await t.test('banned account without reason returns correct body', async () => {
    const u = await seed({ status: 'banned' });
    const res = await login(u.phone);
    assert.deepEqual(res.body, {
      success: false,
      message: 'Your account has been suspended. Please contact support.',
      errorCode: 'ACCOUNT_BANNED',
    });
  });

  await t.test('banned account with reason includes reason in message', async () => {
    const u = await seed({ status: 'banned', suspensionReason: 'fraud' });
    const res = await login(u.phone);
    assert.equal(res.body.message, 'Your account has been suspended. Reason: fraud');
    assert.equal(res.body.errorCode, 'ACCOUNT_BANNED');
  });

  await t.test('inactive account without reason returns correct body', async () => {
    const u = await seed({ status: 'inactive' });
    const res = await login(u.phone);
    assert.deepEqual(res.body, {
      success: false,
      message: 'Your account has been deactivated. Please contact support.',
      errorCode: 'ACCOUNT_INACTIVE',
    });
  });

  await t.test('inactive account with reason includes reason in message', async () => {
    const u = await seed({ status: 'inactive', suspensionReason: 'docs' });
    const res = await login(u.phone);
    assert.equal(res.body.message, 'Your account has been deactivated. Reason: docs');
  });

  await t.test('non-busOwner role returns exact ROLE_NOT_FOUND', async () => {
    const u = await seed({ roles: ['passenger'], role: 'passenger' });
    const res = await login(u.phone);
    assert.equal(res.status, 403);
    assert.deepEqual(res.body, {
      success: false,
      message: "You don't have an operator account. Please register as a bus operator first.",
      errorCode: 'ROLE_NOT_FOUND',
    });
  });

  await t.test('legacy role field fallback works when roles is absent', async () => {
    const phone = `98142${String(++n).padStart(5, '0')}`;
    await User.collection.insertOne({
      name: 'Legacy Operator', phone,
      password: bcrypt.hashSync(credential, 10),
      role: 'busOwner', status: 'active', deletedAt: null,
    });
    assert.equal((await login(phone)).status, 200);
  });

  await t.test('non-empty roles array wins over legacy role field', async () => {
    const phone = `98142${String(++n).padStart(5, '0')}`;
    await User.collection.insertOne({
      name: 'Roles Win', phone,
      password: bcrypt.hashSync(credential, 10),
      role: 'busOwner', roles: ['passenger'], status: 'active', deletedAt: null,
    });
    const res = await login(phone);
    assert.equal(res.status, 403);
    assert.equal(res.body.errorCode, 'ROLE_NOT_FOUND');
  });

  await t.test('soft-deleted matching user returns 401 invalid credentials', async () => {
    const u = await seed({ deletedAt: new Date() });
    const res = await login(u.phone);
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { success: false, message: 'Invalid phone number or password.' });
  });
});
