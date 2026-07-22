'use strict';

/**
 * tests/unit/booking/passenger-booking-route-guards.test.js
 * Route guard characterization tests: auth -> verifyRoleFromDB -> requireRole("passenger")
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const auth = require('../../../middleware/authMiddleware');
const verifyRoleFromDB = require('../../../middleware/verifyRoleFromDB');
const role = require('../../../middleware/checkRole');
const User = require('../../../models/userModel');

const SECRET_KEY = 'test-secret-key-for-route-guards';
process.env.SECRET_KEY = SECRET_KEY;

const patch = (obj, key, fn, restore) => {
  const old = obj[key];
  obj[key] = fn;
  restore.push(() => { obj[key] = old; });
};

const executeGuardChain = async (req, res) => {
  let finished = false;
  return new Promise((resolve) => {
    const finish = (result) => {
      if (!finished) { finished = true; resolve(result); }
    };
    auth(req, res, () => {
      verifyRoleFromDB(req, res, () => {
        role.requireRole('passenger')(req, res, () => finish({ passed: true }));
      }).then(() => finish({ passed: false })).catch((err) => finish({ error: err }));
    });
  });
};

test('Passenger Booking Route Guards — auth -> verifyRoleFromDB -> requireRole', async (t) => {
  const validUser = { _id: '507f1f77bcf86cd799439011', roles: ['passenger'], tokenVersion: 0, status: 'active' };
  const createValidToken = (overrides = {}) =>
    jwt.sign({ id: validUser._id, role: 'passenger', activeRole: 'passenger', tokenVersion: 0, purpose: 'access', ...overrides }, SECRET_KEY);

  await t.test('banned user returns 403 ACCOUNT_BANNED', async () => {
    const restore = [];
    patch(User, 'findById', () => ({ lean: async () => ({ ...validUser, status: 'banned' }) }), restore);
    try {
      let status, json;
      const req = { headers: { authorization: `Bearer ${createValidToken()}` } };
      const res = { status: (c) => { status = c; return { json: (d) => { json = d; } }; } };
      await executeGuardChain(req, res);
      assert.equal(status, 403);
      assert.equal(json.errorCode, 'ACCOUNT_BANNED');
    } finally { restore.reverse().forEach((f) => f()); }
  });

  await t.test('soft-deleted user returns 403 ACCOUNT_DEACTIVATED', async () => {
    const restore = [];
    patch(User, 'findById', () => ({ lean: async () => ({ ...validUser, deletedAt: new Date() }) }), restore);
    try {
      let status, json;
      const req = { headers: { authorization: `Bearer ${createValidToken()}` } };
      const res = { status: (c) => { status = c; return { json: (d) => { json = d; } }; } };
      await executeGuardChain(req, res);
      assert.equal(status, 403);
      assert.equal(json.errorCode, 'ACCOUNT_DEACTIVATED');
    } finally { restore.reverse().forEach((f) => f()); }
  });

  await t.test('inactive user returns 403 ACCOUNT_INACTIVE', async () => {
    const restore = [];
    patch(User, 'findById', () => ({ lean: async () => ({ ...validUser, status: 'inactive' }) }), restore);
    try {
      let status, json;
      const req = { headers: { authorization: `Bearer ${createValidToken()}` } };
      const res = { status: (c) => { status = c; return { json: (d) => { json = d; } }; } };
      await executeGuardChain(req, res);
      assert.equal(status, 403);
      assert.equal(json.errorCode, 'ACCOUNT_INACTIVE');
    } finally { restore.reverse().forEach((f) => f()); }
  });

  await t.test('revoked role / non-passenger activeRole returns 403', async () => {
    const restore = [];
    patch(User, 'findById', () => ({ lean: async () => ({ ...validUser, roles: ['agent'] }) }), restore);
    try {
      let status, json;
      const req = { headers: { authorization: `Bearer ${createValidToken({ activeRole: 'agent', role: 'agent' })}` } };
      const res = { status: (c) => { status = c; return { json: (d) => { json = d; } }; } };
      await executeGuardChain(req, res);
      assert.equal(status, 403);
      assert.ok(json.errorCode === 'ROLE_REVOKED' || json.errorCode === 'INSUFFICIENT_ROLE');
    } finally { restore.reverse().forEach((f) => f()); }
  });

  await t.test('stale token version returns 401 SESSION_INVALIDATED', async () => {
    const restore = [];
    patch(User, 'findById', () => ({ lean: async () => ({ ...validUser, tokenVersion: 1 }) }), restore);
    try {
      let status, json;
      const req = { headers: { authorization: `Bearer ${createValidToken({ tokenVersion: 0 })}` } };
      const res = { status: (c) => { status = c; return { json: (d) => { json = d; } }; } };
      await executeGuardChain(req, res);
      assert.equal(status, 401);
      assert.equal(json.errorCode, 'SESSION_INVALIDATED');
    } finally { restore.reverse().forEach((f) => f()); }
  });

  await t.test('force password change returns 403 FORCE_PASSWORD_CHANGE', async () => {
    const restore = [];
    patch(User, 'findById', () => ({ lean: async () => ({ ...validUser, forcePasswordChange: true }) }), restore);
    try {
      let status, json;
      const req = { headers: { authorization: `Bearer ${createValidToken()}` } };
      const res = { status: (c) => { status = c; return { json: (d) => { json = d; } }; } };
      await executeGuardChain(req, res);
      assert.equal(status, 403);
      assert.equal(json.errorCode, 'FORCE_PASSWORD_CHANGE');
    } finally { restore.reverse().forEach((f) => f()); }
  });
});
