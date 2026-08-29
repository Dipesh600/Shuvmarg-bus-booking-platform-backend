'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const controller = require('../../../src/modules/bus-owner/agent-assignment-lifecycle/bus-owner-agent-assignment-lifecycle.controller');
const {
  ASSIGNMENT_ID, OWNER_ID, assignment, harness, rejects, service,
} = require('../../helpers/bus-owner-agent-assignment-lifecycle-harness');

test('operator assignment lifecycle security and errors', async (t) => {
  const actions = ['suspend', 'reinstate', 'revoke'];

  await t.test('T2/T3 every atomic transition and diagnostic read is owner-scoped', async () => {
    for (const action of actions) {
      const h = harness({ transitionAssignment: null, findAssignmentState: null });
      try {
        await rejects(service[`${action}Assignment`](OWNER_ID, ASSIGNMENT_ID, {}), 404);
        assert.equal(h.calls.transitionAssignment[0][0].ownerId, OWNER_ID);
        assert.deepEqual(h.calls.findAssignmentState[0], [ASSIGNMENT_ID, OWNER_ID]);
      } finally { h.restore(); }
    }
  });

  await t.test('T9 malformed ids cost zero repository queries for every write', async () => {
    for (const action of actions) {
      const h = harness();
      try {
        await rejects(service[`${action}Assignment`](OWNER_ID, 'not-an-id', { note: { bad: true } }), 404);
        for (const calls of Object.values(h.calls)) assert.equal(calls.length, 0);
      } finally { h.restore(); }
    }
  });

  await t.test('overlong operator note is 400 before any repository query', async () => {
    const h = harness();
    try {
      await rejects(service.suspendAssignment(OWNER_ID, ASSIGNMENT_ID, { note: 'x'.repeat(501) }), 400);
      for (const calls of Object.values(h.calls)) assert.equal(calls.length, 0);
    } finally { h.restore(); }
  });

  await t.test('T10 maps ValidationError and 11000 only', async () => {
    const validation = Object.assign(new Error('invalid'), {
      name: 'ValidationError', errors: { operatorNote: { message: 'bad note' } },
    });
    for (const [failure, status] of [[validation, 400], [Object.assign(new Error('dup'), { code: 11000 }), 409]]) {
      const h = harness({ transitionAssignment: () => { throw failure; } });
      try {
        await rejects(service.suspendAssignment(OWNER_ID, ASSIGNMENT_ID, {}), status);
      } finally { h.restore(); }
    }
  });

  await t.test('T10 unknown errors propagate unchanged', async () => {
    const failure = new Error('database unavailable');
    const h = harness({ transitionAssignment: () => { throw failure; } });
    try {
      await assert.rejects(service.suspendAssignment(OWNER_ID, ASSIGNMENT_ID, {}), (error) => error === failure);
    } finally { h.restore(); }
  });

  await t.test('T10 controller forwards unknown errors to the 500 pipeline', async () => {
    const failure = new Error('database unavailable');
    const original = service.suspendAssignment;
    service.suspendAssignment = async () => { throw failure; };
    const res = { status() { return this; }, json() { return this; } };
    try {
      let forwarded;
      await controller.suspendAssignment({
        userInfo: { id: OWNER_ID }, params: { assignmentId: ASSIGNMENT_ID }, body: {},
      }, res, (error) => { forwarded = error; });
      assert.equal(forwarded, failure);
    } finally { service.suspendAssignment = original; }
  });

  await t.test('T7 terminal status diagnosis names the stored state', async () => {
    const h = harness({ transitionAssignment: null, findAssignmentState: assignment({ status: 'DECLINED' }) });
    try {
      await assert.rejects(
        service.revokeAssignment(OWNER_ID, ASSIGNMENT_ID, {}),
        (error) => error.statusCode === 409 && error.responseBody.assignmentStatus === 'DECLINED',
      );
    } finally { h.restore(); }
  });
});
