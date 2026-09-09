'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// Must be the first require: the helper patches the SMS handler into the require
// cache before it loads the service under test.
const {
  OWNER_ID, harness, service, smsCalls, validBody,
} = require('../../helpers/agent-invite-harness');

test('operator agent create — happy path', async (t) => {
  await t.test('creates an invited user, an agent, and returns the code', async () => {
    const h = harness();
    try {
      const result = await service.createAgent(OWNER_ID, validBody);
      assert.equal(result.statusCode, 200);
      assert.equal(result.responseBody.data.agentCode, 'SM-AG-7K4QP2X');
      assert.equal(result.responseBody.data.isUpgrade, false);
      assert.equal(result.responseBody.data.smsSent, true);
      assert.equal(result.responseBody.data.smsStatus, 'QUEUED');

      assert.equal(h.calls.createUser.length, 1);
      assert.equal(h.calls.createUser[0][0].status, 'invited');
      assert.equal(h.calls.createAgent.length, 1);
      assert.equal(h.calls.createAgent[0][0].scope, 'OPERATOR');
      assert.equal(h.calls.createAgent[0][0].applicationStatus, 'VERIFIED_BASIC');
      assert.equal(h.calls.createAgent[0][0].placeName, 'Kalanki');
    } finally { h.restore(); }
  });

  await t.test('stamps the caller as creator, ignoring any ownerId in the body', async () => {
    const h = harness();
    try {
      await service.createAgent(OWNER_ID, {
        ...validBody,
        createdByOwnerId: '507f1f77bcf86cd799439099',
        ownerId: '507f1f77bcf86cd799439099',
      });
      assert.equal(h.calls.createAgent[0][0].createdByOwnerId, OWNER_ID);
    } finally { h.restore(); }
  });

  await t.test('sends activation instructions without a password', async () => {
    const h = harness();
    try {
      const result = await service.createAgent(OWNER_ID, validBody);
      assert.equal(smsCalls.length, 1);
      assert.equal(smsCalls[0][0], '9800000000');
      assert.match(smsCalls[0][1], /Set up invited account/);
      assert.match(smsCalls[0][1], /verify the SMS code/);
      assert.match(smsCalls[0][1], /create your password/);
      assert.doesNotMatch(smsCalls[0][1], /Temp Password|Login with/i);
      assert.equal(h.calls.enqueueSms.length, 1);
      assert.equal(h.calls.enqueueSms[0][0].messageType, 'AGENT_INVITATION');
      assert.doesNotMatch(JSON.stringify(result.responseBody), /password/i);
    } finally { h.restore(); }
  });

  await t.test('hashes the password — the User never holds plaintext', async () => {
    const h = harness();
    try {
      await service.createAgent(OWNER_ID, validBody);
      const stored = h.calls.createUser[0][0].password;
      assert.match(stored, /^\$2[aby]\$12\$/);
    } finally { h.restore(); }
  });

  await t.test('normalises the phone before writing it', async () => {
    const h = harness();
    try {
      await service.createAgent(OWNER_ID, { ...validBody, phone: '+977 9800000000' });
      assert.equal(h.calls.createUser[0][0].phone, '9800000000');
    } finally { h.restore(); }
  });
});

test('undisclosed bootstrap-secret generation', async (t) => {
  await t.test('is a long random value', () => {
    for (let i = 0; i < 20; i += 1) {
      assert.ok(service.generateBootstrapSecret().length >= 40);
    }
  });

  await t.test('does not repeat', () => {
    const seen = new Set();
    for (let i = 0; i < 200; i += 1) seen.add(service.generateBootstrapSecret());
    assert.equal(seen.size, 200);
  });
});
