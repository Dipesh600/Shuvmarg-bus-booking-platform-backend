'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AGENT_OBJECT_ID, BRAND_ID, OWNER_ID, VALID_CODE,
  harness, service, storedAgent, validBody,
} = require('../../helpers/agent-assign-harness');

test('operator agent assign — success', async (t) => {
  await t.test('creates an INVITED assignment and returns 201', async () => {
    const h = harness();
    try {
      const result = await service.assignAgent(OWNER_ID, validBody());
      assert.equal(result.statusCode, 201);
      assert.equal(result.responseBody.success, true);
      assert.equal(result.responseBody.data.status, 'INVITED');
      assert.equal(result.responseBody.data.requiresAgentAcceptance, true);
      assert.equal(result.responseBody.data.brand.name, 'Kaski Yatayat');
      assert.equal(result.responseBody.data.agent.agentCode, VALID_CODE);
    } finally { h.restore(); }
  });

  await t.test('writes the agent by _id and the brand as the operator', async () => {
    const h = harness();
    try {
      await service.assignAgent(OWNER_ID, validBody());
      const [record] = h.calls.createAssignment[0];
      assert.equal(String(record.agentId), AGENT_OBJECT_ID);
      assert.equal(record.operatorId, BRAND_ID);
      assert.equal(record.ownerId, OWNER_ID);
      assert.equal(record.status, 'INVITED');
    } finally { h.restore(); }
  });

  await t.test('accepts a legacy SHV-AG code as the handle', async () => {
    const h = harness({ findAgentByCodeFilter: () => storedAgent({ agentId: 'SHV-AG-KTM-001' }) });
    try {
      const result = await service.assignAgent(OWNER_ID, validBody({ agentCode: 'SHV-AG-KTM-001' }));
      assert.equal(result.statusCode, 201);
      // The filter reached the database, so the legacy form is a real query and
      // not a shape the parser silently discarded.
      assert.equal(h.calls.findAgentByCodeFilter.length, 1);
    } finally { h.restore(); }
  });

  await t.test('invites an agent whose KYC is not finished', async () => {
    const h = harness({
      findAgentByCodeFilter: () => storedAgent({
        applicationStatus: 'DRAFT',
        user: { name: 'Ram Bahadur', phoneVerified: false },
      }),
    });
    try {
      const result = await service.assignAgent(OWNER_ID, validBody());
      // Not a refusal: the invite is what gets the agent to finish KYC. The
      // verification gate belongs on the sale, and the response says where the
      // agent stands so the operator is not misled.
      assert.equal(result.statusCode, 201);
      assert.equal(result.responseBody.data.agent.isVerified, false);
    } finally { h.restore(); }
  });

  await t.test('reports the derived KYC status, not the stale stored one', async () => {
    const h = harness({
      findAgentByCodeFilter: () => storedAgent({
        applicationStatus: 'DRAFT',
        user: { name: 'Ram Bahadur', phoneVerified: true },
      }),
    });
    try {
      const result = await service.assignAgent(OWNER_ID, validBody());
      assert.notEqual(result.responseBody.data.agent.kycStatus, 'DRAFT');
    } finally { h.restore(); }
  });

  await t.test('stores the terms the operator chose', async () => {
    const h = harness();
    try {
      await service.assignAgent(OWNER_ID, validBody({
        accessScope: 'SCHEDULES',
        allowedScheduleIds: ['aaaaaaaaaaaaaaaaaaaaaaaa'],
        permissions: { canCancel: true, cancelWindowMins: 45 },
        commission: { mode: 'PERCENT', value: 7.5 },
      }));
      const [record] = h.calls.createAssignment[0];
      assert.equal(record.accessScope, 'SCHEDULES');
      assert.deepEqual(record.allowedScheduleIds, ['aaaaaaaaaaaaaaaaaaaaaaaa']);
      assert.deepEqual(record.permissions, { canCancel: true, cancelWindowMins: 45 });
      assert.deepEqual(record.operatorCommission, { mode: 'PERCENT', value: 7.5 });
    } finally { h.restore(); }
  });

  await t.test('does not read the live status when the insert succeeded', async () => {
    const h = harness();
    try {
      await service.assignAgent(OWNER_ID, validBody());
      assert.equal(h.calls.findLiveAssignmentStatus.length, 0);
    } finally { h.restore(); }
  });
});
