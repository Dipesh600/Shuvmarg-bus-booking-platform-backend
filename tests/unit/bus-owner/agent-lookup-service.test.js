'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const repository = require('../../../src/modules/bus-owner/agent-lookup/bus-owner-agent-lookup.repository');
const service = require('../../../src/modules/bus-owner/agent-lookup/bus-owner-agent-lookup.service');

const VALID_CODE = 'SM-AG-MAVSKNF';
const LEGACY_ID = 'SHV-AG-KTM-001';

const storedAgent = (over = {}) => ({
  code: VALID_CODE,
  agentId: LEGACY_ID,
  scope: 'OPERATOR',
  applicationStatus: 'DRAFT',
  outletType: 'TRAVEL_AGENCY',
  businessName: 'Himalaya Travels',
  district: 'Kathmandu',
  municipality: 'Kathmandu Metropolitan City',
  user: { name: 'Ram Bahadur', phoneVerified: true },
  ...over,
});

/** Patches the one repository call, recording the filter it was handed. */
const withAgent = (agent) => {
  const original = repository.findAgentByCodeFilter;
  const calls = [];
  repository.findAgentByCodeFilter = async (filter) => {
    calls.push(filter);
    return typeof agent === 'function' ? agent(filter) : agent;
  };
  return { calls, restore: () => { repository.findAgentByCodeFilter = original; } };
};

const rejects = async (promise, statusCode, errorCode) => {
  await assert.rejects(promise, (error) => {
    assert.equal(error.statusCode, statusCode);
    assert.equal(error.responseBody.errorCode, errorCode);
    return true;
  });
};

test('agent lookup — found', async (t) => {
  await t.test('returns the preview for an operator-scope agent', async () => {
    const h = withAgent(storedAgent());
    try {
      const result = await service.lookupAgentByCode(VALID_CODE);
      assert.equal(result.statusCode, 200);
      assert.equal(result.responseBody.success, true);
      assert.equal(result.responseBody.data.agentCode, VALID_CODE);
      assert.equal(result.responseBody.data.name, 'Ram Bahadur');
      assert.equal(result.responseBody.data.canBeAssigned, true);
    } finally { h.restore(); }
  });

  await t.test('queries on the canonical code, whatever the operator typed', async () => {
    const h = withAgent(storedAgent());
    try {
      await service.lookupAgentByCode(`  ${VALID_CODE.toLowerCase()} `);
      assert.deepEqual(h.calls, [{ code: VALID_CODE }]);
    } finally { h.restore(); }
  });

  await t.test('finds an agent by their legacy id', async () => {
    const h = withAgent(storedAgent({ code: null }));
    try {
      const result = await service.lookupAgentByCode(LEGACY_ID);
      assert.deepEqual(h.calls, [{ agentId: LEGACY_ID }]);
      // displayAgentCode falls back to the legacy id when there is no new code.
      assert.equal(result.responseBody.data.agentCode, LEGACY_ID);
    } finally { h.restore(); }
  });

  await t.test('shows the status the agent earned, not the one on the row', async () => {
    // The requirement this endpoint exists to satisfy: the row still says DRAFT
    // because nothing has recomputed it, but the agent has a verified phone and
    // their outlet details on file.
    const h = withAgent(storedAgent({ applicationStatus: 'DRAFT' }));
    try {
      const { data } = (await service.lookupAgentByCode(VALID_CODE)).responseBody;
      assert.equal(data.kycStatus, 'VERIFIED_BASIC');
      assert.equal(data.isVerified, true);
    } finally { h.restore(); }
  });

  await t.test('reports an unverified agent honestly rather than refusing', async () => {
    const h = withAgent(storedAgent({ user: { name: 'Ram', phoneVerified: false } }));
    try {
      const { data } = (await service.lookupAgentByCode(VALID_CODE)).responseBody;
      assert.equal(data.kycStatus, 'DRAFT');
      assert.equal(data.isVerified, false);
      // Still assignable: the operator may invite them now and the agent
      // finishes verifying before they sell.
      assert.equal(data.canBeAssigned, true);
    } finally { h.restore(); }
  });
});

test('agent lookup — refusals', async (t) => {
  await t.test('404s an unknown code', async () => {
    const h = withAgent(null);
    try {
      await rejects(service.lookupAgentByCode(VALID_CODE), 404, 'AGENT_CODE_NOT_FOUND');
    } finally { h.restore(); }
  });

  await t.test('404s a malformed code without touching the database', async () => {
    const h = withAgent(storedAgent());
    try {
      await rejects(service.lookupAgentByCode('nonsense'), 404, 'AGENT_CODE_NOT_FOUND');
      await rejects(service.lookupAgentByCode(undefined), 404, 'AGENT_CODE_NOT_FOUND');
      await rejects(service.lookupAgentByCode({ $ne: null }), 404, 'AGENT_CODE_NOT_FOUND');
      assert.deepEqual(h.calls, [], 'no query may be issued for input that cannot be a code');
    } finally { h.restore(); }
  });

  await t.test('gives the same answer for malformed and unknown codes', async () => {
    const missing = withAgent(null);
    let unknownBody;
    try {
      await service.lookupAgentByCode(VALID_CODE).catch((e) => { unknownBody = e.responseBody; });
    } finally { missing.restore(); }

    const present = withAgent(storedAgent());
    let malformedBody;
    try {
      await service.lookupAgentByCode('nope').catch((e) => { malformedBody = e.responseBody; });
    } finally { present.restore(); }

    assert.deepEqual(malformedBody, unknownBody);
  });

  await t.test('409s a platform-scope agent (master plan D7)', async () => {
    const h = withAgent(storedAgent({ scope: 'PLATFORM', applicationStatus: 'APPROVED' }));
    try {
      await rejects(service.lookupAgentByCode(VALID_CODE), 409, 'AGENT_NOT_ASSIGNABLE');
    } finally { h.restore(); }
  });

  await t.test('accepts a legacy OPERATOR_LINKED agent', async () => {
    const h = withAgent({ code: VALID_CODE, agentType: 'OPERATOR_LINKED', applicationStatus: 'APPROVED' });
    try {
      const result = await service.lookupAgentByCode(VALID_CODE);
      assert.equal(result.statusCode, 200);
      assert.equal(result.responseBody.data.isVerified, true);
    } finally { h.restore(); }
  });
});
