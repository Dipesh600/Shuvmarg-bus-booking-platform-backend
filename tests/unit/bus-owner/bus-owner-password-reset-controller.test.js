'use strict';

process.env.SECRET_KEY ||= 'test-only-secret-32chars-minimum!!';

const test = require('node:test');
const assert = require('node:assert/strict');
const AppError = require('../../../src/shared/errors/app-error');
const controller = require('../../../src/modules/bus-owner/auth/password-reset/bus-owner-password-reset.controller');
const service = require('../../../src/modules/bus-owner/auth/password-reset/bus-owner-password-reset.service');

const run = (handler, req, res) => handler(req, res, (err) => { if (err) throw err; });
const res = () => ({
  statusCode: null,
  body: null,
  cookies: [],
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
  cookie(...args) { this.cookies.push(args); return this; },
});
const req = (body) => ({ body });
const patch = (obj, key, value) => {
  const original = obj[key];
  obj[key] = value;
  return () => { obj[key] = original; };
};

test('bus-owner password-reset controller preserves HTTP adaptation', async (t) => {
  await t.test('forwards exact endpoint DTOs and responses without cookies', async () => {
    const calls = [];
    const restores = [
      patch(service, 'requestPasswordReset', async (x) => {
        calls.push(['request', x]); return { statusCode: 200, responseBody: { ok: 'r' } };
      }),
      patch(service, 'verifyOtpForReset', async (x) => {
        calls.push(['verify', x]); return { statusCode: 200, responseBody: { ok: 'v' } };
      }),
      patch(service, 'resetPassword', async (x) => {
        calls.push(['reset', x]); return { statusCode: 200, responseBody: { ok: 'c' } };
      }),
      patch(service, 'resendOtpForReset', async (x) => {
        calls.push(['resend', x]); return { statusCode: 200, responseBody: { ok: 's' } };
      }),
    ];
    try {
      const out = [res(), res(), res(), res()];
      await run(controller.requestPasswordReset, req({ phone: 'p', extra: 1 }), out[0]);
      await run(controller.verifyOtpForReset, req({ phone: 'p', otp: '123456', extra: 1 }), out[1]);
      await run(controller.resetPassword, req({ phone: 'p', otp: '123456', newPassword: 'n', extra: 1 }), out[2]);
      await run(controller.resendOtpForReset, req({ phone: 'p', extra: 1 }), out[3]);
      assert.deepEqual(calls, [
        ['request', { rawPhone: 'p' }],
        ['verify', { rawPhone: 'p', otp: '123456' }],
        ['reset', { rawPhone: 'p', otp: '123456', newPassword: 'n' }],
        ['resend', { rawPhone: 'p' }],
      ]);
      assert.deepEqual(out.map((x) => x.body), [{ ok: 'r' }, { ok: 'v' }, { ok: 'c' }, { ok: 's' }]);
      assert.deepEqual(out.flatMap((x) => x.cookies), []);
    } finally { restores.forEach((restore) => restore()); }
  });

  await t.test('forwards AppError body exactly', async () => {
    const error = new AppError('bad', 418, { success: false, message: 'bad', errorCode: 'X' });
    const restore = patch(service, 'verifyOtpForReset', async () => { throw error; });
    try {
      const out = res();
      await run(controller.verifyOtpForReset, req({ phone: 'p', otp: '1' }), out);
      assert.equal(out.statusCode, 418);
      assert.deepEqual(out.body, error.responseBody);
    } finally { restore(); }
  });

  await t.test('maps endpoint-specific unexpected errors', async () => {
    const noop = patch(console, 'error', () => {});
    const cases = [
      ['requestPasswordReset', controller.requestPasswordReset, 'Sparrow SMS unavailable', 502, 'SMS gateway error. Please try again.'],
      ['requestPasswordReset', controller.requestPasswordReset, 'db', 500, 'Failed to send OTP. Please try again.'],
      ['verifyOtpForReset', controller.verifyOtpForReset, 'db', 500, 'Internal Server Error'],
      ['resetPassword', controller.resetPassword, 'db', 500, 'Internal Server Error'],
      ['resendOtpForReset', controller.resendOtpForReset, 'db', 500, 'Failed to resend code. Please try again.'],
    ];
    try {
      for (const [name, handler, message, status, bodyMessage] of cases) {
        const restore = patch(service, name, async () => { throw new Error(message); });
        try {
          const out = res();
          await run(handler, req({ phone: 'p', otp: '123456', newPassword: 'n' }), out);
          assert.equal(out.statusCode, status);
          assert.deepEqual(out.body, { success: false, message: bodyMessage });
        } finally { restore(); }
      }
    } finally { noop(); }
  });
});
