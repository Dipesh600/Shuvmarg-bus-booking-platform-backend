'use strict';

/**
 * tests/unit/booking/passenger-booking-guard.test.js
 *
 * Authorization guard unit tests for passenger booking endpoints.
 */

process.env.SECRET_KEY ||= 'test-only-secret-32chars-minimum!!';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const role = require('../../../middleware/checkRole');

const mockReq = (activeRole, userInfo = {}) => ({
  userInfo: activeRole ? { activeRole, id: 'u1', ...userInfo } : null,
  dbUser: { _id: 'u1', status: 'active', roles: ['passenger'] },
  body: {},
  get: () => null,
});
const mockRes = () => {
  const res = { statusCode: null, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};

test('Passenger Booking Guard — checkRole middleware', async (t) => {
  const guard = role.requireRole('passenger');

  await t.test('missing userInfo returns 401', () => {
    const req = mockReq(null);
    const res = mockRes();
    let called = false;
    guard(req, res, () => { called = true; });
    assert.equal(called, false);
    assert.equal(res.statusCode, 401);
  });

  await t.test('agent activeRole returns 403 INSUFFICIENT_ROLE', () => {
    const req = mockReq('agent');
    const res = mockRes();
    let called = false;
    guard(req, res, () => { called = true; });
    assert.equal(called, false);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.errorCode, 'INSUFFICIENT_ROLE');
  });

  await t.test('busOwner activeRole returns 403 INSUFFICIENT_ROLE', () => {
    const req = mockReq('busOwner');
    const res = mockRes();
    let called = false;
    guard(req, res, () => { called = true; });
    assert.equal(called, false);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.errorCode, 'INSUFFICIENT_ROLE');
  });

  await t.test('multi-role user with activeRole agent returns 403', () => {
    const req = mockReq('agent', { roles: ['passenger', 'agent'] });
    const res = mockRes();
    let called = false;
    guard(req, res, () => { called = true; });
    assert.equal(called, false);
    assert.equal(res.statusCode, 403);
  });

  await t.test('passenger activeRole proceeds to next()', () => {
    const req = mockReq('passenger');
    const res = mockRes();
    let called = false;
    guard(req, res, () => { called = true; });
    assert.equal(called, true);
  });
});
