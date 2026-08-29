'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const repository = require('../../../src/modules/agent/seat-hold/agent-seat-hold.repository');

const AGENT = '64b000000000000000000001';
const BRAND = '64b000000000000000000002';
const USER = '64b000000000000000000003';

test('V1 real Agent lookup is pinned to token user', () => {
  assert.deepEqual(repository.findAgentForUser(USER).getFilter(), { user: USER });
});

test('V2 assignment query is narrowed by agent and Trip-derived brand', () => {
  const filter = repository.findActiveAssignments(AGENT, BRAND).getFilter();
  assert.equal(filter.agentId, AGENT);
  assert.equal(filter.operatorId, BRAND);
  assert.deepEqual(filter.status, { $in: ['ACTIVE'] });
  assert.equal(filter.ownerId, undefined);
});
