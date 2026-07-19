'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const service = require('../../../../src/modules/agent/application-document-upload/agent-application-document-upload.service');
const repository = require('../../../../src/modules/agent/application-document-upload/agent-application-document-upload.repository');
const storage = require('../../../../src/modules/agent/application-document-upload/document-storage.service');

const stub = (obj, key, fn) => { const orig = obj[key]; obj[key] = fn; return () => { obj[key] = orig; }; };
const fakeAgent = (overrides) => ({ _id: { toString: () => 'oid-123' }, agentId: 'SHV-AG-001', applicationStatus: 'DRAFT', documents: [], ...overrides });
const fakeStorage = () => {
    const r1 = stub(storage, 'processAndUpload', async () => ({ processed: { wasCompressed: false, originalSize: 500, size: 500 }, fileKey: 'agents/oid/kyc/pan-card/file' }));
    const r2 = stub(storage, 'getPreviewUrl', async () => 'https://preview');
    const r3 = stub(storage, 'deleteOldFile', () => {});
    return () => { r1(); r2(); r3(); };
};

test('agent application document upload service: success paths', async (t) => {
    await t.test('valid upload calls processAndUpload with file, agent._id, and documentType', async () => {
        const calls = [];
        const agent = fakeAgent();
        const r1 = stub(repository, 'findAgentByUserId', async () => agent);
        const r2 = stub(storage, 'processAndUpload', async (file, agentObjectId, docType) => { calls.push({ file, agentObjectId, docType }); return { processed: { wasCompressed: false, originalSize: 100, size: 100 }, fileKey: 'k1' }; });
        const r3 = stub(storage, 'getPreviewUrl', async () => 'p');
        const r4 = stub(repository, 'saveAgent', async () => {});
        const fakeFile = { data: Buffer.from('x') };
        try {
            await service.processDocumentUpload('u1', 'pan_card', fakeFile);
            assert.equal(calls.length, 1);
            assert.equal(calls[0].file, fakeFile);
            assert.equal(calls[0].agentObjectId, agent._id);
            assert.equal(calls[0].docType, 'pan_card');
        } finally { r1(); r2(); r3(); r4(); }
    });

    await t.test('new document type is pushed to documents array', async () => {
        const agent = fakeAgent({ documents: [] });
        const r1 = stub(repository, 'findAgentByUserId', async () => agent);
        const restoreStorage = fakeStorage();
        const r2 = stub(repository, 'saveAgent', async () => {});
        try {
            await service.processDocumentUpload('u1', 'pan_card', {});
            assert.equal(agent.documents.length, 1);
            assert.equal(agent.documents[0].type, 'pan_card');
            assert.equal(agent.documents[0].fileKey, 'agents/oid/kyc/pan-card/file');
            assert.ok(agent.documents[0].uploadedAt instanceof Date);
        } finally { r1(); restoreStorage(); r2(); }
    });

    await t.test('existing document type is replaced with full verification reset', async () => {
        const agent = fakeAgent({ documents: [{ type: 'pan_card', fileKey: 'old-key', verified: true, verifiedBy: 'admin', verifiedAt: new Date(), rejectionReason: 'bad' }] });
        const r1 = stub(repository, 'findAgentByUserId', async () => agent);
        const restoreStorage = fakeStorage();
        const r2 = stub(repository, 'saveAgent', async () => {});
        try {
            await service.processDocumentUpload('u1', 'pan_card', {});
            assert.equal(agent.documents.length, 1);
            const doc = agent.documents[0];
            assert.equal(doc.verified, false);
            assert.equal(doc.verifiedBy, null);
            assert.equal(doc.verifiedAt, null);
            assert.equal(doc.rejectionReason, null);
        } finally { r1(); restoreStorage(); r2(); }
    });

    await t.test('old fileKey is passed to deleteOldFile when replacing', async () => {
        const deleteCalls = [];
        const agent = fakeAgent({ documents: [{ type: 'pan_card', fileKey: 'old-key' }] });
        const r1 = stub(repository, 'findAgentByUserId', async () => agent);
        const r2 = stub(storage, 'processAndUpload', async () => ({ processed: { wasCompressed: false, originalSize: 100, size: 100 }, fileKey: 'new-key' }));
        const r3 = stub(storage, 'deleteOldFile', (key) => deleteCalls.push(key));
        const r4 = stub(storage, 'getPreviewUrl', async () => 'p');
        const r5 = stub(repository, 'saveAgent', async () => {});
        try {
            await service.processDocumentUpload('u1', 'pan_card', {});
            assert.deepEqual(deleteCalls, ['old-key']);
        } finally { r1(); r2(); r3(); r4(); r5(); }
    });

    await t.test('deleteOldFile is NOT called when pushing new document', async () => {
        let called = false;
        const agent = fakeAgent({ documents: [] });
        const r1 = stub(repository, 'findAgentByUserId', async () => agent);
        const restoreStorage = fakeStorage();
        const r2 = stub(storage, 'deleteOldFile', () => { called = true; });
        const r3 = stub(repository, 'saveAgent', async () => {});
        try {
            await service.processDocumentUpload('u1', 'pan_card', {});
            assert.equal(called, false);
        } finally { r1(); restoreStorage(); r2(); r3(); }
    });

    await t.test('saveAgent is called exactly once on valid upload', async () => {
        const saveCalls = [];
        const agent = fakeAgent();
        const r1 = stub(repository, 'findAgentByUserId', async () => agent);
        const restoreStorage = fakeStorage();
        const r2 = stub(repository, 'saveAgent', async (a) => saveCalls.push(a));
        try {
            await service.processDocumentUpload('u1', 'pan_card', {});
            assert.equal(saveCalls.length, 1);
            assert.equal(saveCalls[0], agent);
        } finally { r1(); restoreStorage(); r2(); }
    });

    await t.test('success response shape is exact', async () => {
        const agent = fakeAgent();
        const r1 = stub(repository, 'findAgentByUserId', async () => agent);
        const restoreStorage = fakeStorage();
        const r2 = stub(repository, 'saveAgent', async () => {});
        try {
            const result = await service.processDocumentUpload('u1', 'pan_card', {});
            assert.equal(result.success, true);
            assert.equal(result.status, 200);
            assert.equal(result.message, 'pan_card uploaded successfully.');
            assert.equal(result.data.documentType, 'pan_card');
            assert.equal(result.data.previewUrl, 'https://preview');
            assert.equal(result.data.wasCompressed, false);
            assert.equal(result.agentId, 'SHV-AG-001');
        } finally { r1(); restoreStorage(); r2(); }
    });
});
