'use strict';
/**
 * tests/characterization/passenger-booking-route-guards.test.js
 *
 * Real Express route characterization tests (Supertest).
 * Covers: no-token, invalid-token, agent, busOwner, multi-role,
 * security properties, valid-passenger pass-through on prepareBooking /
 * confirmBooking / verifyBooking.
 */
const {
  createTestSecret,
} = require('../helpers/security-test-values');

process.env.SECRET_KEY ||= createTestSecret('application-hmac');

const test    = require('node:test');
const assert  = require('node:assert/strict');
const request = require('supertest');
const jwt     = require('jsonwebtoken');
const app     = require('../helpers/app');
const db      = require('../helpers/db');
const User    = require('../../models/userModel');

let _seq = 9800100100;
const nextPhone = () => String(_seq++);
const mkUser  = (o = {}) => User.create({ phone: nextPhone(), password: 'Password1!', role: 'passenger', roles: ['passenger'], status: 'active', tokenVersion: 0, ...o });
const sign    = (u, o = {}) => jwt.sign({ id: u._id.toString(), role: u.role || 'passenger', activeRole: 'passenger', tokenVersion: u.tokenVersion ?? 0, purpose: 'access', ...o }, process.env.SECRET_KEY, { expiresIn: '1h' });
const bearer  = (tok) => `Bearer ${tok}`;

const PREPARE   = '/api/ticket/prepareBooking';
const CONFIRM   = '/api/ticket/confirmBooking';
const VERIFY    = '/api/ticket/verifyBooking/TKT-X';

test('Passenger Booking Real Express Route Guards', async (t) => {
  t.before(() => db.connect());
  t.after(() => db.disconnect());
  t.beforeEach(() => db.clearAll());

  await t.test('1. no token → 401 on all three protected endpoints', async () => {
    const [r1, r2, r3] = await Promise.all([
      request(app).post(PREPARE).send({}),
      request(app).post(CONFIRM).send({}),
      request(app).get(VERIFY),
    ]);
    for (const r of [r1, r2, r3]) assert.equal(r.status, 401);
  });

  await t.test('2. invalid token → 401 on all three protected endpoints', async () => {
    const h = bearer('totally-invalid-token');
    const [r1, r2, r3] = await Promise.all([
      request(app).post(PREPARE).set('Authorization', h).send({}),
      request(app).post(CONFIRM).set('Authorization', h).send({}),
      request(app).get(VERIFY).set('Authorization', h),
    ]);
    for (const r of [r1, r2, r3]) assert.equal(r.status, 401);
  });

  await t.test('3a. agent activeRole → 403 INSUFFICIENT_ROLE on prepareBooking', async () => {
    const u = await mkUser({ role: 'agent', roles: ['agent'] });
    const r = await request(app).post(PREPARE).set('Authorization', bearer(sign(u, { activeRole: 'agent', role: 'agent' }))).send({});
    assert.equal(r.status, 403); assert.equal(r.body.errorCode, 'INSUFFICIENT_ROLE');
  });

  await t.test('3b. busOwner activeRole → 403 INSUFFICIENT_ROLE on prepareBooking', async () => {
    const u = await mkUser({ role: 'busOwner', roles: ['busOwner'] });
    const r = await request(app).post(PREPARE).set('Authorization', bearer(sign(u, { activeRole: 'busOwner', role: 'busOwner' }))).send({});
    assert.equal(r.status, 403); assert.equal(r.body.errorCode, 'INSUFFICIENT_ROLE');
  });

  await t.test('3c. multi-role account with activeRole:agent → 403 INSUFFICIENT_ROLE', async () => {
    const u = await mkUser({ roles: ['passenger', 'agent'], role: 'passenger' });
    const r = await request(app).post(PREPARE).set('Authorization', bearer(sign(u, { activeRole: 'agent', role: 'agent' }))).send({});
    assert.equal(r.status, 403); assert.equal(r.body.errorCode, 'INSUFFICIENT_ROLE');
  });

  await t.test('4. security properties: banned/deleted/inactive/revoked/stale/forcePasswordChange', async () => {
    const [banned, deleted, inactive, revoked, stale, forcePw] = await Promise.all([
      mkUser({ status: 'banned' }), mkUser({ deletedAt: new Date() }), mkUser({ status: 'inactive' }),
      mkUser({ role: 'agent', roles: ['agent'] }), mkUser({ tokenVersion: 5 }), mkUser({ forcePasswordChange: true }),
    ]);
    const [rB, rD, rI, rRev, rS, rFP] = await Promise.all([
      request(app).post(PREPARE).set('Authorization', bearer(sign(banned))).send({}),
      request(app).post(PREPARE).set('Authorization', bearer(sign(deleted))).send({}),
      request(app).post(PREPARE).set('Authorization', bearer(sign(inactive))).send({}),
      request(app).post(PREPARE).set('Authorization', bearer(sign(revoked, { activeRole: 'passenger' }))).send({}),
      request(app).post(PREPARE).set('Authorization', bearer(sign(stale, { tokenVersion: 0 }))).send({}),
      request(app).post(PREPARE).set('Authorization', bearer(sign(forcePw))).send({}),
    ]);
    assert.equal(rB.status, 403);  assert.equal(rB.body.errorCode,  'ACCOUNT_BANNED');
    assert.equal(rD.status, 403);  assert.equal(rD.body.errorCode,  'ACCOUNT_DEACTIVATED');
    assert.equal(rI.status, 403);  assert.equal(rI.body.errorCode,  'ACCOUNT_INACTIVE');
    assert.equal(rRev.status, 403);assert.equal(rRev.body.errorCode,'ROLE_REVOKED');
    assert.equal(rS.status, 401);  assert.equal(rS.body.errorCode,  'SESSION_INVALIDATED');
    assert.equal(rFP.status, 403); assert.equal(rFP.body.errorCode, 'FORCE_PASSWORD_CHANGE');
  });

  await t.test('5. valid passenger passes guard on prepareBooking (domain rejects)', async () => {
    const u = await mkUser();
    const r = await request(app).post(PREPARE).set('Authorization', bearer(sign(u))).send({ scheduleId: '507f1f77bcf86cd799439011' });
    assert.notEqual(r.status, 401); assert.notEqual(r.status, 403);
    assert.ok(r.status >= 400, `expected domain-level error, got ${r.status}`);
  });

  await t.test('6. valid passenger passes guard on confirmBooking (domain rejects)', async () => {
    const u = await mkUser();
    const r = await request(app).post(CONFIRM).set('Authorization', bearer(sign(u))).send({ tempBookingId: 'BH1', gateway: 'esewa', paymentAmount: 100, originalAmount: 100 });
    assert.notEqual(r.status, 401); assert.notEqual(r.status, 403);
    assert.ok(r.status >= 400);
  });

  await t.test('7. valid passenger passes guard on verifyBooking (domain 404)', async () => {
    const u = await mkUser();
    const r = await request(app).get(VERIFY).set('Authorization', bearer(sign(u)));
    assert.notEqual(r.status, 401); assert.notEqual(r.status, 403); assert.equal(r.status, 404);
  });

  await t.test('8. retired /bookTicket → 404 not-found (no longer registered)', async () => {
    const u = await mkUser();
    const r = await request(app).post('/api/ticket/bookTicket').set('Authorization', bearer(sign(u))).send({});
    assert.equal(r.status, 404);
  });
});
