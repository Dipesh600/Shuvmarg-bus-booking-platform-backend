'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const controller = require('../../../../src/modules/agent/application-document-upload/agent-application-document-upload.controller');
const service = require('../../../../src/modules/agent/application-document-upload/agent-application-document-upload.service');
const logger = require('../../../../utils/logger');

const makeRes = () => {
    const res = { statusCode: null, body: null };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (body) => { res.body = body; return res; };
    return res;
};
const stub = (obj, key, fn) => { const orig = obj[key]; obj[key] = fn; return () => { obj[key] = orig; }; };

test('agent application document upload controller', async (t) => {
    await t.test('missing req.userInfo returns 401', async () => {
        const res = makeRes();
        await controller.uploadDocument({ userInfo: undefined, body: {}, files: {} }, res, assert.fail);
        assert.equal(res.statusCode, 401);
        assert.deepEqual(res.body, { success: false, message: 'Unauthorized.' });
    });

    await t.test('missing id inside userInfo returns 401', async () => {
        const res = makeRes();
        await controller.uploadDocument({ userInfo: {}, body: {}, files: {} }, res, assert.fail);
        assert.equal(res.statusCode, 401);
        assert.deepEqual(res.body, { success: false, message: 'Unauthorized.' });
    });

    await t.test('service failure result returns exact status and message', async () => {
        const userId = crypto.randomBytes(12).toString('hex');
        const r = stub(service, 'processDocumentUpload', async () => ({
            success: false, status: 404, message: 'Start your application first before uploading documents.',
        }));
        try {
            const res = makeRes();
            await controller.uploadDocument({ userInfo: { id: userId }, body: { documentType: 'pan_card' }, files: {} }, res, assert.fail);
            assert.equal(res.statusCode, 404);
            assert.deepEqual(res.body, { success: false, message: 'Start your application first before uploading documents.' });
        } finally { r(); }
    });

    await t.test('success path logs exact metadata', async () => {
        const userId = crypto.randomBytes(12).toString('hex');
        const agentId = `SHV-AG-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const logs = [];
        const r1 = stub(service, 'processDocumentUpload', async () => ({
            success: true, status: 200,
            message: 'pan_card uploaded successfully.',
            data: { documentType: 'pan_card', previewUrl: 'https://x', wasCompressed: false, originalSize: 100, compressedSize: 100 },
            agentId, wasCompressed: false, originalSize: 100, compressedSize: 100,
        }));
        const r2 = stub(logger, 'info', (...args) => logs.push(args));
        try {
            const res = makeRes();
            await controller.uploadDocument({ userInfo: { id: userId }, body: { documentType: 'pan_card' }, files: { file: {} } }, res, assert.fail);
            assert.deepEqual(logs, [['agent: document uploaded', {
                userId, agentId, documentType: 'pan_card',
                wasCompressed: false, originalSize: 100, compressedSize: 100,
            }]]);
        } finally { r1(); r2(); }
    });

    await t.test('success path returns exact 200 response shape', async () => {
        const userId = crypto.randomBytes(12).toString('hex');
        const agentId = `SHV-AG-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const data = { documentType: 'pan_card', previewUrl: 'https://x', wasCompressed: false, originalSize: 100, compressedSize: 100 };
        const r = stub(service, 'processDocumentUpload', async () => ({
            success: true, status: 200, message: 'pan_card uploaded successfully.', data, agentId,
            wasCompressed: false, originalSize: 100, compressedSize: 100,
        }));
        try {
            const res = makeRes();
            await controller.uploadDocument({ userInfo: { id: userId }, body: { documentType: 'pan_card' }, files: {} }, res, assert.fail);
            assert.equal(res.statusCode, 200);
            assert.deepEqual(res.body, { success: true, message: 'pan_card uploaded successfully.', data });
        } finally { r(); }
    });

    await t.test('file validation error (Invalid file type) returns 400', async () => {
        const userId = crypto.randomBytes(12).toString('hex');
        const r = stub(service, 'processDocumentUpload', async () => { throw new Error('Invalid file type: image/bmp'); });
        try {
            const res = makeRes();
            await controller.uploadDocument({ userInfo: { id: userId }, body: { documentType: 'pan_card' }, files: {} }, res, assert.fail);
            assert.equal(res.statusCode, 400);
            assert.deepEqual(res.body, { success: false, message: 'Invalid file type: image/bmp' });
        } finally { r(); }
    });

    await t.test('file validation error (File too large) returns 400', async () => {
        const userId = crypto.randomBytes(12).toString('hex');
        const r = stub(service, 'processDocumentUpload', async () => { throw new Error('File too large. Maximum allowed.'); });
        try {
            const res = makeRes();
            await controller.uploadDocument({ userInfo: { id: userId }, body: { documentType: 'pan_card' }, files: {} }, res, assert.fail);
            assert.equal(res.statusCode, 400);
            assert.deepEqual(res.body, { success: false, message: 'File too large. Maximum allowed.' });
        } finally { r(); }
    });

    await t.test('unexpected error logs exact metadata and returns 500', async () => {
        const userId = crypto.randomBytes(12).toString('hex');
        const logs = [];
        const r1 = stub(service, 'processDocumentUpload', async () => { throw new Error('db crash'); });
        const r2 = stub(logger, 'error', (...args) => logs.push(args));
        try {
            const res = makeRes();
            await controller.uploadDocument({ userInfo: { id: userId }, body: { documentType: 'pan_card' }, files: {} }, res, assert.fail);
            assert.equal(res.statusCode, 500);
            assert.deepEqual(res.body, { success: false, message: 'Internal Server Error' });
            assert.deepEqual(logs, [['agent: uploadDocument error', { error: 'db crash' }]]);
        } finally { r1(); r2(); }
    });
});
