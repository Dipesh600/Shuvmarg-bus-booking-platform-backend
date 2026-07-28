'use strict';

process.env.SECRET_KEY ||= 'test-only-secret-32chars-minimum!!';
process.env.VERIFICATION_TOKEN_SECRET ||= 'test-only-verification-secret!!';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const AppError = require('../../../src/shared/errors/app-error');
const controller = require('../../../src/modules/bus-owner/auth/registration');
const service = require('../../../src/modules/bus-owner/auth/registration/bus-owner-registration.service');

const credential = crypto.randomBytes(24).toString('hex');
const patch = (name, fn) => {
  const orig = service[name];
  service[name] = fn;
  return () => { service[name] = orig; };
};
const req = (body = {}, extra = {}) => ({
  body,
  ip: extra.ip,
  socket: extra.socket,
  get: (name) => extra.headers?.[name],
});
const res = () => {
  const out = { statusCode: null, body: null, cookies: [] };
  out.status = (code) => { out.statusCode = code; return out; };
  out.json = (body) => { out.body = body; return out; };
  out.cookie = (...args) => { out.cookies.push(args); return out; };
  return out;
};

test('bus-owner registration controller adapts HTTP exactly', async (t) => {
  await t.test('forwards endpoint DTOs and response bodies', async () => {
    const calls = [];
    let restore = patch('sendOTP', async (input) => {
      calls.push(['send', input]);
      return { statusCode: 200, responseBody: { ok: true } };
    });
    try {
      const output = res();
      await controller.sendOTP(req({ phone: 'p', extra: 'ignored' }), output);
      assert.deepEqual(calls, [['send', { rawPhone: 'p' }]]);
      assert.equal(output.statusCode, 200);
      assert.deepEqual(output.body, { ok: true });
    } finally { restore(); }
    restore = patch('verifyOTP', async (input) => {
      calls.push(['verify', input]);
      return { statusCode: 200, responseBody: { ok: true } };
    });
    try {
      await controller.verifyOTP(req({ phone: 'p', otp: '1', other: 'x' }), res());
      assert.deepEqual(calls.at(-1), ['verify', { rawPhone: 'p', otp: '1' }]);
    } finally { restore(); }
  });

  await t.test('register forwards metadata, sets exact cookie and omits refreshToken from JSON', async () => {
    let dto;
    const restore = patch('register', async (input) => {
      dto = input;
      return {
        statusCode: 201,
        refreshToken: 'refresh',
        responseBody: { success: true, accessToken: 'access' },
      };
    });
    try {
      const output = res();
      await controller.register(req({
        phone: 'p',
        name: 'n',
        password: credential,
        email: 'e',
        companyName: 'c',
        address: 'a',
        verificationToken: 'tok',
        ignored: true,
      }, { ip: '1.1.1.1', headers: { 'User-Agent': 'UA' } }), output);
      assert.equal(dto.deviceInfo, 'UA');
      assert.equal(dto.ipAddress, '1.1.1.1');
      assert.equal(dto.ignored, undefined);
      assert.deepEqual(output.cookies, [['refreshToken', 'refresh', {
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      }]]);
      assert.equal(output.body.refreshToken, undefined);
    } finally { restore(); }
  });

  await t.test('register socket and null metadata fallbacks are exact', async () => {
    const calls = [];
    const restore = patch('register', async (input) => {
      calls.push({ deviceInfo: input.deviceInfo, ipAddress: input.ipAddress });
      return { statusCode: 201, responseBody: { ok: true } };
    });
    try {
      await controller.register(req({}, { socket: { remoteAddress: 'socket-ip' } }), res());
      await controller.register(req({}), res());
      assert.deepEqual(calls, [
        { deviceInfo: null, ipAddress: 'socket-ip' },
        { deviceInfo: null, ipAddress: null },
      ]);
    } finally { restore(); }
  });

  await t.test('AppError and unexpected errors map to endpoint-specific responses', async () => {
    let restore = patch('resendOTP', async () => {
      throw new AppError('No', 400, { success: false, message: 'No' });
    });
    try {
      const output = res();
      await controller.resendOTP(req({ phone: 'p' }), output);
      assert.equal(output.statusCode, 400);
      assert.deepEqual(output.body, { success: false, message: 'No' });
    } finally { restore(); }
    restore = patch('verifyOTP', async () => { throw new Error('boom'); });
    try {
      const output = res();
      await controller.verifyOTP(req({ phone: 'p', otp: '1' }), output);
      assert.equal(output.statusCode, 500);
      assert.deepEqual(output.body, {
        success: false,
        message: 'Failed to verify code. Please try again.',
      });
    } finally { restore(); }
  });
});
