'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const policy = require('../../../../src/modules/agent/application-status/reapply-policy');

test('reapply policy preserves 24-hour legacy calculation', async (t) => {
  const now = new Date('2026-07-19T12:00:00.000Z').getTime();
  const before = new Date(now - policy.REAPPLY_WINDOW_MS + 1);
  const exact = new Date(now - policy.REAPPLY_WINDOW_MS);
  const after = new Date(now - policy.REAPPLY_WINDOW_MS - 1);

  await t.test('defaults for non-rejected and permanent rejection', () => {
    assert.deepEqual(policy.calculateReapply({ applicationStatus: 'PENDING' }, now), {
      canReapply: false,
      reapplyAvailableAt: null,
    });
    assert.deepEqual(policy.calculateReapply({
      applicationStatus: 'REJECTED',
      isPermanentlyRejected: true,
      rejectedAt: after,
    }, now), { canReapply: false, reapplyAvailableAt: null });
  });

  await t.test('rejected before, at, after and without rejectedAt', () => {
    const early = policy.calculateReapply({ applicationStatus: 'REJECTED', rejectedAt: before }, now);
    assert.equal(early.canReapply, false);
    assert.equal(early.reapplyAvailableAt.getTime(), before.getTime() + policy.REAPPLY_WINDOW_MS);
    assert.deepEqual(policy.calculateReapply({ applicationStatus: 'REJECTED', rejectedAt: exact }, now), {
      canReapply: true,
      reapplyAvailableAt: null,
    });
    assert.deepEqual(policy.calculateReapply({ applicationStatus: 'REJECTED', rejectedAt: after }, now), {
      canReapply: true,
      reapplyAvailableAt: null,
    });
    assert.deepEqual(policy.calculateReapply({ applicationStatus: 'REJECTED' }, now), {
      canReapply: true,
      reapplyAvailableAt: null,
    });
  });
});
