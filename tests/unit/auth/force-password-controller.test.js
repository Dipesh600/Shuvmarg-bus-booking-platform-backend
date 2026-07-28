'use strict';

process.env.SECRET_KEY = process.env.SECRET_KEY || 'test-only-secret-32chars-minimum!!';

const test = require('node:test');
const assert = require('node:assert/strict');
const AppError = require('../../../src/shared/errors/app-error');
const service = require('../../../src/modules/auth/force-password/force-password.service');
const controller = require('../../../src/modules/auth/force-password/force-password.controller');

const req = (body = {}, extra = {}) => ({
  body,
  ip: extra.ip,
  connection: extra.connection || {},
  get: (name) => extra.headers && extra.headers[name],
});

const res = () => {
  const state = { cookies: [], statusCode: null, body: null };
  return {
    state,
    cookie: (name, value, options) => state.cookies.push({ name, value, options }),
    status: (code) => {
      state.statusCode = code;
      return { json: (body) => { state.body = body; return state; } };
    },
  };
};

const patchService = (fn) => {
  const orig = service.changeForcePassword;
  service.changeForcePassword = fn;
  return () => { service.changeForcePassword = orig; };
};

test('force-password controller', async (t) => {
  await t.test('forwards body fields and metadata unchanged', async () => {
    let input;
    const restore = patchService(async (x) => {
      input = x;
      return { statusCode: 202, responseBody: { ok: true } };
    });
    try {
      const r = res();
      await controller.changeForcePassword(req(
        { tempToken: 't', newPassword: 'P', phone: 'p', otp: 'o' },
        { ip: '1.1.1.1', headers: { 'User-Agent': 'UA' } },
      ), r, assert.fail);
      assert.deepEqual(input, {
        tempToken: 't',
        newPassword: 'P',
        phone: 'p',
        otp: 'o',
        deviceInfo: 'UA',
        ipAddress: '1.1.1.1',
      });
      assert.equal(r.state.statusCode, 202);
      assert.deepEqual(r.state.body, { ok: true });
    } finally { restore(); }
  });

  await t.test('deviceInfo null and connection fallback when req.ip is absent', async () => {
    let input;
    const restore = patchService(async (x) => {
      input = x;
      return { statusCode: 200, responseBody: {} };
    });
    try {
      await controller.changeForcePassword(
        req({}, { connection: { remoteAddress: '::1' } }),
        res(),
        assert.fail,
      );
      assert.equal(input.deviceInfo, null);
      assert.equal(input.ipAddress, '::1');
    } finally { restore(); }
  });

  await t.test('sets exact refresh cookie only when refreshToken exists', async () => {
    const restore = patchService(async () => ({
      statusCode: 200,
      refreshToken: 'rt',
      responseBody: { success: true, accessToken: 'at' },
    }));
    try {
      const r = res();
      await controller.changeForcePassword(req(), r, assert.fail);
      assert.deepEqual(r.state.cookies, [{
        name: 'refreshToken',
        value: 'rt',
        options: {
          httpOnly: true,
          secure: false,
          sameSite: 'Lax',
          maxAge: 7 * 24 * 60 * 60 * 1000,
        },
      }]);
      assert.equal(r.state.body.refreshToken, undefined);
    } finally { restore(); }
  });

  await t.test('does not set cookie when refreshToken is absent', async () => {
    const restore = patchService(async () => ({
      statusCode: 200,
      responseBody: { success: true },
    }));
    try {
      const r = res();
      await controller.changeForcePassword(req(), r, assert.fail);
      assert.deepEqual(r.state.cookies, []);
    } finally { restore(); }
  });

  await t.test('forwards AppError unchanged and does not respond', async () => {
    const err = new AppError('x', 400);
    const restore = patchService(async () => { throw err; });
    try {
      const r = res();
      let nextErr;
      await controller.changeForcePassword(req(), r, (e) => { nextErr = e; });
      assert.equal(nextErr, err);
      assert.equal(r.state.statusCode, null);
    } finally { restore(); }
  });

  await t.test('forwards generic Error unchanged and does not respond', async () => {
    const err = new Error('boom');
    const restore = patchService(async () => { throw err; });
    try {
      const r = res();
      let nextErr;
      await controller.changeForcePassword(req(), r, (e) => { nextErr = e; });
      assert.equal(nextErr, err);
      assert.equal(r.state.statusCode, null);
    } finally { restore(); }
  });
});
