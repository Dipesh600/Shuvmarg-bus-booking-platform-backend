'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const controller = require('../../../../src/modules/agent/application-status/agent-application-status.controller');
const service = require('../../../../src/modules/agent/application-status/agent-application-status.service');
const logger = require('../../../../utils/logger');

const response = () => {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};

test('agent application status controller preserves DTO and error mapping', async (t) => {
  await t.test('forwards only userId and userName and sends service response unchanged', async () => {
    const original = service.getApplicationStatus;
    const calls = [];
    service.getApplicationStatus = async (dto) => {
      calls.push(dto);
      return { statusCode: 200, body: { success: true, data: { ok: true } } };
    };
    try {
      const userId = crypto.randomBytes(12).toString('hex');
      const res = response();
      await controller.getApplicationStatus({
        userInfo: { id: userId, name: 'Agent Name', role: 'agent' },
        body: { ignored: true },
      }, res, assert.fail);
      assert.deepEqual(calls, [{ userId, userName: 'Agent Name' }]);
      assert.deepEqual(res.body, { success: true, data: { ok: true } });
    } finally {
      service.getApplicationStatus = original;
    }
  });

  await t.test('unexpected failure logs exact metadata and returns generic 500', async () => {
    const originalService = service.getApplicationStatus;
    const originalLogger = logger.error;
    const logs = [];
    service.getApplicationStatus = async () => { throw new Error('status failure'); };
    logger.error = (...args) => logs.push(args);
    try {
      const res = response();
      await controller.getApplicationStatus({ userInfo: { id: 'u1' } }, res, assert.fail);
      assert.equal(res.statusCode, 500);
      assert.deepEqual(res.body, { success: false, message: 'Internal Server Error' });
      assert.deepEqual(logs, [['agent: getApplicationStatus error', { error: 'status failure' }]]);
    } finally {
      service.getApplicationStatus = originalService;
      logger.error = originalLogger;
    }
  });
});
