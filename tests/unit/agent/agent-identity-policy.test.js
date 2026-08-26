'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const policy = require('../../../src/modules/agent/identity/agent-identity.policy');

test('agent identity patch allowlist', async (t) => {
  await t.test('accepts the editable agent fields', () => {
    const result = policy.buildProfilePatch({
      outletType: 'HOTEL',
      district: 'Kaski',
      municipality: 'Pokhara',
      placeName: 'Lakeside',
      businessName: 'Lake View Travels',
      shopAddress: 'Baidam Road 12',
    });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.agentPatch, {
      outletType: 'HOTEL',
      district: 'Kaski',
      municipality: 'Pokhara',
      placeName: 'Lakeside',
      businessName: 'Lake View Travels',
      shopAddress: 'Baidam Road 12',
    });
    assert.deepEqual(result.userPatch, {});
    assert.equal(result.isEmpty, false);
  });

  await t.test('name is routed to the User patch, not the Agent patch', () => {
    const result = policy.buildProfilePatch({ name: 'Ram Bahadur' });
    assert.deepEqual(result.userPatch, { name: 'Ram Bahadur' });
    assert.deepEqual(result.agentPatch, {});
    assert.deepEqual(result.errors, []);
  });

  await t.test('privileged fields are dropped silently, never written', () => {
    const result = policy.buildProfilePatch({
      scope: 'PLATFORM',
      applicationStatus: 'APPROVED',
      code: 'SM-AG-HACKED',
      agentId: 'SHV-AG-XXX-999',
      commissionRate: 99,
      createdByOwnerId: '507f1f77bcf86cd799439011',
      linkedOperatorId: '507f1f77bcf86cd799439012',
      commissionBalance: 100000,
      user: '507f1f77bcf86cd799439013',
      isPermanentlyRejected: false,
      minSettlementThreshold: 0,
      district: 'Kaski',
    });
    // Only the one legitimate field survives, and no error names the others —
    // the response must not confirm which privileged fields exist.
    assert.deepEqual(result.agentPatch, { district: 'Kaski' });
    assert.deepEqual(result.userPatch, {});
    assert.deepEqual(result.errors, []);
  });

  await t.test('prototype keys in the body contribute nothing', () => {
    const hostile = JSON.parse('{"__proto__":{"district":"pwned"},"constructor":"x"}');
    const result = policy.buildProfilePatch(hostile);
    assert.deepEqual(result.agentPatch, {});
    assert.deepEqual(result.userPatch, {});
    assert.equal(result.isEmpty, true);
    assert.equal({}.district, undefined);
  });

  await t.test('a missing or non-object body is an empty patch, not a crash', () => {
    for (const body of [undefined, null, 'string', 42, []]) {
      const result = policy.buildProfilePatch(body);
      assert.equal(result.isEmpty, true, `body: ${JSON.stringify(body)}`);
      assert.deepEqual(result.errors, []);
    }
  });
});
