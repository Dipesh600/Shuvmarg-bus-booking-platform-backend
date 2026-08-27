'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ASSIGNMENT_ID, OWNER_ID, assignment, harness, rejects, service,
} = require('../../helpers/bus-owner-agent-assignment-lifecycle-harness');

test('operator assignment suspend and reinstate', async (t) => {
  await t.test('suspend pins ACTIVE and writes only server state plus operator note', async () => {
    const hostile = { status: 'REVOKED', ownerId: 'other', revokedBy: 'other', note: '  cash shortfall  ' };
    const h = harness();
    try {
      const result = await service.suspendAssignment(OWNER_ID, ASSIGNMENT_ID, hostile);
      assert.equal(result.responseBody.data.status, 'SUSPENDED');
      const [filter, update] = h.calls.transitionAssignment[0];
      assert.deepEqual(filter, { _id: ASSIGNMENT_ID, ownerId: OWNER_ID, status: 'ACTIVE' });
      assert.deepEqual(Object.keys(update).sort(), ['operatorNote', 'status', 'suspendedAt']);
      assert.equal(update.operatorNote, 'cash shortfall');
      assert.ok(update.suspendedAt instanceof Date);
    } finally { h.restore(); }
  });

  await t.test('reinstate pins SUSPENDED and ignores a hostile body', async () => {
    const h = harness({
      transitionAssignment: (_filter, update) => assignment({
        suspendedAt: new Date('2026-08-22T10:00:00.000Z'),
        operatorNote: 'cash shortfall',
        ...update,
      }),
    });
    try {
      const result = await service.reinstateAssignment(OWNER_ID, ASSIGNMENT_ID, {
        status: 'REVOKED', revokedBy: 'other', operatorNote: 'replace',
      });
      assert.equal(result.responseBody.data.status, 'ACTIVE');
      const [filter, update] = h.calls.transitionAssignment[0];
      assert.deepEqual(filter, { _id: ASSIGNMENT_ID, ownerId: OWNER_ID, status: 'SUSPENDED' });
      assert.deepEqual(update, { status: 'ACTIVE' });
      assert.equal(Object.hasOwn(result.responseBody.data, 'suspendedAt'), false);
      assert.equal(Object.hasOwn(result.responseBody.data, 'operatorNote'), false);
    } finally { h.restore(); }
  });

  await t.test('T1 reinstate cannot accept an INVITED row for the agent', async () => {
    const invited = assignment({ status: 'INVITED' });
    const h = harness({ transitionAssignment: null, findAssignmentState: invited });
    try {
      await rejects(service.reinstateAssignment(OWNER_ID, ASSIGNMENT_ID), 409, 'ASSIGNMENT_STATE_CONFLICT');
      assert.equal(invited.status, 'INVITED');
      assert.equal(h.calls.transitionAssignment[0][0].status, 'SUSPENDED');
    } finally { h.restore(); }
  });

  await t.test('T7 suspending SUSPENDED is a status-naming 409, not a no-op 200', async () => {
    const h = harness({ transitionAssignment: null, findAssignmentState: assignment({ status: 'SUSPENDED' }) });
    try {
      await assert.rejects(
        service.suspendAssignment(OWNER_ID, ASSIGNMENT_ID, {}),
        (error) => error.statusCode === 409 && error.responseBody.assignmentStatus === 'SUSPENDED',
      );
    } finally { h.restore(); }
  });
});
