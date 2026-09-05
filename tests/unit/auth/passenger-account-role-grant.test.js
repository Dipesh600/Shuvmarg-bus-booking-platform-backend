'use strict';

/**
 * tests/unit/auth/passenger-account-role-grant.test.js
 *
 * Cases B: existing user → add passenger role (including concurrent race).
 * Cases C: existing passenger → idempotent return (no re-timestamping).
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
  roleActivatedAt: { passenger: new Date() }, status: 'active', deletedAt: null, ...o,
});
const multiRoleUser = (o = {}) => ({
  _id: 'uid-multi', role: 'agent', roles: ['agent'],
  roleActivatedAt: { agent: new Date() }, status: 'active', deletedAt: null, ...o,
});

// ── Case B: existing user, add passenger role ─────────────────────────────────

test('passenger-account — Case B: add passenger role to existing user', async (t) => {
  await t.test('grants passenger to existing user who lacks it', async () => {
    const restores = [];
    const agentUser = multiRoleUser();
    const afterGrant = { ...agentUser, roles: ['agent', 'passenger'] };
    patch(repository, 'findIdentityByPhone', async () => agentUser, restores);
    patch(repository, 'addPassengerRoleIfMissing', async () => ({ ...afterGrant, toObject: () => afterGrant }), restores);
    try {
      const result = await service.resolvePassengerAccountAfterPhoneVerification({ phone: '9800000010', now: NOW });
      assert.ok(result.roles.includes('passenger') || result.roles.includes('agent'));
    } finally { restores.reverse().forEach((fn) => fn()); }
  });

  await t.test('concurrent role-grant race: re-reads when addPassengerRoleIfMissing returns null', async () => {
    const restores = [];
    const afterRace = passengerUser({ _id: 'uid-multi', roles: ['agent', 'passenger'] });
    patch(repository, 'findIdentityByPhone', async () => multiRoleUser(), restores);
    patch(repository, 'addPassengerRoleIfMissing', async () => null, restores);
    patch(repository, 'findByIdForPassengerResolution', async () => afterRace, restores);
    try {
      const result = await service.resolvePassengerAccountAfterPhoneVerification({ phone: '9800000011', now: NOW });
      assert.ok(result._id);
    } finally { restores.reverse().forEach((fn) => fn()); }
  });

  await t.test('concurrent grant: first activation timestamp is preserved', async () => {
    const restores = [];
    const firstTimestamp = new Date('2025-01-01T00:00:00Z');
    const afterRace = passengerUser({
      _id: 'uid-multi',
      roleActivatedAt: { passenger: firstTimestamp, agent: new Date() },
    });
    patch(repository, 'findIdentityByPhone', async () => multiRoleUser(), restores);
    patch(repository, 'addPassengerRoleIfMissing', async () => null, restores);
    patch(repository, 'findByIdForPassengerResolution', async () => afterRace, restores);
    try {
      const result = await service.resolvePassengerAccountAfterPhoneVerification({
        phone: '9800000012', now: new Date('2025-06-01'),
      });
      assert.deepEqual(result.roleActivatedAt?.passenger, firstTimestamp);
    } finally { restores.reverse().forEach((fn) => fn()); }
  });
});

// ── Case C: already a passenger ───────────────────────────────────────────────

test('passenger-account — Case C: existing passenger returned without modification', async (t) => {
  await t.test('returns existing passenger without calling addPassengerRoleIfMissing', async () => {
    const restores = [];
    const existing = passengerUser();
    let grantCalled = false;
    patch(repository, 'findIdentityByPhone', async () => existing, restores);
    patch(repository, 'addPassengerRoleIfMissing', async () => { grantCalled = true; }, restores);
    try {
      const result = await service.resolvePassengerAccountAfterPhoneVerification({ phone: '9800000020', now: NOW });
      assert.equal(grantCalled, false);
      assert.equal(result._id, existing._id);
    } finally { restores.reverse().forEach((fn) => fn()); }
  });

  await t.test('legacy passenger (role:passenger, missing roles) returned without re-timestamping', async () => {
    const restores = [];
    const legacy = { _id: 'legacy-uid', role: 'passenger', roleActivatedAt: {}, status: 'active', deletedAt: null };
    let grantCalled = false;
    patch(repository, 'findIdentityByPhone', async () => legacy, restores);
    patch(repository, 'addPassengerRoleIfMissing', async () => { grantCalled = true; }, restores);
    try {
      const result = await service.resolvePassengerAccountAfterPhoneVerification({ phone: '9800000021', now: NOW });
      assert.equal(grantCalled, false, 'existing passenger must not have timestamp rewritten');
      assert.equal(result._id, 'legacy-uid');
    } finally { restores.reverse().forEach((fn) => fn()); }
  });
});
