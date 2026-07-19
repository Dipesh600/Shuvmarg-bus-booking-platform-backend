'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const controller = require('../../../../src/modules/agent/application-draft/agent-application-draft.controller');
const service = require('../../../../src/modules/agent/application-draft/agent-application-draft.service');
const logger = require('../../../../utils/logger');

const makeRes = () => {
    const res = { statusCode: null, body: null };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (body) => { res.body = body; return res; };
    return res;
};

test('agent application draft controller', async (t) => {
    await t.test('missing req.userInfo?.id returns 401 Unauthorized', async () => {
        const res = makeRes();
        await controller.saveApplicationDraft({ userInfo: undefined, body: {} }, res, assert.fail);
        assert.equal(res.statusCode, 401);
        assert.deepEqual(res.body, { success: false, message: 'Unauthorized.' });
    });

    await t.test('missing id inside userInfo returns 401 Unauthorized', async () => {
        const res = makeRes();
        await controller.saveApplicationDraft({ userInfo: { role: 'agent' }, body: {} }, res, assert.fail);
        assert.equal(res.statusCode, 401);
        assert.deepEqual(res.body, { success: false, message: 'Unauthorized.' });
    });

    await t.test('successful service result returns 200 with exact shape', async () => {
        const original = service.processDraftSave;
        const userId = crypto.randomBytes(12).toString('hex');
        const agentId = `SHV-AG-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        service.processDraftSave = async () => ({
            success: true,
            status: 200,
            message: 'Application draft saved.',
            data: { agentId, applicationStatus: 'DRAFT' },
            agentId,
        });
        try {
            const res = makeRes();
            await controller.saveApplicationDraft(
                { userInfo: { id: userId }, body: { district: 'Ktm' } },
                res,
                assert.fail,
            );
            assert.equal(res.statusCode, 200);
            assert.deepEqual(res.body, {
                success: true,
                message: 'Application draft saved.',
                data: { agentId, applicationStatus: 'DRAFT' },
            });
        } finally {
            service.processDraftSave = original;
        }
    });

    await t.test('success path logs exact metadata', async () => {
        const originalService = service.processDraftSave;
        const originalLogger = logger.info;
        const userId = crypto.randomBytes(12).toString('hex');
        const agentId = `SHV-AG-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const logs = [];
        service.processDraftSave = async () => ({
            success: true,
            status: 200,
            message: 'Application draft saved.',
            data: { agentId, applicationStatus: 'DRAFT' },
            agentId,
        });
        logger.info = (...args) => logs.push(args);
        try {
            const res = makeRes();
            await controller.saveApplicationDraft({ userInfo: { id: userId }, body: {} }, res, assert.fail);
            assert.deepEqual(logs, [['agent: draft saved', { userId, agentId }]]);
        } finally {
            service.processDraftSave = originalService;
            logger.info = originalLogger;
        }
    });

    await t.test('rejected service result returns exact status and message', async () => {
        const original = service.processDraftSave;
        const userId = crypto.randomBytes(12).toString('hex');
        service.processDraftSave = async () => ({
            success: false,
            status: 400,
            message: 'Application cannot be edited in "PENDING" status.',
        });
        try {
            const res = makeRes();
            await controller.saveApplicationDraft({ userInfo: { id: userId }, body: {} }, res, assert.fail);
            assert.equal(res.statusCode, 400);
            assert.deepEqual(res.body, {
                success: false,
                message: 'Application cannot be edited in "PENDING" status.',
            });
        } finally {
            service.processDraftSave = original;
        }
    });

    await t.test('error path logs exact metadata and returns 500', async () => {
        const originalService = service.processDraftSave;
        const originalLogger = logger.error;
        const userId = crypto.randomBytes(12).toString('hex');
        const logs = [];
        service.processDraftSave = async () => { throw new Error('db failure'); };
        logger.error = (...args) => logs.push(args);
        try {
            const res = makeRes();
            await controller.saveApplicationDraft({ userInfo: { id: userId }, body: {} }, res, assert.fail);
            assert.equal(res.statusCode, 500);
            assert.deepEqual(res.body, { success: false, message: 'Internal Server Error' });
            assert.deepEqual(logs, [['agent: saveApplicationDraft error', { error: 'db failure' }]]);
        } finally {
            service.processDraftSave = originalService;
            logger.error = originalLogger;
        }
    });
});
