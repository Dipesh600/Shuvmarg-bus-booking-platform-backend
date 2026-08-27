'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// Must be the first require: the helper patches the SMS handler into the require
// cache before it loads the service under test.
const {
  OWNER_ID, harness, service, smsCalls, validBody,
} = require('../../helpers/agent-invite-harness');

/** Someone who already has a Shuvmarg account, without the agent role yet. */
const existingUser = (hasRole) => ({
  checkPhoneForRole: async () => ({ exists: true, hasRole, user: { _id: 'user-1' } }),
});

test('operator agent create — existing account', async (t) => {
  await t.test('adds the agent role instead of creating a second User', async () => {
    const h = harness(existingUser(false));
    try {
      const result = await service.createAgent(OWNER_ID, validBody);
      assert.equal(result.statusCode, 200);
      assert.equal(result.responseBody.data.isUpgrade, true);
      assert.equal(h.calls.addAgentRole.length, 1);
      assert.equal(h.calls.createUser.length, 0);
      assert.equal(h.calls.createAgent.length, 1);
    } finally { h.restore(); }
  });

  await t.test('does not SMS a password to an account that already has one', async () => {
    const h = harness(existingUser(false));
    try {
      const result = await service.createAgent(OWNER_ID, validBody);
      assert.equal(smsCalls.length, 0);
      assert.equal(result.responseBody.data.smsSent, false);
      assert.equal(result.responseBody.data.smsStatus, 'NOT_REQUIRED');
      // Nothing to activate: the account is already the agent's own.
      assert.equal(result.responseBody.data.requiresAgentActivation, false);
    } finally { h.restore(); }
  });

  await t.test('recovers when the role exists but the profile does not', async () => {
    // A previous attempt that died between the two writes must not be a
    // permanent 409 that leaves the agent with no profile.
    const h = harness({ ...existingUser(true), findAgentByUserId: async () => null });
    try {
      const result = await service.createAgent(OWNER_ID, validBody);
      assert.equal(result.statusCode, 200);
      assert.equal(h.calls.createAgent.length, 1);
      assert.equal(h.calls.createUser.length, 0);
    } finally { h.restore(); }
  });
});

test('operator agent create — SMS notification is best effort', async (t) => {
  await t.test('a failed SMS still returns 200 with the code', async () => {
    // The identity is written and has a code. Failing the request would leave a
    // usable agent behind an error, and the owner can read the code and resend.
    const h = harness({ sms: async () => { throw new Error('gateway down'); } });
    try {
      const result = await service.createAgent(OWNER_ID, validBody);
      assert.equal(result.statusCode, 200);
      assert.equal(result.responseBody.data.smsSent, false);
      assert.equal(result.responseBody.data.smsStatus, 'FAILED');
      assert.equal(result.responseBody.data.agentCode, 'SM-AG-7K4QP2X');
      assert.equal(h.calls.createAgent.length, 1);
    } finally { h.restore(); }
  });
});
