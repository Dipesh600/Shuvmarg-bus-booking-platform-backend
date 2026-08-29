'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const policy = require('../../../src/modules/agent/identity/agent-identity.policy');

test('agent identity patch validation', async (t) => {
  await t.test('explicit null clears an optional field', () => {
    const result = policy.buildProfilePatch({ district: null, placeName: null });
    assert.deepEqual(result.agentPatch, { district: null, placeName: null });
    assert.deepEqual(result.errors, []);
  });

  await t.test('whitespace-only is treated as a clear, not as a value', () => {
    const result = policy.buildProfilePatch({ district: '   ' });
    assert.deepEqual(result.agentPatch, { district: null });
  });

  await t.test('values are trimmed', () => {
    const result = policy.buildProfilePatch({ businessName: '  Lake View  ' });
    assert.deepEqual(result.agentPatch, { businessName: 'Lake View' });
  });

  await t.test('non-string non-null values are rejected', () => {
    const result = policy.buildProfilePatch({ district: 42, businessName: { a: 1 } });
    assert.equal(result.errors.length, 2);
    assert.deepEqual(result.agentPatch, {});
  });

  await t.test('an over-long value is rejected and not truncated', () => {
    const result = policy.buildProfilePatch({
      shopAddress: 'x'.repeat(policy.MAX_TEXT_LENGTH + 1),
    });
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /200 characters or fewer/);
    assert.deepEqual(result.agentPatch, {});
  });

  await t.test('a value at exactly the limit is accepted', () => {
    const value = 'x'.repeat(policy.MAX_TEXT_LENGTH);
    const result = policy.buildProfilePatch({ shopAddress: value });
    assert.deepEqual(result.errors, []);
    assert.equal(result.agentPatch.shopAddress, value);
  });

  await t.test('outletType must be a recognised outlet, not free text', () => {
    const result = policy.buildProfilePatch({ outletType: 'ticket_counter' });
    assert.deepEqual(result.errors, ['outletType is not a recognised outlet type.']);
    assert.deepEqual(result.agentPatch, {});
  });

  await t.test('outletType may be cleared with null', () => {
    const result = policy.buildProfilePatch({ outletType: null });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.agentPatch, { outletType: null });
  });

  await t.test('name cannot be cleared — an agent must always have one', () => {
    for (const value of [null, '', '   ']) {
      const result = policy.buildProfilePatch({ name: value });
      assert.deepEqual(result.errors, ['name must be a non-empty string.']);
      assert.deepEqual(result.userPatch, {});
    }
  });

  await t.test('name has a minimum length', () => {
    const result = policy.buildProfilePatch({ name: 'Ab' });
    assert.match(result.errors[0], /at least 3 characters/);
    assert.deepEqual(result.userPatch, {});
  });

  await t.test('one bad field does not discard the good ones from the patch', () => {
    const result = policy.buildProfilePatch({ district: 'Kaski', outletType: 'nope' });
    assert.equal(result.errors.length, 1);
    assert.deepEqual(result.agentPatch, { district: 'Kaski' });
  });
});

test('trimmedOrNull', async (t) => {
  await t.test('distinguishes "clear it" from "not a string"', () => {
    assert.equal(policy.trimmedOrNull(null), null);
    assert.equal(policy.trimmedOrNull(''), null);
    assert.equal(policy.trimmedOrNull('  '), null);
    assert.equal(policy.trimmedOrNull(' a '), 'a');
    // undefined means "invalid type", which the caller turns into an error.
    assert.equal(policy.trimmedOrNull(undefined), undefined);
    assert.equal(policy.trimmedOrNull(0), undefined);
    assert.equal(policy.trimmedOrNull(false), undefined);
  });
});
