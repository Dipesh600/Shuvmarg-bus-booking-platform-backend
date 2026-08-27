'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { AGENT_PREVIEW_FIELDS } = require('../../../src/shared/identity/agent-assignability');
const assignRepository = require('../../../src/modules/bus-owner/agent-assign/bus-owner-agent-assign.repository');
const lifecycleRepository = require('../../../src/modules/bus-owner/agent-assignment-lifecycle/bus-owner-agent-assignment-lifecycle.repository');
const lookupRepository = require('../../../src/modules/bus-owner/agent-lookup/bus-owner-agent-lookup.repository');
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

  await t.test('page accepts the cap and rejects the first value above it', async () => {
    const accepted = harness();
    try {
      await service.listAssignments(OWNER_ID, { page: '1000' });
      assert.equal(accepted.calls.listAssignments[0][1].page, 1000);
    } finally { accepted.restore(); }

    const rejected = harness();
    try {
      await rejects(service.listAssignments(OWNER_ID, { page: '1001' }), 400);
      for (const calls of Object.values(rejected.calls)) assert.equal(calls.length, 0);
    } finally { rejected.restore(); }
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

  await t.test('A1/A2 all three real queries apply the safe shared projection', () => {
    const projections = [
      lookupRepository.findAgentByCodeFilter({ _id: 'agent' }).projection(),
      assignRepository.findAgentByCodeFilter({ _id: 'agent' }).projection(),
    ];
    const lifecycleQuery = lifecycleRepository.buildListRowsQuery(
      { ownerId: OWNER_ID }, { page: 1, limit: 20 },
    );
    const lifecycleSelect = lifecycleQuery._mongooseOptions.populate.agentId.select;
    assert.equal(lifecycleSelect, AGENT_PREVIEW_FIELDS);
    projections.push(Object.fromEntries(lifecycleSelect.split(' ').map((field) => [field, 1])));

    for (const projection of projections) {
      assert.ok(projection, 'projection must be active, never undefined');
      assert.equal(projection.applicationStatus, 1);
      for (const field of Object.keys(projection)) {
        for (const forbidden of ['pan', 'bank', 'citizenship', 'phone', 'email']) {
          assert.ok(!field.toLowerCase().includes(forbidden), `${field} must not load ${forbidden}`);
        }
      }
    }
  });
});
