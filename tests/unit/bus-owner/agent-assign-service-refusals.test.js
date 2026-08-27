'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  BRAND_ID, OWNER_ID, VALID_CODE,
  harness, rejects, service, storedAgent, validBody,
} = require('../../helpers/agent-assign-harness');

test('operator agent assign — refusals', async (t) => {
  await t.test('400 on invalid input, with no query at all', async () => {
    const h = harness();
    try {
      await rejects(service.assignAgent(OWNER_ID, { agentCode: VALID_CODE }), 400);
      assert.equal(h.calls.findOwnedBrand.length, 0);
    } finally { h.restore(); }
  });

  await t.test('403 for a brand the caller does not own, before the agent is read', async () => {
    const h = harness({ findOwnedBrand: () => null });
    try {
      await rejects(service.assignAgent(OWNER_ID, validBody()), 403);
      // Nothing was read about the agent, so a caller who does not own the brand
      // cannot use this endpoint to learn whether a code exists.
      assert.equal(h.calls.findAgentByCodeFilter.length, 0);
      assert.deepEqual(h.calls.findOwnedBrand[0], [OWNER_ID, BRAND_ID]);
    } finally { h.restore(); }
  });

  await t.test('404 for a malformed code without touching the agent collection', async () => {
    const h = harness();
    try {
      await rejects(service.assignAgent(OWNER_ID, validBody({ agentCode: 'junk' })), 404, 'AGENT_CODE_NOT_FOUND');
      assert.equal(h.calls.findAgentByCodeFilter.length, 0);
      assert.equal(h.calls.createAssignment.length, 0);
    } finally { h.restore(); }
  });

  await t.test('404 when no agent holds the code', async () => {
    const h = harness({ findAgentByCodeFilter: () => null });
    try {
      await rejects(service.assignAgent(OWNER_ID, validBody()), 404, 'AGENT_CODE_NOT_FOUND');
      assert.equal(h.calls.createAssignment.length, 0);
    } finally { h.restore(); }
  });

  await t.test('409 for a platform agent, checked here as well as at lookup', async () => {
    const h = harness({ findAgentByCodeFilter: () => storedAgent({ scope: 'PLATFORM' }) });
    try {
      // An operator can post a code straight here without ever calling the
      // preview, so the scope rule cannot live only in the preview.
      await rejects(service.assignAgent(OWNER_ID, validBody()), 409, 'AGENT_NOT_ASSIGNABLE');
      assert.equal(h.calls.createAssignment.length, 0);
    } finally { h.restore(); }
  });

  await t.test('a legacy agent with no scope field is still assignable', async () => {
    const legacy = storedAgent({ scope: undefined, agentType: 'OPERATOR_LINKED' });
    const h = harness({ findAgentByCodeFilter: () => legacy });
    try {
      const result = await service.assignAgent(OWNER_ID, validBody());
      assert.equal(result.statusCode, 201);
    } finally { h.restore(); }
  });

  await t.test('409 naming the live status when the unique index refuses', async () => {
    const duplicate = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
    const h = harness({ createAssignment: () => { throw duplicate; } });
    try {
      await assert.rejects(service.assignAgent(OWNER_ID, validBody()), (error) => {
        assert.equal(error.statusCode, 409);
        assert.equal(error.responseBody.errorCode, 'ASSIGNMENT_ALREADY_EXISTS');
        assert.equal(error.responseBody.assignmentStatus, 'ACTIVE');
        return true;
      });
      assert.equal(h.calls.findLiveAssignmentStatus.length, 1);
    } finally { h.restore(); }
  });

  await t.test('the 409 still answers when the blocking row cannot be read back', async () => {
    const duplicate = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
    const h = harness({
      createAssignment: () => { throw duplicate; },
      findLiveAssignmentStatus: () => null,
    });
    try {
      await assert.rejects(service.assignAgent(OWNER_ID, validBody()), (error) => {
        assert.equal(error.statusCode, 409);
        assert.equal(error.responseBody.assignmentStatus, null);
        return true;
      });
    } finally { h.restore(); }
  });

  await t.test('400, not 500, when a schema validator rejects the terms', async () => {
    const invalid = Object.assign(new Error('validation failed'), {
      name: 'ValidationError',
      errors: { 'operatorCommission.value': { message: 'commission value is out of range for its mode' } },
    });
    const h = harness({ createAssignment: () => { throw invalid; } });
    try {
      await assert.rejects(service.assignAgent(OWNER_ID, validBody()), (error) => {
        assert.equal(error.statusCode, 400);
        assert.match(error.responseBody.message, /out of range/);
        return true;
      });
    } finally { h.restore(); }
  });

  await t.test('a ValidationError with no details still answers 400 with a message', async () => {
    const invalid = Object.assign(new Error('validation failed'), { name: 'ValidationError' });
    const h = harness({ createAssignment: () => { throw invalid; } });
    try {
      await assert.rejects(service.assignAgent(OWNER_ID, validBody()), (error) => {
        assert.equal(error.statusCode, 400);
        assert.ok(error.responseBody.message, 'a 400 must not carry an undefined message');
        return true;
      });
    } finally { h.restore(); }
  });

  await t.test('an unexpected database error is not dressed up as a 4xx', async () => {
    const h = harness({ createAssignment: () => { throw new Error('connection lost'); } });
    try {
      await assert.rejects(service.assignAgent(OWNER_ID, validBody()), /connection lost/);
    } finally { h.restore(); }
  });
});
