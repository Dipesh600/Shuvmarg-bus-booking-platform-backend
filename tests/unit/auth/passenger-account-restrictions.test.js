'use strict';

/**
 * tests/unit/auth/passenger-account-restrictions.test.js
 *
 * Account restriction enforcement: banned / inactive / invited / soft-deleted → 403.
 * pending → allowed without status mutation.
 * Phone format validation: missing/null phone → 400.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.SECRET_KEY ||= 'test-only-secret-32chars-minimum!!';

const repository = require('../../../src/modules/auth/passenger-account/passenger-account.repository');
const service = require('../../../src/modules/auth/passenger-account/passenger-account.service');

const NOW = new Date('2025-06-01T12:00:00Z');
const patch = (obj, name, fn, restores) => {
  const orig = obj[name]; obj[name] = fn;
  restores.push(() => { obj[name] = orig; });
};
const passengerUser = (o = {}) => ({
  _id: 'uid-pass', role: 'passenger', roles: ['passenger'],
  roleActivatedAt: { passenger: new Date() }, status: 'active',
  deletedAt: null, phoneVerified: true, isVerified: true, ...o,
});

// ── Account restriction enforcement ──────────────────────────────────────────

test('passenger-account — restriction enforcement', async (t) => {
  const runWithStatus = async (status, deletedAt = null) => {
    const restores = [];
    patch(repository, 'findIdentityByPhone', async () => passengerUser({ status, deletedAt }), restores);
    try {
      await assert.rejects(
        () => service.resolvePassengerAccountAfterPhoneVerification({ phone: '9800000030', now: NOW }),
        (err) => { assert.equal(err.statusCode, 403); return true; },
      );
    } finally { restores.reverse().forEach((fn) => fn()); }
  };

  await t.test('banned account is blocked (403)', () => runWithStatus('banned'));
  await t.test('inactive account is blocked (403)', () => runWithStatus('inactive'));
  await t.test('invited account is blocked (403)', () => runWithStatus('invited'));

  await t.test('soft-deleted account is blocked (403)', async () => {
    const restores = [];
    patch(repository, 'findIdentityByPhone', async () =>
      passengerUser({ deletedAt: new Date('2024-01-01'), status: 'active' }), restores);
    try {
      await assert.rejects(
        () => service.resolvePassengerAccountAfterPhoneVerification({ phone: '9800000031', now: NOW }),
        (err) => { assert.equal(err.statusCode, 403); return true; },
      );
    } finally { restores.reverse().forEach((fn) => fn()); }
  });

  await t.test('pending account is ALLOWED without status mutation', async () => {
    const restores = []; let mutated = false;
    const pending = passengerUser({ status: 'pending' });
    patch(repository, 'findIdentityByPhone', async () => pending, restores);
    patch(repository, 'addPassengerRoleIfMissing', async () => ({ ...pending, toObject: () => pending }), restores);
    patch(repository, 'findByIdForPassengerResolution', async () => { mutated = true; return pending; }, restores);
    try {
      const result = await service.resolvePassengerAccountAfterPhoneVerification({ phone: '9800000032', now: NOW });
      assert.equal(result.status, 'pending', 'status must remain pending');
      assert.equal(mutated, false, 'status must not be mutated');
    } finally { restores.reverse().forEach((fn) => fn()); }
  });

  await t.test('active account is allowed', async () => {
    const restores = [];
    patch(repository, 'findIdentityByPhone', async () => passengerUser({ status: 'active' }), restores);
    try {
      const result = await service.resolvePassengerAccountAfterPhoneVerification({ phone: '9800000033', now: NOW });
      assert.ok(result);
    } finally { restores.reverse().forEach((fn) => fn()); }
  });
});

// ── Phone format validation ───────────────────────────────────────────────────

test('passenger-account — phone format validation', async (t) => {
  await t.test('raw international input resolves correctly', async () => {
    const restores = [];
    const existing = passengerUser({ phone: '9800000040' });
    patch(repository, 'findIdentityByPhone', async (rawPhone) => {
      assert.ok(typeof rawPhone === 'string');
      return existing;
    }, restores);
    try {
      const result = await service.resolvePassengerAccountAfterPhoneVerification({ phone: '+9779800000040', now: NOW });
      assert.equal(result._id, existing._id);
    } finally { restores.reverse().forEach((fn) => fn()); }
  });

  await t.test('empty phone throws 400', async () => {
    await assert.rejects(
      () => service.resolvePassengerAccountAfterPhoneVerification({ phone: '', now: NOW }),
      (err) => { assert.equal(err.statusCode, 400); return true; },
    );
  });

  await t.test('null phone throws 400', async () => {
    await assert.rejects(
      () => service.resolvePassengerAccountAfterPhoneVerification({ phone: null, now: NOW }),
      (err) => { assert.equal(err.statusCode, 400); return true; },
    );
  });
});
