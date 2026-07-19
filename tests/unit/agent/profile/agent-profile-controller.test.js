'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const controller = require('../../../../src/modules/agent/profile/agent-profile.controller');
const service = require('../../../../src/modules/agent/profile/agent-profile.service');
const logger = require('../../../../utils/logger');

const response = () => {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};

test('agent profile controller preserves DTO and error mapping', async (t) => {
  await t.test('forwards user ID only and returns service response', async () => {
    const original = service.getProfile;
    const userId = crypto.randomBytes(12).toString('hex');
    const calls = [];
    service.getProfile = async (dto) => {
      calls.push(dto);
      return { statusCode: 200, body: { success: true, data: { ok: true } } };
    };
    try {
      const res = response();
      await controller.getProfile({ userInfo: { id: userId }, body: { ignored: true } }, res, assert.fail);
      assert.deepEqual(calls, [{ userId }]);
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, { success: true, data: { ok: true } });
    } finally {
      service.getProfile = original;
    }
  });

  await t.test('unexpected service failure logs exact metadata and returns 500', async () => {
    const originalService = service.getProfile;
    const originalLogger = logger.error;
    const logs = [];
    service.getProfile = async () => { throw new Error('profile failure'); };
    logger.error = (...args) => logs.push(args);
    try {
      const res = response();
      await controller.getProfile({ userInfo: { id: crypto.randomBytes(12).toString('hex') } }, res, assert.fail);
      assert.equal(res.statusCode, 500);
      assert.deepEqual(res.body, { success: false, message: 'Internal Server Error' });
      assert.deepEqual(logs, [['agent: getProfile error', { error: 'profile failure' }]]);
    } finally {
      service.getProfile = originalService;
      logger.error = originalLogger;
    }
  });
});
