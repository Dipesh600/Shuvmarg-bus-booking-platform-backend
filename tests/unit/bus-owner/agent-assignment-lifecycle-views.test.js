'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../../../src/modules/bus-owner/agent-assignment-lifecycle/bus-owner-agent-assignment-lifecycle.policy');
const {
  BRAND_ID, OWNER_ID, assignment, harness, rejects, service,
} = require('../../helpers/bus-owner-agent-assignment-lifecycle-harness');

test('operator assignment views', async (t) => {
  await t.test('current and history are owner-scoped and split stale invites at one boundary', () => {
    const now = new Date('2026-08-27T10:00:00.000Z');
    const current = policy.listFilter({ ownerId: OWNER_ID, brandId: BRAND_ID, view: 'CURRENT', now });
    const history = policy.listFilter({ ownerId: OWNER_ID, brandId: BRAND_ID, view: 'HISTORY', now });
    assert.equal(current.ownerId, OWNER_ID);
    assert.equal(current.operatorId, BRAND_ID);
    assert.deepEqual(current.$or, [
      { status: { $in: ['ACTIVE', 'SUSPENDED'] } },
      { status: 'INVITED', expiresAt: null },
      { status: 'INVITED', expiresAt: { $gt: now } },
    ]);
    assert.deepEqual(history.$or, [
      { status: { $in: ['REVOKED', 'DECLINED', 'EXPIRED'] } },
      { status: 'INVITED', expiresAt: { $lte: now } },
    ]);
  });

  await t.test('waiting excludes stale invites and exact expired includes them', () => {
    const now = new Date('2026-08-27T10:00:00.000Z');
    assert.deepEqual(policy.listFilter({ ownerId: OWNER_ID, status: 'INVITED', now }).$or, [
      { status: 'INVITED', expiresAt: null },
      { status: 'INVITED', expiresAt: { $gt: now } },
    ]);
    assert.deepEqual(policy.listFilter({ ownerId: OWNER_ID, status: 'EXPIRED', now }).$or, [
      { status: 'EXPIRED' },
      { status: 'INVITED', expiresAt: { $lte: now } },
    ]);
  });

  await t.test('stale persisted invitations are displayed as expired in history', async () => {
    const stale = assignment({ status: 'INVITED', expiresAt: new Date('2020-01-01T00:00:00.000Z') });
    const h = harness({ listAssignments: { rows: [stale], total: 1 } });
    try {
      const response = await service.listAssignments(OWNER_ID, { view: 'HISTORY' });
      assert.equal(response.responseBody.data[0].status, 'EXPIRED');
    } finally { h.restore(); }
  });

  await t.test('view is allowlisted and cannot combine with exact status', async () => {
    for (const query of [{ view: 'EVERYTHING' }, { view: 'CURRENT', status: 'ACTIVE' }]) {
      const h = harness();
      try {
        await rejects(service.listAssignments(OWNER_ID, query), 400);
        for (const calls of Object.values(h.calls)) assert.equal(calls.length, 0);
      } finally { h.restore(); }
    }
  });
});
