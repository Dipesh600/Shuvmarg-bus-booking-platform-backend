'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const AgentAssignment = require('../../../models/agentAssignmentModel');
const assign = require('../../helpers/agent-assign-harness');
const {
  ASSIGNMENT_ID, OWNER_ID, assignment, harness, rejects, service,
} = require('../../helpers/bus-owner-agent-assignment-lifecycle-harness');

test('operator assignment revoke', async (t) => {
  for (const status of ['INVITED', 'ACTIVE', 'SUSPENDED']) {
    await t.test(`revoke from ${status} is terminal and token-attributed`, async () => {
      const h = harness({
        transitionAssignment: (filter, update) => (
          filter.status.$in.includes(status) ? assignment({ ...update, status: 'REVOKED' }) : null
        ),
      });
      try {
        const result = await service.revokeAssignment(OWNER_ID, ASSIGNMENT_ID, {
          note: '  relationship ended  ', status: 'ACTIVE', revokedBy: 'attacker', agentId: 'attacker',
        });
        assert.equal(result.responseBody.data.status, 'REVOKED');
        const [filter, update] = h.calls.transitionAssignment[0];
        assert.deepEqual(filter.status.$in, ['INVITED', 'ACTIVE', 'SUSPENDED']);
        assert.deepEqual(Object.keys(update).sort(), ['operatorNote', 'revokedAt', 'revokedBy', 'status']);
        assert.equal(update.revokedBy, OWNER_ID);
        assert.equal(update.operatorNote, 'relationship ended');
        assert.ok(update.revokedAt instanceof Date);
      } finally { h.restore(); }
    });
  }

  await t.test('T5/T7 REVOKED is terminal and a repeated revoke is 409', async () => {
    const h = harness({ transitionAssignment: null, findAssignmentState: assignment({ status: 'REVOKED' }) });
    try {
      await rejects(service.revokeAssignment(OWNER_ID, ASSIGNMENT_ID, {}), 409, 'ASSIGNMENT_STATE_CONFLICT');
      assert.equal(h.calls.transitionAssignment.length, 1);
    } finally { h.restore(); }
  });

  await t.test('T8 REVOKED frees the real live-index slot and operator re-invite returns 201', async () => {
    const [, options] = AgentAssignment.schema.indexes()
      .find(([, settings]) => settings.name === 'one_live_assignment_per_agent_operator');
    const liveStatuses = options.partialFilterExpression.status.$in;
    const h = assign.harness({
      createAssignment: () => {
        if (liveStatuses.includes('REVOKED')) throw Object.assign(new Error('collision'), { code: 11000 });
        return assign.savedAssignment();
      },
    });
    try {
      const result = await assign.service.assignAgent(assign.OWNER_ID, assign.validBody());
      assert.equal(result.statusCode, 201);
      assert.equal(h.calls.createAssignment.length, 1);
    } finally { h.restore(); }
  });
});
