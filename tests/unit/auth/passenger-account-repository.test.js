'use strict';

/**
 * tests/unit/auth/passenger-account-repository.test.js
 *
 * Verifies the exact query and update contracts of
 * src/modules/auth/passenger-account/passenger-account.repository.js
 *
 * All database calls are patched with the monkey-patch convention used
 * throughout this test suite.  No live DB connection is required.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const User = require('../../../models/userModel');
const { buildPhoneQuery, normalizePhone } = require('../../../utils/phoneGuard');
const repository = require('../../../src/modules/auth/passenger-account/passenger-account.repository');

const patch = (obj, name, fn, restores) => {
  const orig = obj[name];
  obj[name] = fn;
  restores.push(() => { obj[name] = orig; });
};

// ── findIdentityByPhone ───────────────────────────────────────────────────────

test('passenger-account repository — findIdentityByPhone query contracts', async (t) => {
  await t.test('uses includeDeleted:true so soft-deleted records are found', () => {
    const restores = [];
    const calls = [];
    const selectSpy = (fields) => { calls.push(['select', fields]); return { lean: () => null }; };
    patch(User, 'findOne', (q) => { calls.push(['findOne', q]); return { select: selectSpy }; }, restores);
    try {
      repository.findIdentityByPhone('+9779800000001');
      // The query must NOT include deletedAt:null
      const query = calls[0][1];
      assert.ok(!('deletedAt' in query), 'deletedAt:null must NOT be present in identity lookup');
      // The phone filter must be present
      assert.ok('phone' in query || '$or' in query || JSON.stringify(query).includes('9800000001'),
        'Phone filter must be present');
    } finally { restores.reverse().forEach((fn) => fn()); }
  });

  await t.test('selects only safe fields — no password returned', () => {
    const restores = [];
    const calls = [];
    patch(User, 'findOne', () => ({
      select: (fields) => { calls.push(fields); return { lean: () => null }; },
    }), restores);
    try {
      repository.findIdentityByPhone('9800000001');
      const selected = calls[0];
      assert.ok(!selected.includes('password'), 'password must not be in select projection');
      assert.ok(selected.includes('roles'), 'roles must be selected');
      assert.ok(selected.includes('status'), 'status must be selected');
      assert.ok(selected.includes('deletedAt'), 'deletedAt must be selected for restriction checks');
    } finally { restores.reverse().forEach((fn) => fn()); }
  });
});

// ── addPassengerRoleIfMissing ─────────────────────────────────────────────────

test('passenger-account repository — addPassengerRoleIfMissing query contracts', async (t) => {
  await t.test('uses conditional filter { _id, roles: { $ne: passenger } } — not upsert', () => {
    const restores = [];
    const calls = [];
    patch(User, 'findOneAndUpdate', (...args) => { calls.push(args); return null; }, restores);
    try {
      repository.addPassengerRoleIfMissing('user-id-1', new Date('2025-01-01'));
      const [filter, update, options] = calls[0];
      // Filter must lock to the user AND only proceed when passenger is absent
      assert.deepEqual(filter, { _id: 'user-id-1', roles: { $ne: 'passenger' } });
      // $addToSet must be used (not $push or $set on roles directly)
      assert.deepEqual(update.$addToSet, { roles: 'passenger' });
      // activation timestamp must be set
      assert.ok('roleActivatedAt.passenger' in update.$set, 'roleActivatedAt.passenger must be set');
      // phoneVerified must be set
      assert.ok('phoneVerified' in update.$set, 'phoneVerified must be set');
      // new:true required so caller gets the updated document
      assert.equal(options.new, true);
      // Must NOT be an upsert
      assert.ok(!options.upsert, '$setOnInsert/upsert must not be used');
    } finally { restores.reverse().forEach((fn) => fn()); }
  });

  await t.test('activation timestamp equals the supplied now value', () => {
    const restores = [];
    const calls = [];
    const now = new Date('2025-06-15T10:00:00Z');
    patch(User, 'findOneAndUpdate', (...args) => { calls.push(args); return null; }, restores);
    try {
      repository.addPassengerRoleIfMissing('u2', now);
      const [, update] = calls[0];
      assert.deepEqual(update.$set['roleActivatedAt.passenger'], now);
    } finally { restores.reverse().forEach((fn) => fn()); }
  });
});

// ── createMinimalPassenger ────────────────────────────────────────────────────

test('passenger-account repository — createMinimalPassenger propagates duplicate-key errors', async (t) => {
  await t.test('does not swallow 11000 errors', async () => {
    const dupErr = Object.assign(new Error('dup'), { code: 11000, keyPattern: { phone: 1 } });
    const restores = [];
    // Temporarily override User's save by subclassing is complex; instead patch the
    // save prototype method to throw once.
    const origSave = User.prototype.save;
    User.prototype.save = function () { return Promise.reject(dupErr); };
    restores.push(() => { User.prototype.save = origSave; });
    try {
      await assert.rejects(
        () => repository.createMinimalPassenger({ phone: '9800000001', roles: ['passenger'], role: 'passenger' }),
        (err) => {
          assert.equal(err.code, 11000);
          return true;
        },
      );
    } finally { restores.reverse().forEach((fn) => fn()); }
  });
});
