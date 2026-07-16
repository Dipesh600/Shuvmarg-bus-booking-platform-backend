'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const db = require('../helpers/db');
const app = require('../helpers/app');
const User = require('../../models/userModel');

test('Auth: Login Security Characterization', async (t) => {
  const password = 'TestPassword123!';
  const hashedPassword = await bcrypt.hash(password, 10);
  let user;

  t.before(async () => await db.connect());
  t.after(async () => await db.disconnect());

  t.beforeEach(async () => {
    await db.clearAll();
    user = await User.create({
      phone: '9800000000',
      password: hashedPassword,
      status: 'active',
      roles: ['passenger'],
    });
  });

  // ── Account status gates ───────────────────────────────────────────────────

  await t.test('POST /api/login - deleted account (deletedAt set)', async () => {
    await User.findByIdAndUpdate(user._id, { deletedAt: new Date() });
    const res = await request(app).post('/api/login').send({
      emailOrPhone: '9800000000', password,
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.equal(res.body.errorCode, 'ACCOUNT_DELETED');
    assert.equal(
      res.body.message,
      'This account has been deactivated. Please contact support for assistance.'
    );
  });

  await t.test('POST /api/login - suspended/inactive account', async () => {
    await User.findByIdAndUpdate(user._id, { status: 'inactive' });
    const res = await request(app).post('/api/login').send({
      emailOrPhone: '9800000000', password,
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.equal(res.body.errorCode, 'ACCOUNT_SUSPENDED');
    assert.equal(res.body.message, 'Your account has been suspended.');
  });

  // ── Failed-attempt accounting ──────────────────────────────────────────────

  await t.test('POST /api/login - failed attempt increments counter', async () => {
    await request(app).post('/api/login').send({
      emailOrPhone: '9800000000', password: 'bad',
    });
    const fresh = await User.findById(user._id);
    assert.equal(fresh.failedLoginAttempts, 1);
  });

  await t.test('POST /api/login - lock triggers at exactly 5 attempts', async () => {
    // pre-set to 4 — one more bad attempt should lock
    await User.findByIdAndUpdate(user._id, { failedLoginAttempts: 4 });
    const res = await request(app).post('/api/login').send({
      emailOrPhone: '9800000000', password: 'bad',
    });
    assert.equal(res.status, 401);
    assert.equal(res.body.message, 'Too many failed attempts. Account locked for 15 minutes.');
    const fresh = await User.findById(user._id);
    assert.ok(fresh.lockedUntil, 'lockedUntil must be set');
    assert.ok(fresh.lockedUntil > new Date(), 'lockedUntil must be in the future');
  });

  await t.test('POST /api/login - already-locked account returns 429', async () => {
    const future = new Date(Date.now() + 10 * 60 * 1000); // 10 min from now
    await User.findByIdAndUpdate(user._id, { lockedUntil: future });
    const res = await request(app).post('/api/login').send({
      emailOrPhone: '9800000000', password,
    });
    assert.equal(res.status, 429);
    assert.equal(res.body.success, false);
    assert.equal(res.body.errorCode, 'ACCOUNT_LOCKED');
    assert.ok(res.body.message.includes('locked'));
  });

  // ── Successful login resets state ──────────────────────────────────────────

  await t.test('POST /api/login - success resets failedLoginAttempts to 0', async () => {
    await User.findByIdAndUpdate(user._id, { failedLoginAttempts: 3 });
    await request(app).post('/api/login').send({ emailOrPhone: '9800000000', password });
    const fresh = await User.findById(user._id);
    assert.equal(fresh.failedLoginAttempts, 0);
  });

  await t.test('POST /api/login - success updates lastLoginAt', async () => {
    const before = Date.now();
    await request(app).post('/api/login').send({ emailOrPhone: '9800000000', password });
    const fresh = await User.findById(user._id);
    assert.ok(fresh.lastLoginAt, 'lastLoginAt must be set');
    assert.ok(fresh.lastLoginAt.getTime() >= before, 'lastLoginAt must be >= test start');
  });
});
