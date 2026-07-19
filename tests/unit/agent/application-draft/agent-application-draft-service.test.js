'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const service = require('../../../../src/modules/agent/application-draft/agent-application-draft.service');
const repository = require('../../../../src/modules/agent/application-draft/agent-application-draft.repository');
const updater = require('../../../../src/modules/agent/application-draft/draft-updater');

const stub = (obj, key, fn) => { const orig = obj[key]; obj[key] = fn; return () => { obj[key] = orig; }; };
const noSave = () => stub(repository, 'saveAgent', async () => {});
const noUpdate = () => stub(updater, 'updateDraftFields', () => {});

test('agent application draft service', async (t) => {
    await t.test('repository lookup uses user ID', async () => {
        const calls = [];
        const userId = crypto.randomBytes(12).toString('hex');
        const fakeAgent = { applicationStatus: 'DRAFT', agentId: 'AG-001' };
        const r1 = stub(repository, 'findAgentByUserId', async (id) => { calls.push(id); return fakeAgent; });
        const r2 = noSave(); const r3 = noUpdate();
        try { await service.processDraftSave(userId, {}); assert.deepEqual(calls, [userId]); }
        finally { r1(); r2(); r3(); }
    });

    await t.test('creates new agent when none exists', async () => {
        const userId = crypto.randomBytes(12).toString('hex');
        let createdForUserId = null;
        const fakeNew = { applicationStatus: 'DRAFT', agentId: 'AG-NEW' };
        const r1 = stub(repository, 'findAgentByUserId', async () => null);
        const r2 = stub(repository, 'createAgentForUserId', (id) => { createdForUserId = id; return fakeNew; });
        const r3 = noSave(); const r4 = noUpdate();
        try { await service.processDraftSave(userId, {}); assert.equal(createdForUserId, userId); }
        finally { r1(); r2(); r3(); r4(); }
    });

    await t.test('allows DRAFT status', async () => {
        const agentId = `AG-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        const r1 = stub(repository, 'findAgentByUserId', async () => ({ applicationStatus: 'DRAFT', agentId }));
        const r2 = noSave(); const r3 = noUpdate();
        try { const result = await service.processDraftSave('u1', {}); assert.equal(result.success, true); }
        finally { r1(); r2(); r3(); }
    });

    await t.test('allows MORE_INFO status', async () => {
        const agentId = `AG-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        const r1 = stub(repository, 'findAgentByUserId', async () => ({ applicationStatus: 'MORE_INFO', agentId }));
        const r2 = noSave(); const r3 = noUpdate();
        try { const result = await service.processDraftSave('u1', {}); assert.equal(result.success, true); }
        finally { r1(); r2(); r3(); }
    });

    for (const status of ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']) {
        await t.test(`rejects ${status} status`, async () => {
            const r1 = stub(repository, 'findAgentByUserId', async () => ({ applicationStatus: status, agentId: 'AG-X' }));
            try {
                const result = await service.processDraftSave('u1', { district: 'Ktm' });
                assert.equal(result.success, false);
                assert.equal(result.status, 400);
                assert.equal(result.message, `Application cannot be edited in "${status}" status.`);
            } finally { r1(); }
        });
    }

    await t.test('rejected status does not call updater or save', async () => {
        let updaterCalled = false; let saveCalled = false;
        const r1 = stub(repository, 'findAgentByUserId', async () => ({ applicationStatus: 'PENDING', agentId: 'AG-X' }));
        const r2 = stub(repository, 'saveAgent', async () => { saveCalled = true; });
        const r3 = stub(updater, 'updateDraftFields', () => { updaterCalled = true; });
        try { await service.processDraftSave('u1', { district: 'Ktm' }); assert.equal(updaterCalled, false); assert.equal(saveCalled, false); }
        finally { r1(); r2(); r3(); }
    });

    await t.test('valid save calls updater once with agent and payload', async () => {
        const updaterCalls = [];
        const fakeAgent = { applicationStatus: 'DRAFT', agentId: 'AG-001' };
        const payload = { district: 'Pokhara' };
        const r1 = stub(repository, 'findAgentByUserId', async () => fakeAgent);
        const r2 = noSave();
        const r3 = stub(updater, 'updateDraftFields', (a, p) => { updaterCalls.push([a, p]); });
        try { await service.processDraftSave('u1', payload); assert.equal(updaterCalls.length, 1); assert.equal(updaterCalls[0][0], fakeAgent); assert.equal(updaterCalls[0][1], payload); }
        finally { r1(); r2(); r3(); }
    });

    await t.test('valid save calls repository.saveAgent once', async () => {
        const saveCalls = [];
        const fakeAgent = { applicationStatus: 'DRAFT', agentId: 'AG-001' };
        const r1 = stub(repository, 'findAgentByUserId', async () => fakeAgent);
        const r2 = stub(repository, 'saveAgent', async (agent) => { saveCalls.push(agent); });
        const r3 = noUpdate();
        try { await service.processDraftSave('u1', {}); assert.equal(saveCalls.length, 1); assert.equal(saveCalls[0], fakeAgent); }
        finally { r1(); r2(); r3(); }
    });

    await t.test('returned success shape is exact', async () => {
        const agentId = `SHV-AG-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const r1 = stub(repository, 'findAgentByUserId', async () => ({ applicationStatus: 'DRAFT', agentId }));
        const r2 = noSave(); const r3 = noUpdate();
        try {
            const result = await service.processDraftSave('u1', {});
            assert.equal(result.success, true); assert.equal(result.status, 200);
            assert.equal(result.message, 'Application draft saved.');
            assert.deepEqual(result.data, { agentId, applicationStatus: 'DRAFT' });
            assert.equal(result.agentId, agentId);
        } finally { r1(); r2(); r3(); }
    });

    await t.test('returned reject shape is exact', async () => {
        const r1 = stub(repository, 'findAgentByUserId', async () => ({ applicationStatus: 'APPROVED', agentId: 'AG-X' }));
        try {
            const result = await service.processDraftSave('u1', {});
            assert.deepEqual(result, { success: false, status: 400, message: 'Application cannot be edited in "APPROVED" status.' });
        } finally { r1(); }
    });
});
