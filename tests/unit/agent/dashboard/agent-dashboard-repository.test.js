'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const Agent = require('../../../../models/agentModel');
const repository = require('../../../../src/modules/agent/dashboard/agent-dashboard.repository');

test('agent dashboard repository uses exact read-only query and lean', async () => {
  const original = Agent.findOne;
  const calls = [];
  Agent.findOne = (filter) => {
    calls.push(['findOne', filter]);
    return {
      lean: () => {
        calls.push(['lean']);
        return Promise.resolve({ ok: true });
      },
    };
  };
  try {
    const result = await repository.findDashboardAgent('user-1');
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(calls, [
      ['findOne', { user: 'user-1' }],
      ['lean'],
    ]);
  } finally {
    Agent.findOne = original;
  }
});
