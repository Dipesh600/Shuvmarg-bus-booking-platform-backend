'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getReapplyStatus } = require('../../../../src/modules/agent/application-submit/reapply-window.policy');

test('reapply-window.policy', async (t) => {
  await t.test('allows reapply if not rejected', () => {
    const result = getReapplyStatus({ applicationStatus: 'DRAFT' });
    assert.equal(result.canReapply, true);
  });

  await t.test('blocks permanently rejected', () => {
    const result = getReapplyStatus({ applicationStatus: 'REJECTED', isPermanentlyRejected: true });
    assert.equal(result.isPermanentlyRejected, true);
  });

  await t.test('blocks if rejected less than 24 hours ago', () => {
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);
    const result = getReapplyStatus({ applicationStatus: 'REJECTED', rejectedAt: oneHourAgo });
    assert.equal(result.isTooSoon, true);
    assert.equal(result.hoursLeft, 23);
  });

  await t.test('allows if rejected more than 24 hours ago', () => {
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const result = getReapplyStatus({ applicationStatus: 'REJECTED', rejectedAt: twentyFiveHoursAgo });
    assert.equal(result.canReapply, true);
  });
});
