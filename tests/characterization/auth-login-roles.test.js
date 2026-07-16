'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const db = require('../helpers/db');
const app = require('../helpers/app');
const User = require('../../models/userModel');

test('Auth: Login Roles / X-App-Source Characterization', async (t) => {
  const password = 'TestPassword123!';
  const hashedPassword = await bcrypt.hash(password, 10);

  t.before(async () => await db.connect());
  t.after(async () => await db.disconnect());

  t.beforeEach(async () => {
    await db.clearAll();
    await User.create({
      phone: '9800000000',
      password: hashedPassword,
      status: 'active',
      role: 'passenger',
      roles: ['passenger'],
    });
  });

  // ── No X-App-Source header ─────────────────────────────────────────────────

  await t.test('No X-App-Source — falls back to primary role', async () => {
    const res = await request(app).post('/api/login').send({
      emailOrPhone: '9800000000', password,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.activeRole, 'passenger');
  });

  // ── Valid X-App-Source matches a user role ─────────────────────────────────

  await t.test('X-App-Source: passenger — selects passenger activeRole', async () => {
    const res = await request(app).post('/api/login')
      .set('X-App-Source', 'passenger')
      .send({ emailOrPhone: '9800000000', password });
    assert.equal(res.status, 200);
    assert.equal(res.body.activeRole, 'passenger');
  });

  // ── X-App-Source role not held by user ────────────────────────────────────

  await t.test('X-App-Source: agent — user lacks role → ROLE_NOT_REGISTERED', async () => {
    const res = await request(app).post('/api/login')
      .set('X-App-Source', 'agent')
      .send({ emailOrPhone: '9800000000', password });
    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.equal(res.body.errorCode, 'ROLE_NOT_REGISTERED');
    assert.equal(res.body.message, "You don't have a agent account. Please register first.");
  });

  // ── Legacy busOwner case-sensitivity bug (preserved) ─────────────────────
  // Original code lowercases X-App-Source before testing against VALID_APP_SOURCES
  // which contains 'busOwner'. 'busowner' !== 'busOwner', so it never matches →
  // falls back to primary role instead of ROLE_NOT_REGISTERED.

  await t.test('X-App-Source: busOwner — case-sensitivity means fallback to primary role', async () => {
    const res = await request(app).post('/api/login')
      .set('X-App-Source', 'busOwner')
      .send({ emailOrPhone: '9800000000', password });
    // appSource is lowercased to 'busowner', not in VALID_APP_SOURCES → requestedRole=null
    // → falls back to user.role || 'passenger'
    assert.equal(res.status, 200);
    assert.equal(res.body.activeRole, 'passenger');
  });

  // ── Multi-role user selects the requested role ────────────────────────────

  await t.test('X-App-Source: agent — multi-role user selects agent', async () => {
    await db.clearAll();
    await User.create({
      phone: '9800000001',
      password: hashedPassword,
      status: 'active',
      role: 'passenger',
      roles: ['passenger', 'agent'],
    });
    const res = await request(app).post('/api/login')
      .set('X-App-Source', 'agent')
      .send({ emailOrPhone: '9800000001', password });
    assert.equal(res.status, 200);
    assert.equal(res.body.activeRole, 'agent');
  });
});
