'use strict';

process.env.SECRET_KEY ||= 'test-only-secret-32chars-minimum!!';

const test = require('node:test');
const assert = require('node:assert/strict');
const AppError = require('../../../src/shared/errors/app-error');
const controller = require('../../../src/modules/agent/auth/password-reset/agent-password-reset.controller');
const service = require('../../../src/modules/agent/auth/password-reset/agent-password-reset.service');

const patch = (obj, key, fn) => {
  const old = obj[key];
  obj[key] = fn;
  return () => { obj[key] = old; };
};
const res = () => ({
  code: null,
  body: null,
  cookies: [],
  status(c) { this.code = c; return this; },
  json(b) { this.body = b; return this; },
  cookie(...args) { this.cookies.push(args); },
});
const req = (body) => ({
  body,
  ip: '127.0.0.1',
  socket: {},
  get: () => 'test-device',
});

test('agent password reset controller adapts HTTP only', async (t) => {
  await t.test('forwards exact DTOs and responses', async () => {
    const seen = [];
    const restores = [
      patch(service, 'requestPasswordReset', async (x) => { seen.push(['request', x]); return { statusCode: 201, responseBody: { a: 1 } }; }),
      patch(service, 'verifyOtpForReset', async (x) => { seen.push(['verify', x]); return { statusCode: 202, responseBody: { b: 2 } }; }),
      patch(service, 'resetPassword', async (x) => { seen.push(['reset', x]); return { statusCode: 203, refreshToken: 'refresh', responseBody: { c: 3 } }; }),
      patch(service, 'resendOtpForReset', async (x) => { seen.push(['resend', x]); return { statusCode: 204, responseBody: { d: 4 } }; }),
    ];
    try {
      for (const [fn, body] of [
        ['requestPasswordReset', { phone: '+9779818600001' }],
        ['verifyOtpForReset', { phone: '9818600002', otp: '1' }],
        ['resetPassword', { phone: '9818600003', otp: '2', newPassword: 'p' }],
        ['resendOtpForReset', { phone: '9818600004' }],
      ]) {
        const out = res();
        await controller[fn](req(body), out, assert.ifError);
        assert.equal(out.code >= 201 && out.code <= 204, true);
      }
      assert.deepEqual(seen, [
        ['request', { rawPhone: '+9779818600001' }],
        ['verify', { rawPhone: '9818600002', otp: '1' }],
        ['reset', {
          rawPhone: '9818600003', otp: '2', newPassword: 'p',
          deviceInfo: 'test-device', ipAddress: '127.0.0.1',
        }],
        ['resend', { rawPhone: '9818600004' }],
      ]);
    } finally { restores.reverse().forEach((fn) => fn()); }
  });

  await t.test('AppError and unexpected errors map inside endpoint catch', async () => {
    let restore = patch(service, 'requestPasswordReset', async () => {
      throw new AppError('x', 418, { success: false, message: 'teapot' });
    });
    try {
      const out = res();
      await controller.requestPasswordReset(req({ phone: 'x' }), out, assert.ifError);
      assert.equal(out.code, 418);
      assert.deepEqual(out.body, { success: false, message: 'teapot' });
    } finally { restore(); }
    restore = patch(service, 'resetPassword', async () => { throw new Error('boom'); });
    try {
      const out = res();
      await controller.resetPassword(req({ phone: 'x', otp: '1', newPassword: 'p' }), out, assert.ifError);
      assert.equal(out.code, 500);
      assert.deepEqual(out.body, { success: false, message: 'Internal Server Error' });
    } finally { restore(); }
  });
});
