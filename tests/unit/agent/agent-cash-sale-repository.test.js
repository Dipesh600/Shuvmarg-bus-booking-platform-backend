'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const repository = require('../../../src/modules/agent/cash-sale/agent-cash-sale.repository');

const HOLD = '64b000000000000000000003';
const USER = '64b000000000000000000001';
const NOW = new Date('2026-08-27T12:00:00.000Z');

test('V1 real commit Agent lookup is pinned to token user', () => {
  assert.deepEqual(repository.findAgentForUser(USER).getFilter(), { user: USER });
});

test('V3 claim is one atomic user-owned active-hold transition', () => {
  const query = repository.claimOwnedAgentHold(HOLD, USER, NOW);
  const filter = query.getFilter();
  assert.equal(filter._id, HOLD);
  assert.equal(filter.userId, USER);
  assert.equal(filter.status, 'held');
  assert.deepEqual(filter.expiresAt, { $gt: NOW });
  assert.deepEqual(filter.seatKeys, { $exists: true, $not: { $size: 0 } });
  assert.deepEqual(filter.agentAssignmentId, { $ne: null });
  assert.deepEqual(filter.authorizedBrandId, { $ne: null });
  const [transition] = query.getUpdate();
  assert.equal(transition.$set.status, 'processing');
  assert.equal(transition.$set.heldExpiresAt, '$expiresAt');
});

test('V3 diagnostic read cannot reveal another user hold', () => {
  const filter = repository.findOwnedHoldState(HOLD, USER).getFilter();
  assert.deepEqual(filter, { _id: HOLD, userId: USER });
});
