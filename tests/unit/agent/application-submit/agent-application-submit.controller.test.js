'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const controller = require('../../../../src/modules/agent/application-submit/agent-application-submit.controller');
const service = require('../../../../src/modules/agent/application-submit/agent-application-submit.service');
const logger = require('../../../../utils/logger');

test('agent-application-submit.controller', async (t) => {
    let logError = null;
    let logInfo = null;

    const origLogError = logger.error;
    const origLogInfo = logger.info;

    t.beforeEach(() => {
        logger.error = (msg, meta) => { logError = { msg, meta }; };
        logger.info = (msg, meta) => { logInfo = { msg, meta }; };
        logError = null;
        logInfo = null;
    });

    t.afterEach(() => {
        service.processSubmit = undefined;
        logger.error = origLogError;
        logger.info = origLogInfo;
    });

    await t.test('returns error response when service fails', async () => {
        service.processSubmit = async () => ({
            success: false,
            status: 400,
            message: 'Incomplete',
            errors: ['error1']
        });

        const req = { userInfo: { id: 'user1' }, body: { termsAccepted: true } };
        let statusSet = 0;
        const res = {
            status: (s) => { statusSet = s; return res; },
            json: (data) => {
                assert.equal(statusSet, 400);
                assert.equal(data.success, false);
                assert.equal(data.message, 'Incomplete');
                assert.deepEqual(data.errors, ['error1']);
            }
        };

        await controller.submitApplication(req, res);
    });

    await t.test('returns success response when service succeeds and logs', async () => {
        service.processSubmit = async () => ({
            success: true,
            status: 200,
            message: 'Success',
            data: { agentId: '123' }
        });

        const req = { userInfo: { id: 'user1' }, body: { termsAccepted: true } };
        let statusSet = 0;
        const res = {
            status: (s) => { statusSet = s; return res; },
            json: (data) => {
                assert.equal(statusSet, 200);
                assert.equal(data.success, true);
                assert.equal(data.message, 'Success');
                assert.equal(data.data.agentId, '123');
                assert.equal(logInfo.msg, 'agent: application submitted');
                assert.equal(logInfo.meta.userId, 'user1');
                assert.equal(logInfo.meta.agentId, '123');
            }
        };

        await controller.submitApplication(req, res);
    });

    await t.test('handles unexpected errors and logs', async () => {
        service.processSubmit = async () => { throw new Error('DB Error'); };

        const req = { userInfo: { id: 'user1' }, body: { termsAccepted: true } };
        let statusSet = 0;
        const res = {
            status: (s) => { statusSet = s; return res; },
            json: (data) => {
                assert.equal(statusSet, 500);
                assert.equal(data.success, false);
                assert.equal(data.message, 'Internal Server Error');
                assert.equal(logError.msg, 'agent: submitApplication error');
                assert.equal(logError.meta.error, 'DB Error');
            }
        };

        await controller.submitApplication(req, res);
    });
});
