'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// Must be the first require: the helper patches the SMS handler into the require
// cache before it loads the service under test.
const {
  OWNER_ID, harness, service, smsCalls, validBody,
} = require('../../helpers/agent-invite-harness');

/** The temp password as the agent receives it — from the SMS, the only copy. */
const smsTempPassword = () => smsCalls[0][1].match(/Temp Password: ([A-F0-9]+)/)[1]; // ggignore

test('operator agent create — happy path', async (t) => {
  await t.test('creates an invited user, an agent, and returns the code', async () => {
    const h = harness();
    try {
      const result = await service.createAgent(OWNER_ID, validBody);
      assert.equal(result.statusCode, 200);
      assert.equal(result.responseBody.data.agentCode, 'SM-AG-7K4QP2X');
      assert.equal(result.responseBody.data.isUpgrade, false);
      assert.equal(result.responseBody.data.smsSent, true);

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

  await t.test('sends the temp password by SMS and never returns it', async () => {
    const h = harness();
    try {
      const result = await service.createAgent(OWNER_ID, validBody);
      assert.equal(smsCalls.length, 1);
      assert.equal(smsCalls[0][0], '9800000000');
      // The password in the SMS is the one that was hashed into the User, and it
      // appears nowhere in the HTTP response.
      const tempPassword = smsTempPassword();
      assert.equal(tempPassword.length, 10);
      assert.doesNotMatch(JSON.stringify(result.responseBody), new RegExp(tempPassword));
    } finally { h.restore(); }
  });

  await t.test('hashes the password — the User never holds plaintext', async () => {
    const h = harness();
    try {
      await service.createAgent(OWNER_ID, validBody);
      const stored = h.calls.createUser[0][0].password;
      assert.notEqual(stored, smsTempPassword());
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

test('temp password generation', async (t) => {
  await t.test('is 10 uppercase hex characters', () => {
    for (let i = 0; i < 20; i += 1) {
      assert.match(service.generateTempPassword(), /^[0-9A-F]{10}$/);
    }
  });

  await t.test('does not repeat', () => {
    const seen = new Set();
    for (let i = 0; i < 200; i += 1) seen.add(service.generateTempPassword());
    assert.equal(seen.size, 200);
  });
});
