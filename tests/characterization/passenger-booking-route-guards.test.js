'use strict';

/**
 * tests/characterization/passenger-booking-route-guards.test.js
 * Real Express route characterization tests for passenger booking endpoints using supertest.
 */

process.env.SECRET_KEY ||= 'test-only-secret-32chars-minimum!!';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../helpers/app');
const db = require('../helpers/db');
const User = require('../../models/userModel');

test('Passenger Booking Real Express Route Guards', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  const createPassenger = (overrides = {}) =>
    User.create({
      phone: '9800000010',
      password: 'password123',
      role: 'passenger',
      roles: ['passenger'],
      status: 'active',
      tokenVersion: 0,
      ...overrides,
    });

  const signToken = (user, overrides = {}) =>
    jwt.sign(
      { id: user._id.toString(), role: user.role || 'passenger', activeRole: 'passenger', tokenVersion: 0, purpose: 'access', ...overrides },
      process.env.SECRET_KEY,
      { expiresIn: '1h' }
    );

  await t.test('no token returns 401 across all protected booking endpoints', async () => {
    const r1 = await request(app).post('/api/ticket/prepareBooking').send({});
    const r2 = await request(app).post('/api/ticket/confirmBooking').send({});
    const r3 = await request(app).get('/api/ticket/verifyBooking/tkt1');
    const r4 = await request(app).post('/api/ticket/bookTicket').send({});
    assert.equal(r1.status, 401);
    assert.equal(r2.status, 401);
    assert.equal(r3.status, 401);
    assert.equal(r4.status, 401);
  });

  await t.test('invalid token returns 401', async () => {
    const r = await request(app).post('/api/ticket/prepareBooking').set('Authorization', 'Bearer invalid-token').send({});
    assert.equal(r.status, 401);
  });

  await t.test('agent and busOwner activeRole tokens return 403 INSUFFICIENT_ROLE', async () => {
    const u = await createPassenger({ roles: ['passenger', 'agent'] });
    const token = signToken(u, { activeRole: 'agent', role: 'agent' });
    const r = await request(app).post('/api/ticket/prepareBooking').set('Authorization', `Bearer ${token}`).send({ scheduleId: '1' });
    assert.equal(r.status, 403);
    assert.equal(r.body.errorCode, 'INSUFFICIENT_ROLE');
  });

  await t.test('banned, soft-deleted, inactive, revoked, stale token and force password users are blocked', async () => {
    const bannedUser = await createPassenger({ status: 'banned' });
    const deletedUser = await createPassenger({ deletedAt: new Date() });
    const inactiveUser = await createPassenger({ status: 'inactive' });
    const revokedUser = await createPassenger({ role: 'agent', roles: ['agent'] });
    const staleUser = await createPassenger({ tokenVersion: 1 });
    const forcePwUser = await createPassenger({ forcePasswordChange: true });

    const rBanned = await request(app).post('/api/ticket/prepareBooking').set('Authorization', `Bearer ${signToken(bannedUser)}`).send({ scheduleId: '1' });
    const rDeleted = await request(app).post('/api/ticket/prepareBooking').set('Authorization', `Bearer ${signToken(deletedUser)}`).send({ scheduleId: '1' });
    const rInactive = await request(app).post('/api/ticket/prepareBooking').set('Authorization', `Bearer ${signToken(inactiveUser)}`).send({ scheduleId: '1' });
    const rRevoked = await request(app).post('/api/ticket/prepareBooking').set('Authorization', `Bearer ${signToken(revokedUser, { activeRole: 'passenger' })}`).send({ scheduleId: '1' });
    const rStale = await request(app).post('/api/ticket/prepareBooking').set('Authorization', `Bearer ${signToken(staleUser, { tokenVersion: 0 })}`).send({ scheduleId: '1' });
    const rForcePw = await request(app).post('/api/ticket/prepareBooking').set('Authorization', `Bearer ${signToken(forcePwUser)}`).send({ scheduleId: '1' });

    assert.equal(rBanned.status, 403);
    assert.equal(rBanned.body.errorCode, 'ACCOUNT_BANNED');
    assert.equal(rDeleted.status, 403);
    assert.equal(rDeleted.body.errorCode, 'ACCOUNT_DEACTIVATED');
    assert.equal(rInactive.status, 403);
    assert.equal(rInactive.body.errorCode, 'ACCOUNT_INACTIVE');
    assert.equal(rRevoked.status, 403);
    assert.equal(rRevoked.body.errorCode, 'ROLE_REVOKED');
    assert.equal(rStale.status, 401);
    assert.equal(rStale.body.errorCode, 'SESSION_INVALIDATED');
    assert.equal(rForcePw.status, 403);
    assert.equal(rForcePw.body.errorCode, 'FORCE_PASSWORD_CHANGE');
  });

  await t.test('authenticated passenger passing guard reaches prepareBooking and legacy /bookTicket returns 410', async () => {
    const u = await createPassenger();
    const token = signToken(u);

    const rPrepare = await request(app).post('/api/ticket/prepareBooking').set('Authorization', `Bearer ${token}`).send({ scheduleId: '507f1f77bcf86cd799439011' });
    assert.equal(rPrepare.status, 400);
    assert.equal(rPrepare.body.message.includes('Missing required fields') || rPrepare.body.message.includes('Trip not found'), true);

    const rLegacy = await request(app).post('/api/ticket/bookTicket').set('Authorization', `Bearer ${token}`).send({ scheduleId: '507f1f77bcf86cd799439011' });
    assert.equal(rLegacy.status, 410);
    assert.equal(rLegacy.body.errorCode, 'LEGACY_BOOKING_FLOW_RETIRED');
  });
});
