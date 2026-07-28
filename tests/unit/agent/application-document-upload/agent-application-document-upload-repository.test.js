'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const Agent = require('../../../../models/agentModel');
const repository = require('../../../../src/modules/agent/application-document-upload/agent-application-document-upload.repository');

test('agent application document upload repository', async (t) => {
    await t.test('findAgentByUserId calls Agent.findOne with { user: userId }', async () => {
        const original = Agent.findOne;
        const userId = crypto.randomBytes(12).toString('hex');
        const calls = [];
        Agent.findOne = (filter) => { calls.push(filter); return Promise.resolve({ agentId: 'AG-FOUND' }); };
        try {
            const result = await repository.findAgentByUserId(userId);
            assert.deepEqual(calls, [{ user: userId }]);
            assert.deepEqual(result, { agentId: 'AG-FOUND' });
        } finally { Agent.findOne = original; }
    });

    await t.test('saveAgent calls agent.save() and returns result', async () => {
        const calls = [];
        const fakeAgent = { save: async () => { calls.push('save'); return fakeAgent; } };
        const result = await repository.saveAgent(fakeAgent);
        assert.deepEqual(calls, ['save']);
        assert.equal(result, fakeAgent);
    });
});
