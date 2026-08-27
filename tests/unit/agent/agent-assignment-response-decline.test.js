'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ASSIGNMENT_ID, USER_ID, assignment, harness, rejects, service,
} = require('../../helpers/agent-assignment-response-harness');

test('decline assignment invitation', async (t) => {
  await t.test('INVITED becomes DECLINED with trimmed reason and server time', async () => {
    const h = harness();
    try {
      const result = await service.declineAssignment(USER_ID, ASSIGNMENT_ID, { reason: '  Not now  ' });
      assert.equal(result.statusCode, 200);
      assert.equal(result.responseBody.data.status, 'DECLINED');
      assert.equal(result.responseBody.data.statusReason, 'Not now');
      assert.ok(result.responseBody.data.declinedAt instanceof Date);
    } finally { h.restore(); }
  });

  await t.test('S5 hostile body changes only status, declinedAt and statusReason', async () => {
    const hostile = {
      status: 'ACTIVE', agentId: 'aaaaaaaaaaaaaaaaaaaaaaaa', operatorId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
      operatorCommission: { mode: 'PERCENT', value: 99 },
      permissions: { canCancel: true, maxDiscountPct: 100 },
      acceptedAt: '2020-01-01T00:00:00.000Z', reason: '  no thanks  ',
    };
    const h = harness();
    try {
      await service.declineAssignment(USER_ID, ASSIGNMENT_ID, hostile);
      const [, update] = h.calls.transitionInvite[0];
      assert.deepEqual(Object.keys(update).sort(), ['declinedAt', 'status', 'statusReason']);
      assert.equal(update.status, 'DECLINED');
      assert.equal(update.statusReason, 'no thanks');
      assert.notEqual(update.declinedAt.toISOString(), hostile.acceptedAt);
    } finally { h.restore(); }
  });

  await t.test('S11 malformed id is 404 with zero calls even when reason is invalid', async () => {
    const h = harness();
    try {
      await rejects(
        service.declineAssignment(USER_ID, 'not-an-id', { reason: { hostile: true } }),
        404,
        'ASSIGNMENT_NOT_FOUND',
      );
      for (const calls of Object.values(h.calls)) assert.equal(calls.length, 0);
    } finally { h.restore(); }
  });

  await t.test('reason over schema maximum is 400 with zero repository calls', async () => {
    const h = harness();
    try {
      await rejects(
        service.declineAssignment(USER_ID, ASSIGNMENT_ID, { reason: 'x'.repeat(501) }),
        400,
      );
      for (const calls of Object.values(h.calls)) assert.equal(calls.length, 0);
    } finally { h.restore(); }
  });

  await t.test('unknown write failures propagate unchanged', async () => {
    const failure = new Error('database unavailable');
    const h = harness({ transitionInvite: () => { throw failure; } });
    try {
      await assert.rejects(
        service.declineAssignment(USER_ID, ASSIGNMENT_ID, {}),
        (error) => error === failure,
      );
    } finally { h.restore(); }
  });

  await t.test('duplicate-key write maps to 409', async () => {
    const h = harness({ transitionInvite: () => { throw Object.assign(new Error('dup'), { code: 11000 }); } });
    try {
      await rejects(service.declineAssignment(USER_ID, ASSIGNMENT_ID, {}), 409, 'ASSIGNMENT_CONFLICT');
    } finally { h.restore(); }
  });
});
