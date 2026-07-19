'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const policy = require('../../../../src/modules/agent/admin/setup/agent-setup.policy');

test('agent setup policy preserves field rules and response mapping', async (t) => {
  await t.test('truthy and typed fields match legacy behavior', () => {
    const agent = {};
    policy.applyTruthyFields(agent, { district: 'Kaski', municipality: '', bankName: 'Bank' });
    policy.applyAdminFields(agent, { commissionRate: 0, minSettlementThreshold: 0, adminNotes: '' });
    assert.deepEqual(agent, {
      district: 'Kaski',
      bankName: 'Bank',
      commissionRate: 0,
      minSettlementThreshold: 0,
      adminNotes: '',
    });
  });

  await t.test('success message depends on request agentType', () => {
    const agent = { agentId: 'A1', _id: 'mongo1', applicationStatus: 'APPROVED', agentType: 'DEFAULT' };
    assert.equal(policy.successBody(agent, { agentType: 'OPERATOR_LINKED' }).message,
      'Operator-linked agent created and approved!');
    assert.equal(policy.successBody(agent, { agentType: 'DEFAULT' }).message, 'Agent profile updated.');
  });
});
