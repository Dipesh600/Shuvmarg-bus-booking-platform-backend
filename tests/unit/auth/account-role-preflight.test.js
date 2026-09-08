'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { inspectAccountRoles } = require('../../../scripts/preflightAccountRoles');

test('preflight distinguishes missing legacy roles, revocation and corrupt data without writes', async () => {
  const collection = { find: () => [
    { _id: 'legacy', role: 'agent' },
    { _id: 'revoked', role: 'agent', roles: [] },
    { _id: 'corrupt', role: 'agent', roles: null },
    { _id: 'unknown', roles: ['unsupported'] },
    { _id: 'remaining', role: 'agent', roles: ['passenger'] },
  ] };
  const report = await inspectAccountRoles(collection, 2);
  assert.equal(report.scanned, 5);
  assert.equal(report.missingLegacyRoles, 1);
  assert.equal(report.emptyRoles, 1);
  assert.equal(report.malformedRoles, 2);
  assert.equal(report.historicalRoleNotGranted, 1);
  assert.equal(report.requiresReview, true);
  assert.deepEqual(report.samples, [
    { userId: 'legacy', issue: 'missingLegacyRoles' }, { userId: 'revoked', issue: 'emptyRoles' },
  ]);
});
