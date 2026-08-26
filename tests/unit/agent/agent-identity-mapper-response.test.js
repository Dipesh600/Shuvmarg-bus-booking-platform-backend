'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const mapper = require('../../../src/modules/agent/identity/agent-identity.mapper');
const { agent, user } = require('../../helpers/agent-identity-fixtures');

test('share payload', async (t) => {
  await t.test('prefers the current code', () => {
    assert.equal(mapper.sharePayloadFor(agent()), 'My Shuvmarg agent code is SM-AG-7K4QP2X');
  });

  await t.test('falls back to the legacy id so an old agent can still share', () => {
    assert.equal(
      mapper.sharePayloadFor(agent({ code: null })),
      'My Shuvmarg agent code is SHV-AG-KTM-001',
    );
  });

  await t.test('is null when there is nothing to share, never a broken sentence', () => {
    assert.equal(mapper.sharePayloadFor(agent({ code: null, agentId: null })), null);
  });
});

test('response envelopes', async (t) => {
  await t.test('all three carry success:true and a data block', () => {
    const envelopes = [
      mapper.toIdentityResponse(agent(), user()),
      mapper.toUpdatedIdentityResponse(agent(), user()),
      mapper.toCodeResponse(agent()),
    ];
    for (const envelope of envelopes) {
      assert.equal(envelope.success, true);
      assert.equal(typeof envelope.message, 'string');
      assert.equal(typeof envelope.data, 'object');
    }
  });

  await t.test('the code response is narrow — code, share text, status only', () => {
    const { data } = mapper.toCodeResponse(agent());
    assert.deepEqual(Object.keys(data).sort(), [
      'agentCode', 'kycStatus', 'legacyAgentId', 'scope', 'sharePayload',
    ]);
  });
});
