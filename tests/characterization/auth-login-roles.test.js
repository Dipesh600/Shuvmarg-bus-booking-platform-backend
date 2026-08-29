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

  // ── busOwner is matched case-insensitively ────────────────────────────────
  // The header is lowercased before matching (login.controller.js). It used to be
  // tested against a list holding the camel-cased 'busOwner', so 'busowner' never
  // matched, requestedRole came back null, and the gate fell open: a caller with
  // no busOwner role was handed a passenger session with 200. The lookup is now
  // keyed on the lowercased form, so the gate closes.

  await t.test('X-App-Source: busOwner — user lacks role → ROLE_NOT_REGISTERED', async () => {
    const res = await request(app).post('/api/login')
      .set('X-App-Source', 'busOwner')
      .send({ emailOrPhone: '9800000000', password });
    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.equal(res.body.errorCode, 'ROLE_NOT_REGISTERED');
    assert.equal(res.body.message, "You don't have a busOwner account. Please register first.");
  });

  await t.test('X-App-Source: BUSOWNER — any casing resolves the same role', async () => {
    await db.clearAll();
    await User.create({
      phone: '9800000002',
      password: hashedPassword,
      status: 'active',
      role: 'passenger',
      roles: ['passenger', 'busOwner'],
    });
    const res = await request(app).post('/api/login')
      .set('X-App-Source', 'BUSOWNER')
      .send({ emailOrPhone: '9800000002', password });
    assert.equal(res.status, 200);
    assert.equal(res.body.activeRole, 'busOwner');
  });

  // ── Unknown X-App-Source values ───────────────────────────────────────────
  // 'constructor' and friends are only interesting because the header is
  // attacker-controlled: an object-keyed lookup would resolve them off the
  // prototype chain. They must be treated as unknown, exactly like junk.

  await t.test('X-App-Source: unknown values fall back to the primary role', async () => {
    for (const appSource of ['constructor', 'toString', '__proto__', 'nonsense']) {
      const res = await request(app).post('/api/login')
        .set('X-App-Source', appSource)
        .send({ emailOrPhone: '9800000000', password });
      assert.equal(res.status, 200, appSource);
      assert.equal(res.body.activeRole, 'passenger', appSource);
    }
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
