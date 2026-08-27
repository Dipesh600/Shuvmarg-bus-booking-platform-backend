'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { AGENT_PREVIEW_FIELDS } = require('../../../src/shared/identity/agent-assignability');
const repositorySource = require('node:fs').readFileSync(require.resolve(
  '../../../src/modules/bus-owner/agent-assignment-lifecycle/bus-owner-agent-assignment-lifecycle.repository',
), 'utf8');
const {
  BRAND_ID, OWNER_ID, assignment, harness, rejects, service,
} = require('../../helpers/bus-owner-agent-assignment-lifecycle-harness');

test('operator assignment list', async (t) => {
  await t.test('T2/T6 list filter is token-owned and client brand only narrows it', async () => {
    const h = harness();
    try {
      const result = await service.listAssignments(OWNER_ID, {
        brandId: BRAND_ID, status: 'ACTIVE', page: '2', limit: '1000', ownerId: 'attacker',
      });
      const [filter, paging] = h.calls.listAssignments[0];
      assert.deepEqual(filter, { ownerId: OWNER_ID, operatorId: BRAND_ID, status: 'ACTIVE' });
      assert.deepEqual(paging, {
        page: 2, limit: 50, brandId: BRAND_ID, status: 'ACTIVE',
      });
      assert.equal(result.responseBody.pagination.limit, 50);
    } finally { h.restore(); }
  });

  await t.test('invalid list filters are 400 with zero repository calls', async () => {
    const h = harness();
    try {
      await rejects(service.listAssignments(OWNER_ID, { brandId: 'bad', page: 'zero' }), 400);
      for (const calls of Object.values(h.calls)) assert.equal(calls.length, 0);
    } finally { h.restore(); }
  });

  await t.test('T6 PII and cross-owner internals are absent from the mapped list', async () => {
    const row = assignment({
      ownerId: 'owner-secret', revokedBy: 'revoker-secret', invitedBy: 'inviter-secret',
      agentId: {
        ...assignment().agentId,
        phone: '9800000000', email: 'private@example.com', panNo: 'PAN-SECRET',
        citizenshipNo: 'CITIZEN-SECRET', bankAccount: 'BANK-SECRET',
        user: { name: 'Ram Bahadur', phoneVerified: true, phone: '9811111111' },
      },
    });
    const h = harness({ listAssignments: { rows: [row], total: 1 } });
    try {
      const serialised = JSON.stringify((await service.listAssignments(OWNER_ID, {})).responseBody).toLowerCase();
      for (const forbidden of [
        'ownerid', 'revokedby', 'invitedby', '9800000000', 'private@example.com',
        'pan-secret', 'citizen-secret', 'bank-secret', '9811111111', 'phone', 'email',
      ]) assert.ok(!serialised.includes(forbidden), `${forbidden} must not appear`);
    } finally { h.restore(); }
  });

  await t.test('T6 repository reuses the one shared agent preview projection', () => {
    assert.ok(AGENT_PREVIEW_FIELDS.includes('applicationStatus'));
    assert.match(repositorySource, /select: AGENT_PREVIEW_FIELDS/);
    assert.doesNotMatch(repositorySource, /select: ['"]code agentId/);
  });
});
