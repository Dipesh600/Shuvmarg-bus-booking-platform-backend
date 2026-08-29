'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  AGENT_ID, BRAND_ID, USER_ID, assignment, harness, service,
} = require('../../helpers/agent-assignment-response-harness');
const mapper = require('../../../src/modules/agent/assignment-response/agent-assignment-response.mapper');
const repository = require('../../../src/modules/agent/assignment-response/agent-assignment-response.repository');

test('agent assignment inbox is token-owned, paginated and ignores client agent ids', async () => {
  const h = harness();
  try {
    const result = await service.listAssignments(USER_ID, {
      agentId: 'attacker', page: '2', limit: '500', ownerId: 'attacker',
    });
    assert.deepEqual(h.calls.findAgentIdForUser[0], [USER_ID]);
    assert.deepEqual(h.calls.listAssignments[0], [AGENT_ID, { page: 2, limit: 50 }]);
    assert.deepEqual(h.calls.countAssignments[0], [AGENT_ID]);
    assert.equal(result.responseBody.pagination.limit, 50);
  } finally { h.restore(); }
});

test('malformed assignment paging is 400 before any database call', async () => {
  const h = harness();
  try {
    await assert.rejects(service.listAssignments(USER_ID, { page: '1001' }), (error) =>
      error.statusCode === 400);
    for (const calls of Object.values(h.calls)) assert.equal(calls.length, 0);
  } finally { h.restore(); }
});

test('assignment repository pins both list and count to the token agent id', () => {
  assert.deepEqual(repository.listAssignments(AGENT_ID, { page: 1, limit: 20 }).getFilter(), {
    agentId: AGENT_ID,
  });
  assert.deepEqual(repository.countAssignments(AGENT_ID).getFilter(), { agentId: AGENT_ID });
});

test('assignment inbox maps terms, hides internals and presents stale invites as expired', () => {
  const row = assignment({
    status: 'INVITED', expiresAt: new Date('2026-01-01'), ownerId: 'owner-secret',
    operatorNote: 'operator-secret', invitedBy: 'inviter-secret',
  });
  const response = mapper.toListResponse({
    rows: [row], total: 1, page: 1, limit: 20, now: new Date('2026-02-01'),
  });
  assert.equal(response.data[0].status, 'EXPIRED');
  assert.deepEqual(response.data[0].brand, { id: BRAND_ID, name: 'Kaski Yatayat' });
  const json = JSON.stringify(response);
  for (const secret of ['owner-secret', 'operator-secret', 'inviter-secret']) {
    assert.equal(json.includes(secret), false);
  }
});
