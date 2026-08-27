'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const mapper = require('../../../src/modules/bus-owner/agent-invite/bus-owner-agent-invite.mapper');

test('create response', async (t) => {
  const built = (overrides = {}) => mapper.toCreatedResponse({
    agent: {
      _id: '507f1f77bcf86cd799439020',
      code: 'SM-AG-7K4QP2X',
      agentId: 'SHV-AG-KTM-001',
      scope: 'OPERATOR',
      outletType: 'TICKET_COUNTER',
      applicationStatus: 'DRAFT',
    },
    userId: '507f1f77bcf86cd799439013',
    name: 'Ram Bahadur',
    phone: '9800000000',
    brand: null,
    isUpgrade: false,
    smsSent: true,
    ...overrides,
  });

  await t.test('returns the agent code — the point of the call', () => {
    assert.equal(built().data.agentCode, 'SM-AG-7K4QP2X');
  });

  await t.test('never returns the temp password', () => {
    const serialised = JSON.stringify(built());
    assert.doesNotMatch(serialised, /tempPassword|password/i);
  });

  await t.test('flags that the agent, not the owner, must activate', () => {
    assert.equal(built().data.requiresAgentActivation, true);
    // An existing account is already activated, so there is nothing to wait for.
    assert.equal(built({ isUpgrade: true }).data.requiresAgentActivation, false);
  });

  await t.test('reports SMS delivery honestly', () => {
    assert.equal(built({ smsSent: false }).data.smsSent, false);
    // The code is still returned, so a failed SMS is recoverable by the owner.
    assert.equal(built({ smsSent: false }).data.agentCode, 'SM-AG-7K4QP2X');
  });

  await t.test('includes the brand only when one was verified', () => {
    assert.equal(built().data.brand, null);
    // Reads `brandName`, the field OperatorBrand actually has. This assertion
    // previously passed a `name` the schema never stores, which is how the
    // repository's `.select('name')` went unnoticed.
    assert.deepEqual(
      built({ brand: { _id: '507f1f77bcf86cd799439030', brandName: 'Kaski Yatayat' } }).data.brand,
      { id: '507f1f77bcf86cd799439030', name: 'Kaski Yatayat' },
    );
    // A brand loaded without its name still yields a null rather than undefined,
    // so the key is always present on the wire.
    assert.deepEqual(
      built({ brand: { _id: '507f1f77bcf86cd799439030' } }).data.brand,
      { id: '507f1f77bcf86cd799439030', name: null },
    );
  });
});
