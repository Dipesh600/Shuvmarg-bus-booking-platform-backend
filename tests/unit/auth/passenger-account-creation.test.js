'use strict';

/**
 * tests/unit/auth/passenger-account-creation.test.js
 *
 * Cases A: new phone → create minimal passenger account.
 * Concurrent creation race: 11000 duplicate-key recovery.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
const {
  createTestSecret,
} = require('../../helpers/security-test-values');

process.env.SECRET_KEY ||= createTestSecret('application-hmac');

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

// ── Case A: new phone ─────────────────────────────────────────────────────────

test('passenger-account — Case A: new phone creates minimal account', async (t) => {
  await t.test('creates minimal passenger when phone is new', async () => {
    const restores = []; const calls = [];
    patch(repository, 'findIdentityByPhone', async () => null, restores);
    patch(repository, 'createMinimalPassenger', async (data) => {
      calls.push(data);
      return { ...data, _id: 'new-uid', toObject: () => ({ ...data, _id: 'new-uid' }) };
    }, restores);
    try {
      const result = await service.resolvePassengerAccountAfterPhoneVerification({ phone: '9800000001', now: NOW });
      assert.equal(calls.length, 1);
      assert.equal(calls[0].role, 'passenger');
      assert.deepEqual(calls[0].roles, ['passenger']);
      assert.equal(calls[0].phoneVerified, true);
      assert.equal(calls[0].isVerified, true);
      assert.equal(calls[0].status, 'active');
      assert.ok(result._id);
    } finally { restores.reverse().forEach((fn) => fn()); }
  });

  await t.test('normalizes international phone before creating', async () => {
    const restores = []; const created = [];
    patch(repository, 'findIdentityByPhone', async () => null, restores);
    patch(repository, 'createMinimalPassenger', async (data) => {
      created.push(data.phone);
      return { ...data, toObject: () => data };
    }, restores);
    try {
      await service.resolvePassengerAccountAfterPhoneVerification({ phone: '+9779800000002', now: NOW });
      assert.equal(created[0], '9800000002');
    } finally { restores.reverse().forEach((fn) => fn()); }
  });
});

// ── Case A concurrency: duplicate-key 11000 recovery ─────────────────────────

test('passenger-account — Case A concurrent race recovery', async (t) => {
  await t.test('recovers from 11000 phone race: re-reads winner', async () => {
    const restores = [];
    const dupErr = Object.assign(new Error('dup'), { code: 11000, keyPattern: { phone: 1 } });
    const winner = passengerUser({ _id: 'winner-uid' });
    patch(repository, 'findIdentityByPhone', async () => null, restores);
    patch(repository, 'createMinimalPassenger', async () => Promise.reject(dupErr), restores);
    patch(repository, 'findIdentityByPhoneAfterRace', async () => winner, restores);
    try {
      const result = await service.resolvePassengerAccountAfterPhoneVerification({ phone: '9800000003', now: NOW });
      assert.equal(result._id, 'winner-uid');
    } finally { restores.reverse().forEach((fn) => fn()); }
  });

  await t.test('11000 on email does not trigger phone-race recovery', async () => {
    const restores = [];
    const emailDup = Object.assign(new Error('dup email'), { code: 11000, keyPattern: { email: 1 } });
    patch(repository, 'findIdentityByPhone', async () => null, restores);
    patch(repository, 'createMinimalPassenger', async () => Promise.reject(emailDup), restores);
    try {
      await assert.rejects(
        () => service.resolvePassengerAccountAfterPhoneVerification({ phone: '9800000004', now: NOW }),
        (err) => { assert.equal(err.keyPattern?.email, 1); return true; },
      );
    } finally { restores.reverse().forEach((fn) => fn()); }
  });

  await t.test('race recovery fails when winner is restricted', async () => {
    const restores = [];
    const dupErr = Object.assign(new Error('dup'), { code: 11000, keyPattern: { phone: 1 } });
    patch(repository, 'findIdentityByPhone', async () => null, restores);
    patch(repository, 'createMinimalPassenger', async () => Promise.reject(dupErr), restores);
    patch(repository, 'findIdentityByPhoneAfterRace', async () => passengerUser({ _id: 'b', status: 'banned' }), restores);
    try {
      await assert.rejects(
        () => service.resolvePassengerAccountAfterPhoneVerification({ phone: '9800000005', now: NOW }),
        { statusCode: 403 },
      );
    } finally { restores.reverse().forEach((fn) => fn()); }
  });

  await t.test('race recovery fails when winner cannot be re-read', async () => {
    const restores = [];
    const dupErr = Object.assign(new Error('dup'), { code: 11000, keyPattern: { phone: 1 } });
    patch(repository, 'findIdentityByPhone', async () => null, restores);
    patch(repository, 'createMinimalPassenger', async () => Promise.reject(dupErr), restores);
    patch(repository, 'findIdentityByPhoneAfterRace', async () => null, restores);
    try {
      await assert.rejects(
        () => service.resolvePassengerAccountAfterPhoneVerification({ phone: '9800000006', now: NOW }),
        { statusCode: 500 },
      );
    } finally { restores.reverse().forEach((fn) => fn()); }
  });
});
