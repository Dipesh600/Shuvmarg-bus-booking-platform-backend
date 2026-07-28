'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const controller = require('../../../../src/modules/agent/dashboard/agent-dashboard.controller');
const service = require('../../../../src/modules/agent/dashboard/agent-dashboard.service');
const logger = require('../../../../utils/logger');

const response = () => {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};

test('agent dashboard controller', async (t) => {
  await t.test('forwards exact DTO and response', async () => {
    const original = service.getDashboard;
    const calls = [];
    service.getDashboard = async (dto) => {
      calls.push(dto);
      return { statusCode: 200, body: { success: true, data: { ok: 1 } } };
    };
    try {
      const res = response();
      await controller.getDashboard({ userInfo: { id: 'u1' }, extra: true }, res, assert.fail);
      assert.deepEqual(calls, [{ userId: 'u1' }]);
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, { success: true, data: { ok: 1 } });
    } finally {
      service.getDashboard = original;
    }
  });

  await t.test('unexpected service failure maps to exact 500 and logger metadata', async () => {
    const originalService = service.getDashboard;
    const originalLogger = logger.error;
    const logs = [];
    service.getDashboard = async () => { throw new Error('boom'); };
    logger.error = (...args) => logs.push(args);
    try {
      const res = response();
      await controller.getDashboard({ userInfo: { id: 'u1' } }, res, assert.fail);
      assert.equal(res.statusCode, 500);
      assert.deepEqual(res.body, { success: false, message: 'Internal Server Error' });
      assert.deepEqual(logs, [['agent: getDashboard error', { error: 'boom' }]]);
    } finally {
      service.getDashboard = originalService;
      logger.error = originalLogger;
    }
  });
});
