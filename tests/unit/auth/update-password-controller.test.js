'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../../../src/modules/auth/update-password/update-password.service');
const controller = require('../../../src/modules/auth/update-password/update-password.controller');
const AppError = require('../../../src/shared/errors/app-error');

const req = (body = {}, userInfo) => ({ body, userInfo });
const res = () => ({
  code: null,
  body: null,
  status(c) { this.code = c; return this; },
  json(b) { this.body = b; return this; },
});

test('update-password controller', async (t) => {
  await t.test('forwards userId and passwords unchanged', async () => {
    const orig = service.updatePassword;
    let input;
    try {
      service.updatePassword = async (payload) => {
        input = payload;
        return { statusCode: 202, responseBody: { ok: true } };
      };
      const out = res();
      await controller.updatePassword(
        req({ oldPassword: ' old ', newPassword: ' new ' }, { id: 'u1' }),
        out,
        assert.fail
      );
      assert.deepEqual(input, { userId: 'u1', oldPassword: ' old ', newPassword: ' new ' });
      assert.equal(out.code, 202);
      assert.deepEqual(out.body, { ok: true });
    } finally { service.updatePassword = orig; }
  });

  await t.test('missing req.userInfo passes undefined userId', async () => {
    const orig = service.updatePassword;
    try {
      service.updatePassword = async (payload) => {
        assert.equal(payload.userId, undefined);
        return { statusCode: 200, responseBody: { status: true } };
      };
      await controller.updatePassword(req({ oldPassword: 'a', newPassword: 'b' }), res(), assert.fail);
    } finally { service.updatePassword = orig; }
  });

  await t.test('AppError and generic Error are forwarded without response', async () => {
    for (const error of [new AppError('bad', 400), new Error('boom')]) {
      const orig = service.updatePassword;
      const out = res();
      try {
        service.updatePassword = async () => { throw error; };
        await controller.updatePassword(req({}, { id: 'u1' }), out, (err) => {
          assert.equal(err, error);
        });
        assert.equal(out.code, null);
        assert.equal(out.body, null);
      } finally { service.updatePassword = orig; }
    }
  });
});
