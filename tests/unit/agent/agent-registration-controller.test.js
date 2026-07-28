'use strict';

process.env.SECRET_KEY ||= 'test-only-secret-32chars-minimum!!';
process.env.VERIFICATION_TOKEN_SECRET ||= 'test-only-verification-secret!!';

const test = require('node:test');
const assert = require('node:assert/strict');
const AppError = require('../../../src/shared/errors/app-error');
const controller = require('../../../src/modules/agent/auth/registration/agent-registration.controller');
const service = require('../../../src/modules/agent/auth/registration/agent-registration.service');

const patch = (obj, key, fn) => {
  const old = obj[key];
  obj[key] = fn;
  return () => { obj[key] = old; };
};
const res = () => ({
  statusCode: null,
  body: null,
  cookies: [],
  status(c) { this.statusCode = c; return this; },
  json(b) { this.body = b; return this; },
  cookie(...args) { this.cookies.push(args); return this; },
});
const run = (fn, req, out) => fn(req, out, (err) => { if (err) throw err; });
const req = (body = {}, extra = {}) => ({
  body,
  ip: '1.1.1.1',
  socket: { remoteAddress: '2.2.2.2' },
  get: (h) => (h === 'User-Agent' ? 'UA' : null),
  ...extra,
});

test('agent-registration controller preserves HTTP adaptation', async (t) => {
  await t.test('sendOTP, verifyOTP and resendOTP forward exact inputs and responses', async () => {
    const calls = [];
    const restores = [
      patch(service, 'sendOTP', async (input) => { calls.push(['send', input]); return { statusCode: 201, responseBody: { a: 1 } }; }),
      patch(service, 'verifyOTP', async (input) => { calls.push(['verify', input]); return { statusCode: 202, responseBody: { b: 2 } }; }),
      patch(service, 'resendOTP', async (input) => { calls.push(['resend', input]); return { statusCode: 203, responseBody: { c: 3 } }; }),
    ];
    try {
      let out = res();
      await run(controller.sendOTP, req({ phone: 'p' }), out);
      assert.equal(out.statusCode, 201);
      out = res();
      await run(controller.verifyOTP, req({ phone: 'p', otp: 'o' }), out);
      assert.equal(out.statusCode, 202);
      out = res();
      await run(controller.resendOTP, req({ phone: 'p' }), out);
      assert.equal(out.statusCode, 203);
      assert.deepEqual(calls, [
        ['send', { rawPhone: 'p' }],
        ['verify', { rawPhone: 'p', otp: 'o' }],
        ['resend', { rawPhone: 'p' }],
      ]);
    } finally {
      restores.reverse().forEach((restore) => restore());
    }
  });

  await t.test('register forwards fields, metadata, cookie and omits refresh token JSON', async () => {
    let captured;
    const restore = patch(service, 'register', async (input) => {
      captured = input;
      return { statusCode: 201, refreshToken: 'rt', responseBody: { success: true, accessToken: 'at' } };
    });
    try {
      const out = res();
      await run(controller.register, req({
        phone: 'p', name: 'n', password: 'pw', email: 'e', verificationToken: 'vt',
        ignored: 'no',
      }), out);
      assert.deepEqual(captured, {
        rawPhone: 'p',
        name: 'n',
        password: 'pw',
        email: 'e',
        verificationToken: 'vt',
        deviceInfo: 'UA',
        ipAddress: '1.1.1.1',
      });
      assert.equal(out.statusCode, 201);
      assert.equal(out.body.refreshToken, undefined);
      assert.deepEqual(out.cookies[0], ['refreshToken', 'rt', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      }]);
    } finally { restore(); }
  });

  await t.test('socket IP/null fallbacks, AppError and generic mappings are preserved', async () => {
    let restore = patch(service, 'register', async (input) => ({
      statusCode: 201,
      responseBody: { ip: input.ipAddress, ua: input.deviceInfo },
    }));
    try {
      const out = res();
      await run(controller.register, req({ phone: 'p' }, { ip: null, get: () => null }), out);
      assert.deepEqual(out.body, { ip: '2.2.2.2', ua: null });
    } finally { restore(); }
    restore = patch(service, 'sendOTP', async () => {
      throw new AppError('bad', 418, { success: false, message: 'bad' });
    });
    try {
      const out = res();
      await run(controller.sendOTP, req({ phone: 'p' }), out);
      assert.equal(out.statusCode, 418);
      assert.deepEqual(out.body, { success: false, message: 'bad' });
    } finally { restore(); }
    restore = patch(service, 'sendOTP', async () => { throw new Error('boom'); });
    try {
      const out = res();
      await run(controller.sendOTP, req({ phone: 'p' }), out);
      assert.equal(out.statusCode, 500);
      assert.equal(out.body.message, 'Failed to send verification code. Please try again.');
    } finally { restore(); }
  });
});
