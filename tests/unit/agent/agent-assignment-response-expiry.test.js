'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const AgentAssignment = require('../../../models/agentAssignmentModel');
const assign = require('../../helpers/agent-assign-harness');
const {
  ASSIGNMENT_ID, USER_ID, assignment, harness, rejects, service,
} = require('../../helpers/agent-assignment-response-harness');

test('assignment response state and expiry', async (t) => {
  for (const status of ['DECLINED', 'REVOKED', 'EXPIRED']) {
    await t.test(`${status} is terminal: 409 and no expiry write`, async () => {
      const h = harness({ transitionInvite: null, findAssignmentState: assignment({ status }) });
      try {
        await rejects(service.acceptAssignment(USER_ID, ASSIGNMENT_ID), 409, 'ASSIGNMENT_NOT_INVITED');
        assert.equal(h.calls.expireStaleInvite.length, 0);
      } finally { h.restore(); }
    });
  }

  await t.test('S7 stale INVITED is atomically flipped to EXPIRED', async () => {
    const stale = assignment({ status: 'INVITED', expiresAt: new Date('2020-01-01T00:00:00Z') });
    const h = harness({ transitionInvite: null, findAssignmentState: stale });
    try {
      await rejects(service.acceptAssignment(USER_ID, ASSIGNMENT_ID), 409, 'INVITE_EXPIRED');
      const [filter] = h.calls.expireStaleInvite[0];
      const [transitionFilter] = h.calls.transitionInvite[0];
      assert.equal(filter._id, ASSIGNMENT_ID);
      assert.equal(filter.agentId, transitionFilter.agentId);
      assert.equal(filter.status, 'INVITED');
      assert.ok(filter.expiresAt.$lt instanceof Date);
      assert.equal(filter.expiresAt.$lt, transitionFilter.$or[1].expiresAt.$gt);
    } finally { h.restore(); }
  });

  await t.test('S6 null expiresAt remains acceptable', async () => {
    const h = harness();
    try {
      const result = await service.acceptAssignment(USER_ID, ASSIGNMENT_ID);
      assert.equal(result.statusCode, 200);
      assert.deepEqual(h.calls.transitionInvite[0][0].$or[0], { expiresAt: null });
    } finally { h.restore(); }
  });

  await t.test('concurrent double accept gives exactly one 200 and one 409', async () => {
    let writes = 0;
    const h = harness({
      transitionInvite: (_filter, update) => (++writes === 1 ? assignment(update) : null),
      findAssignmentState: assignment({ status: 'ACTIVE' }),
    });
    try {
      const results = await Promise.allSettled([
        service.acceptAssignment(USER_ID, ASSIGNMENT_ID),
        service.acceptAssignment(USER_ID, ASSIGNMENT_ID),
      ]);
      assert.deepEqual(results.map((item) => item.status).sort(), ['fulfilled', 'rejected']);
      assert.equal(results.find((item) => item.status === 'fulfilled').value.statusCode, 200);
      assert.equal(results.find((item) => item.status === 'rejected').reason.statusCode, 409);
    } finally { h.restore(); }
  });

  await t.test('after DECLINED or EXPIRED, the operator can re-invite', async () => {
    const [, options] = AgentAssignment.schema.indexes()
      .find(([, settings]) => settings.name === 'one_live_assignment_per_agent_operator');
    const liveStatuses = options.partialFilterExpression.status.$in;

    for (const priorStatus of ['DECLINED', 'EXPIRED']) {
      const h = assign.harness({
        createAssignment: () => {
          if (liveStatuses.includes(priorStatus)) {
            throw Object.assign(new Error('live assignment collision'), { code: 11000 });
          }
          return assign.savedAssignment();
        },
      });
      try {
        const result = await assign.service.assignAgent(assign.OWNER_ID, assign.validBody());
        assert.equal(result.statusCode, 201);
        assert.equal(h.calls.createAssignment.length, 1);
      } finally { h.restore(); }
    }
  });
});
