'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const controller = require('../../../src/modules/agent/assignment-response/agent-assignment-response.controller');
const {
  AGENT_ID, ASSIGNMENT_ID, USER_ID, assignment, harness, rejects, service,
} = require('../../helpers/agent-assignment-response-harness');

test('accept assignment invitation', async (t) => {
  await t.test('INVITED becomes ACTIVE with a server acceptedAt', async () => {
    const h = harness();
    try {
      const result = await service.acceptAssignment(USER_ID, ASSIGNMENT_ID);
      assert.equal(result.statusCode, 200);
      assert.equal(result.responseBody.data.status, 'ACTIVE');
      assert.ok(result.responseBody.data.acceptedAt instanceof Date);
    } finally { h.restore(); }
  });

  await t.test('S8 accept controller never forwards the request body', async () => {
    const original = service.acceptAssignment;
    const calls = [];
    service.acceptAssignment = async (...args) => {
      calls.push(args);
      return { statusCode: 200, responseBody: { success: true } };
    };
    const res = { status() { return this; }, json() { return this; } };
    try {
      await controller.acceptAssignment({
        userInfo: { id: USER_ID },
        params: { assignmentId: ASSIGNMENT_ID },
        body: { acceptedAt: '2020-01-01T00:00:00.000Z', status: 'ACTIVE' },
      }, res, assert.fail);
      assert.deepEqual(calls, [[USER_ID, ASSIGNMENT_ID]]);
    } finally { service.acceptAssignment = original; }
  });

  await t.test('S1/S2/S3 filter owns the id, agent, state and expiry', async () => {
    const h = harness();
    try {
      await service.acceptAssignment(USER_ID, ASSIGNMENT_ID);
      const [filter, update] = h.calls.transitionInvite[0];
      assert.equal(filter._id, ASSIGNMENT_ID);
      assert.equal(filter.agentId, AGENT_ID);
      assert.equal(filter.status, 'INVITED');
      assert.deepEqual(filter.$or[0], { expiresAt: null });
      assert.ok(filter.$or[1].expiresAt.$gt instanceof Date);
      assert.deepEqual(Object.keys(update).sort(), ['acceptedAt', 'status']);
      assert.equal(update.acceptedAt, filter.$or[1].expiresAt.$gt);
    } finally { h.restore(); }
  });

  await t.test('S1 diagnostic miss remains scoped to assignment id and acting agent', async () => {
    const h = harness({ transitionInvite: null, findAssignmentState: null });
    try {
      await rejects(service.acceptAssignment(USER_ID, ASSIGNMENT_ID), 404);
      assert.deepEqual(h.calls.findAssignmentState[0], [ASSIGNMENT_ID, AGENT_ID]);
    } finally { h.restore(); }
  });

  await t.test('S11 malformed id is a 404 with zero repository calls', async () => {
    const h = harness();
    try {
      await rejects(service.acceptAssignment(USER_ID, 'not-an-id'), 404, 'ASSIGNMENT_NOT_FOUND');
      for (const calls of Object.values(h.calls)) assert.equal(calls.length, 0);
    } finally { h.restore(); }
  });

  await t.test('S2 no Agent row is NO_APPLICATION with no assignment query', async () => {
    const h = harness({ findAgentIdForUser: null });
    try {
      await rejects(service.acceptAssignment(USER_ID, ASSIGNMENT_ID), 403, 'NO_APPLICATION');
      assert.equal(h.calls.transitionInvite.length, 0);
      assert.equal(h.calls.findAssignmentState.length, 0);
    } finally { h.restore(); }
  });

  await t.test('S4 SUSPENDED cannot self-reinstate and remains SUSPENDED', async () => {
    const row = assignment({ status: 'SUSPENDED' });
    const h = harness({ transitionInvite: null, findAssignmentState: row });
    try {
      await rejects(service.acceptAssignment(USER_ID, ASSIGNMENT_ID), 409, 'ASSIGNMENT_NOT_INVITED');
      assert.equal(row.status, 'SUSPENDED');
      assert.equal(h.calls.expireStaleInvite.length, 0);
    } finally { h.restore(); }
  });
});
