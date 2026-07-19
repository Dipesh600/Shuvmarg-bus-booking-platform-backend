'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const service = require('../../../../src/modules/agent/application-document-upload/agent-application-document-upload.service');
const repository = require('../../../../src/modules/agent/application-document-upload/agent-application-document-upload.repository');
const storage = require('../../../../src/modules/agent/application-document-upload/document-storage.service');

const stub = (obj, key, fn) => { const orig = obj[key]; obj[key] = fn; return () => { obj[key] = orig; }; };
const fakeAgent = (overrides) => ({ _id: { toString: () => 'oid-123' }, agentId: 'SHV-AG-001', applicationStatus: 'DRAFT', documents: [], ...overrides });

test('agent application document upload service: rejection paths', async (t) => {
    await t.test('returns 404 when no agent found', async () => {
        const r = stub(repository, 'findAgentByUserId', async () => null);
        try {
            const result = await service.processDocumentUpload('u1', 'pan_card', {});
            assert.deepEqual(result, { success: false, status: 404, message: 'Start your application first before uploading documents.' });
        } finally { r(); }
    });

    await t.test('findAgentByUserId is called with userId', async () => {
        const calls = [];
        const userId = crypto.randomBytes(12).toString('hex');
        const r = stub(repository, 'findAgentByUserId', async (id) => { calls.push(id); return null; });
        try { await service.processDocumentUpload(userId, 'pan_card', {}); assert.deepEqual(calls, [userId]); }
        finally { r(); }
    });

    for (const status of ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']) {
        await t.test(`returns 400 for status ${status}`, async () => {
            const r = stub(repository, 'findAgentByUserId', async () => fakeAgent({ applicationStatus: status }));
            try {
                const result = await service.processDocumentUpload('u1', 'pan_card', {});
                assert.deepEqual(result, { success: false, status: 400, message: `Cannot upload documents in "${status}" status.` });
            } finally { r(); }
        });
    }

    await t.test('returns 400 for invalid documentType', async () => {
        const r = stub(repository, 'findAgentByUserId', async () => fakeAgent());
        try {
            const result = await service.processDocumentUpload('u1', 'invalid_type', {});
            assert.equal(result.success, false); assert.equal(result.status, 400);
            assert.match(result.message, /Invalid document type/);
        } finally { r(); }
    });

    await t.test('returns 400 for missing documentType', async () => {
        const r = stub(repository, 'findAgentByUserId', async () => fakeAgent());
        try {
            const result = await service.processDocumentUpload('u1', undefined, {});
            assert.equal(result.success, false); assert.equal(result.status, 400);
        } finally { r(); }
    });

    await t.test('returns 400 for missing file', async () => {
        const r = stub(repository, 'findAgentByUserId', async () => fakeAgent());
        try {
            const result = await service.processDocumentUpload('u1', 'pan_card', null);
            assert.deepEqual(result, { success: false, status: 400, message: "No file provided. Send file in 'file' field." });
        } finally { r(); }
    });

    await t.test('rejected requests do not call processAndUpload', async () => {
        let called = false;
        const r1 = stub(repository, 'findAgentByUserId', async () => fakeAgent({ applicationStatus: 'PENDING' }));
        const r2 = stub(storage, 'processAndUpload', async () => { called = true; });
        try { await service.processDocumentUpload('u1', 'pan_card', {}); assert.equal(called, false); }
        finally { r1(); r2(); }
    });

    await t.test('rejected requests do not call saveAgent', async () => {
        let called = false;
        const r1 = stub(repository, 'findAgentByUserId', async () => null);
        const r2 = stub(repository, 'saveAgent', async () => { called = true; });
        try { await service.processDocumentUpload('u1', 'pan_card', {}); assert.equal(called, false); }
        finally { r1(); r2(); }
    });
});
