'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const policy = require('../../../../src/modules/agent/admin/conversion/agent-conversion.policy');

test('agent conversion policy preserves role fallback and response mapping', async (t) => {
  await t.test('roles array wins when populated and legacy role is fallback', () => {
    assert.deepEqual(policy.resolveRoles({ roles: ['busOwner'], role: 'passenger' }), ['busOwner']);
    assert.deepEqual(policy.resolveRoles({ roles: [], role: 'passenger' }), []);
    assert.deepEqual(policy.resolveRoles({ role: 'passenger' }), ['passenger']);
    assert.equal(policy.hasAgentRole(['passenger', 'agent']), true);
    assert.equal(policy.hasAgentRole(['passenger']), false);
  });

  await t.test('success body keeps exact legacy fields', () => {
    const body = policy.successBody(
      { _id: 'user1' },
      ['passenger'],
      { _id: 'agent1', agentId: 'SHV-AG-001' }
    );
    assert.deepEqual(body, {
      success: true,
      message: 'Agent role added to user successfully!',
      data: {
        userId: 'user1',
        roles: ['passenger', 'agent'],
        agentId: 'SHV-AG-001',
        agentMongoId: 'agent1',
      },
    });
  });
});
