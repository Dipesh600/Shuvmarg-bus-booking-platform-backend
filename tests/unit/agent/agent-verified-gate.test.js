'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const Agent = require('../../../models/agentModel.js');
const { KYC_STATUSES } = require('../../../src/shared/identity/agent-enums');
const requireApprovedAgent = require('../../../middleware/requireApprovedAgent.js');

const findOne = Agent.findOne;

/** Runs the middleware against one stubbed Agent row, capturing what it did. */
const run = async (doc, { userId = 'user-1', throws = false } = {}) => {
  let selected = null;
  Agent.findOne = () => {
    if (throws) throw new Error('connection lost');
    return {
      select(fields) { selected = fields; return this; },
      lean: async () => doc,
    };
  };

  const req = { userInfo: userId ? { id: userId } : undefined };
  let statusCode;
  let body;
  let nextCalls = 0;
  const res = {
    status(code) { statusCode = code; return this; },
    json(payload) { body = payload; return this; },
  };

  await requireApprovedAgent(req, res, () => { nextCalls += 1; });
  return { statusCode, body, nextCalls, selected };
};

test('the verified-agent gate', async (t) => {
  t.after(() => { Agent.findOne = findOne; });

  await t.test('an OPERATOR agent at VERIFIED_BASIC is let through', async () => {
    // The bug this middleware existed with: VERIFIED_BASIC is the end of the
    // OPERATOR machine, so under `applicationStatus === "APPROVED"` these agents
    // were locked out of /profile and /dashboard with no way forward.
    const result = await run({ scope: 'OPERATOR', applicationStatus: 'VERIFIED_BASIC' });
    assert.equal(result.nextCalls, 1);
    assert.equal(result.statusCode, undefined);
  });

  await t.test('the projection carries what decides the answer', async () => {
    // Without `scope`/`agentType` every agent resolves to PLATFORM, which demands
    // APPROVED — the fix above would read as correct and change nothing.
    const result = await run({ scope: 'OPERATOR', applicationStatus: 'VERIFIED_BASIC' });
    assert.match(result.selected, /\bscope\b/);
    assert.match(result.selected, /\bagentType\b/);
    assert.match(result.selected, /\bapplicationStatus\b/);
  });

  await t.test('a legacy OPERATOR_LINKED agent at APPROVED keeps its access', async () => {
    // Monotonicity: the new rule may only ever grant more than the old one. These
    // rows are written by the admin setup wizard and reach /profile today.
    const result = await run({ agentType: 'OPERATOR_LINKED', applicationStatus: 'APPROVED' });
    assert.equal(result.nextCalls, 1);
  });

  await t.test('a PLATFORM agent at PENDING is refused, errorCode unchanged', async () => {
    const result = await run({ scope: 'PLATFORM', applicationStatus: 'PENDING' });
    assert.equal(result.nextCalls, 0);
    assert.equal(result.statusCode, 403);
    // Clients branch on this string; the change must not move it.
    assert.equal(result.body.errorCode, 'APPLICATION_NOT_APPROVED');
    assert.equal(result.body.applicationStatus, 'PENDING');
    assert.equal(result.body.success, false);
  });

  await t.test('PHONE_VERIFIED is told what to do, not just denied', async () => {
    const result = await run({ scope: 'OPERATOR', applicationStatus: 'PHONE_VERIFIED' });
    assert.equal(result.statusCode, 403);
    assert.match(result.body.message, /outlet details/i);
  });

  await t.test('every status a refusal can carry has a message', async () => {
    // At PLATFORM scope only APPROVED clears, so every other member is reachable
    // here — including the two OPERATOR statuses, which is the inconsistent-row
    // case that must still say something useful.
    for (const status of Object.values(KYC_STATUSES)) {
      if (status === KYC_STATUSES.APPROVED) continue;
      const result = await run({ scope: 'PLATFORM', applicationStatus: status });
      assert.equal(result.statusCode, 403, status);
      assert.notEqual(result.body.message, 'Access denied.', status);
    }
  });

  await t.test('an agent with no application at all is a distinct refusal', async () => {
    const result = await run(null);
    assert.equal(result.statusCode, 403);
    assert.equal(result.body.errorCode, 'NO_APPLICATION');
    assert.equal(result.body.applicationStatus, null);
  });

  await t.test('a request with no identity is 401, not 403', async () => {
    const result = await run({ applicationStatus: 'APPROVED' }, { userId: null });
    assert.equal(result.statusCode, 401);
    assert.equal(result.nextCalls, 0);
  });

  await t.test('a prototype key is not a status and not a message', async () => {
    const result = await run({ scope: 'OPERATOR', applicationStatus: 'constructor' });
    assert.equal(result.statusCode, 403);
    assert.equal(result.body.message, 'Access denied.');
  });

  await t.test('a database failure is a 500 and never opens the route', async () => {
    const error = console.error;
    console.error = () => {};
    try {
      const result = await run(null, { throws: true });
      assert.equal(result.statusCode, 500);
      assert.equal(result.nextCalls, 0);
      assert.doesNotMatch(JSON.stringify(result.body), /connection lost/);
    } finally { console.error = error; }
  });
});
