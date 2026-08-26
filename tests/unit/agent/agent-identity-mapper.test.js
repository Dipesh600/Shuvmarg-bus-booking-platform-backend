'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const mapper = require('../../../src/modules/agent/identity/agent-identity.mapper');
const { agent, user } = require('../../helpers/agent-identity-fixtures');

test('toIdentity wire shape', async (t) => {
  await t.test('exposes agentCode, never a bare "code"', () => {
    const data = mapper.toIdentity(agent(), user());
    assert.equal(data.agentCode, 'SM-AG-7K4QP2X');
    assert.equal(Object.hasOwn(data, 'code'), false);
  });

  await t.test('carries no privileged or financial field', () => {
    const data = mapper.toIdentity(
      agent({
        commissionRate: 12,
        commissionBalance: 5000,
        adminNotes: 'internal',
        citizenshipNumber: '12-34-56',
        panNumber: '123456789',
        bankAccountNumber: '0011002200',
        user: '507f1f77bcf86cd799439099',
        linkedOperatorId: '507f1f77bcf86cd799439012',
      }),
      user(),
    );
    for (const leaked of [
      'commissionRate', 'commissionBalance', 'adminNotes', 'citizenshipNumber',
      'panNumber', 'bankAccountNumber', 'user', 'linkedOperatorId', '_id',
    ]) {
      assert.equal(Object.hasOwn(data, leaked), false, `leaked: ${leaked}`);
    }
  });

  await t.test('a self-registered agent reads as not operator-created', () => {
    assert.equal(mapper.toIdentity(agent(), user()).createdByOperator, true);
    assert.equal(
      mapper.toIdentity(agent({ createdByOwnerId: null }), user()).createdByOperator,
      false,
    );
  });

  await t.test('missing user fields become null rather than undefined', () => {
    const data = mapper.toIdentity(agent(), null);
    assert.equal(data.name, null);
    assert.equal(data.phone, null);
    assert.equal(data.photoUrl, null);
  });

  await t.test('an agent with no code yet reports null, not a placeholder', () => {
    const data = mapper.toIdentity(agent({ code: null, agentId: null }), user());
    assert.equal(data.agentCode, null);
    assert.equal(data.legacyAgentId, null);
  });

  await t.test('the assignments block is present and zeroed for slice 1', () => {
    // The key exists to freeze the wire shape before AgentAssignment lands.
    assert.deepEqual(mapper.toIdentity(agent(), user()).assignments, {
      total: 0, active: 0, invited: 0,
    });
  });
});

test('KYC status presentation', async (t) => {
  await t.test('every status in the enum has a human label', () => {
    const { KYC_STATUSES } = require('../../../src/shared/identity/agent-enums');
    for (const status of Object.values(KYC_STATUSES)) {
      assert.equal(typeof mapper.KYC_LABELS.get(status), 'string', status);
      assert.notEqual(mapper.kycLabelFor(status), 'Status unavailable.', status);
    }
  });

  await t.test('an unknown status falls back rather than rendering undefined', () => {
    assert.equal(mapper.kycLabelFor('NONSENSE'), 'Status unavailable.');
    assert.equal(mapper.kycLabelFor(undefined), 'Status unavailable.');
    assert.equal(mapper.kycLabelFor('__proto__'), 'Status unavailable.');
  });

  await t.test('kycCleared follows the scope, not a hardcoded APPROVED', () => {
    const cleared = (scope, applicationStatus) => mapper
      .toIdentity(agent({ scope, applicationStatus }), user()).kycCleared;
    assert.equal(cleared('OPERATOR', 'VERIFIED_BASIC'), true);
    assert.equal(cleared('PLATFORM', 'APPROVED'), true);
    // APPROVED clears at either scope. Not a loose end: the admin setup wizard's
    // legacy agents sit at APPROVED with no scope, and refusing them here would
    // report kycCleared:false to agents who can still reach /profile — the API
    // and the route gate disagreeing about the same agent.
    assert.equal(cleared('OPERATOR', 'APPROVED'), true);
    // VERIFIED_BASIC is not a legal status for PLATFORM, and a platform agent
    // sells any operator's inventory: a proven phone is not enough for them.
    assert.equal(cleared('PLATFORM', 'VERIFIED_BASIC'), false);
    assert.equal(cleared('OPERATOR', 'DRAFT'), false);
    assert.equal(cleared('OPERATOR', 'SUSPENDED'), false);
  });
});
