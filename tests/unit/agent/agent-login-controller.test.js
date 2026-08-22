'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const AppError = require('../../../src/shared/errors/app-error');
const controller = require('../../../src/modules/agent/auth/login/agent-login.controller');
const service = require('../../../src/modules/agent/auth/login/agent-login.service');

const run = (req, res) => controller.login(req, res, (err) => {
  if (err) throw err;
});
const res = () => ({
  statusCode: null,
  body: null,
  cookies: [],
  status(c) { this.statusCode = c; return this; },
  json(b) { this.body = b; return this; },
  cookie(...args) { this.cookies.push(args); return this; },
});
const req = (body = {}, extra = {}) => ({
  body,
  ip: '1.1.1.1',
  socket: { remoteAddress: '2.2.2.2' },
  get: (h) => (h === 'User-Agent' ? 'UA' : null),
  ...extra,
});

test('agent-login controller preserves HTTP adaptation', async (t) => {
  await t.test('extracts phone precedence, metadata, cookie and response', async () => {
    const original = service.login;
    const calls = [];
    service.login = async (input) => {
      calls.push(input);
      return {
        statusCode: 201,
        refreshToken: 'rt',
        responseBody: { success: true, accessToken: 'at' },
      };
    };
    try {
      const out = res();
      await run(req({ phone: 'p', emailOrPhone: 'e', password: 'pw' }), out);
      assert.deepEqual(calls[0], {
        rawPhone: 'p',
        password: 'pw',
        deviceInfo: 'UA',
        ipAddress: '1.1.1.1',
      });
      assert.equal(out.statusCode, 201);
      assert.deepEqual(out.body, { success: true, accessToken: 'at' });
      assert.equal(out.body.refreshToken, undefined);
      assert.deepEqual(out.cookies[0], ['agentRefreshToken', 'rt', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      }]);
    } finally {
      service.login = original;
    }
  });

  await t.test('body fallback, socket IP fallback, null metadata and no cookie', async () => {
    const original = service.login;
    let input;
    service.login = async (i) => {
      input = i;
      return { statusCode: 200, responseBody: { ok: true } };
    };
    try {
      const out = res();
      await run(req({ emailOrPhone: 'e', password: 'pw' }, {
        ip: null,
        get: () => null,
      }), out);
      assert.equal(input.rawPhone, 'e');
      assert.equal(input.deviceInfo, null);
      assert.equal(input.ipAddress, '2.2.2.2');
      assert.equal(out.cookies.length, 0);
    } finally {
      service.login = original;
    }
  });

  await t.test('AppError forwards exact body; generic, toObject and cookie errors map 500', async () => {
    const original = service.login;
    try {
      const expected = new AppError('bad', 418, { success: false, message: 'bad' });
      service.login = async () => { throw expected; };
      let out = res();
      await run(req(), out);
      assert.equal(out.statusCode, 418);
      assert.deepEqual(out.body, expected.responseBody);

      service.login = async () => { throw new Error('boom'); };
      out = res();
      await run(req(), out);
      assert.equal(out.statusCode, 500);
      assert.deepEqual(out.body, { success: false, message: 'Login failed. Please try again.' });

      service.login = async () => ({ statusCode: 200, refreshToken: 'rt', responseBody: {} });
      out = res();
      out.cookie = () => { throw new Error('cookie'); };
      await run(req(), out);
      assert.equal(out.statusCode, 500);
    } finally {
      service.login = original;
    }
  });
});
