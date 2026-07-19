'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const Agent = require('../../../../models/agentModel');
const repository = require('../../../../src/modules/agent/profile/agent-profile.repository');

test('agent profile repository uses exact populated lean query', async () => {
  const original = Agent.findOne;
  const userId = crypto.randomBytes(12).toString('hex');
  const calls = [];
  Agent.findOne = (filter) => {
    calls.push(['findOne', filter]);
    return {
      populate: (path, select) => {
        calls.push(['populate', path, select]);
        return {
          lean: () => {
            calls.push(['lean']);
            return Promise.resolve({ ok: true });
          },
        };
      },
    };
  };
  try {
    const result = await repository.findProfileAgent(userId);
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(calls, [
      ['findOne', { user: userId }],
      ['populate', 'linkedOperatorId', 'brandName logo brandCode'],
      ['lean'],
    ]);
  } finally {
    Agent.findOne = original;
  }
});
