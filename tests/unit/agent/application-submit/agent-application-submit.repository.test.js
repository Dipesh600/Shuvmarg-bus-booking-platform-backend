'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const repository = require('../../../../src/modules/agent/application-submit/agent-application-submit.repository');
const Agent = require('../../../../models/agentModel');

test('agent-application-submit.repository', async (t) => {
    t.afterEach(() => {
        Agent.findOne = undefined;
    });

    await t.test('findAgentByUserId finds by user field', async () => {
        let query;
        Agent.findOne = async (q) => { query = q; return { _id: 'agent1' }; };
        
        const res = await repository.findAgentByUserId('user1');
        assert.deepEqual(query, { user: 'user1' });
        assert.equal(res._id, 'agent1');
    });

    await t.test('saveAgent calls save on the document', async () => {
        let saved = false;
        const mockAgent = { save: async () => { saved = true; } };
        
        await repository.saveAgent(mockAgent);
        assert.equal(saved, true);
    });
});
