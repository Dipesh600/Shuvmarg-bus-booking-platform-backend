'use strict';

/**
 * tests/unit/shared/account-role-policy.test.js
 *
 * Unit tests for src/shared/auth/account-role.policy.js
 *
 * All tests are pure — no DB, no mocks, no side-effects.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../../../src/shared/auth/account-role.policy');

// ── getEffectiveRoles ─────────────────────────────────────────────────────────

test('account-role policy — getEffectiveRoles', async (t) => {
  await t.test('returns [] for null input', () => {
    assert.deepEqual(policy.getEffectiveRoles(null), []);
  });

  await t.test('returns [] for empty object', () => {
    assert.deepEqual(policy.getEffectiveRoles({}), []);
  });

  await t.test('returns roles[] when non-empty', () => {
    const result = policy.getEffectiveRoles({ roles: ['agent', 'passenger'], role: 'passenger' });
    assert.deepEqual(result, ['agent', 'passenger']);
  });

  await t.test('falls back to [role] when roles is missing', () => {
    const result = policy.getEffectiveRoles({ role: 'agent' });
    assert.deepEqual(result, ['agent']);
  });

  await t.test('deduplicates roles[]', () => {
    const result = policy.getEffectiveRoles({ roles: ['passenger', 'passenger'] });
    assert.deepEqual(result, ['passenger']);
  });

  await t.test('returns [] when both roles and role are absent', () => {
    assert.deepEqual(policy.getEffectiveRoles({ name: 'test' }), []);
  });
});

// ── requiresPasswordForRoles ──────────────────────────────────────────────────

test('account-role policy — requiresPasswordForRoles', async (t) => {
  await t.test('returns false for empty array', () => {
    assert.equal(policy.requiresPasswordForRoles([]), false);
  });

  await t.test('returns false for passenger-only', () => {
    assert.equal(policy.requiresPasswordForRoles(['passenger']), false);
  });

  await t.test('returns true for agent', () => {
    assert.equal(policy.requiresPasswordForRoles(['agent']), true);
  });

  await t.test('returns true for busOwner', () => {
    assert.equal(policy.requiresPasswordForRoles(['busOwner']), true);
  });

  await t.test('returns true for conductor', () => {
    assert.equal(policy.requiresPasswordForRoles(['conductor']), true);
  });

  await t.test('returns true for driver', () => {
    assert.equal(policy.requiresPasswordForRoles(['driver']), true);
  });

  await t.test('returns true for passenger + agent mix', () => {
    assert.equal(policy.requiresPasswordForRoles(['passenger', 'agent']), true);
  });
});

// ── hasPrivilegedRole ─────────────────────────────────────────────────────────

test('account-role policy — hasPrivilegedRole', async (t) => {
  await t.test('passenger-only document — false', () => {
    assert.equal(policy.hasPrivilegedRole({ roles: ['passenger'] }), false);
  });

  await t.test('agent in roles[] — true', () => {
    assert.equal(policy.hasPrivilegedRole({ roles: ['agent'] }), true);
  });

  // Critical: validator runs BEFORE pre-save hook — roles may be missing on a
  // legacy or newly constructed document; must fall back to role field.
  await t.test('role:agent with missing roles still returns true (pre-save not yet run)', () => {
    assert.equal(policy.hasPrivilegedRole({ role: 'agent' }), true);
  });

  await t.test('no roles, no role — false', () => {
    assert.equal(policy.hasPrivilegedRole({ name: 'x' }), false);
  });

  await t.test('null input — false', () => {
    assert.equal(policy.hasPrivilegedRole(null), false);
  });
});

// ── canRemainPasswordless ─────────────────────────────────────────────────────

test('account-role policy — canRemainPasswordless', async (t) => {
  await t.test('passenger-only — true', () => {
    assert.equal(policy.canRemainPasswordless({ roles: ['passenger'] }), true);
  });

  await t.test('agent — false', () => {
    assert.equal(policy.canRemainPasswordless({ roles: ['agent'] }), false);
  });

  await t.test('empty user — true (no privileged role)', () => {
    assert.equal(policy.canRemainPasswordless({}), true);
  });
});

// ── PRIVILEGED_ROLES immutability ─────────────────────────────────────────────

test('account-role policy — PRIVILEGED_ROLES is frozen', () => {
  assert.throws(
    () => {
      policy.PRIVILEGED_ROLES.push(Symbol('role-mutation-probe'));
    },
    TypeError,
  );
  assert.ok(policy.PRIVILEGED_ROLES.includes('agent'));
  assert.ok(policy.PRIVILEGED_ROLES.includes('busOwner'));
  assert.ok(policy.PRIVILEGED_ROLES.includes('conductor'));
  assert.ok(policy.PRIVILEGED_ROLES.includes('driver'));
  assert.ok(!policy.PRIVILEGED_ROLES.includes('passenger'));
});


test('explicitly empty or malformed role state never restores historical access', () => {
  for (const roles of [[], null, 'agent', {}, ['passenger', 'unsupported']]) {
    assert.deepEqual(policy.getEffectiveRoles({ role: 'agent', roles }), []);
    assert.equal(policy.hasPrivilegedRole({ role: 'agent', roles }), false);
  }
  assert.deepEqual(policy.getEffectiveRoles({ role: 'agent', roles: ['passenger'] }), ['passenger']);
});
