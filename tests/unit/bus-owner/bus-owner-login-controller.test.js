'use strict';

process.env.SECRET_KEY ||= 'test-only-secret-32chars-minimum!!';

const test = require('node:test');
const assert = require('node:assert/strict');
const AppError = require('../../../src/shared/errors/app-error');
const controller = require('../../../src/modules/bus-owner/auth/login/bus-owner-login.controller');
const service = require('../../../src/modules/bus-owner/auth/login/bus-owner-login.service');

const run = (req, res) => controller.login(req, res, (err) => {
  if (err) throw err;
});
const res = () => ({
  statusCode: null, body: null, cookies: [],
  status(c) { this.statusCode = c; return this; },
  json(b) { this.body = b; return this; },
  cookie(...args) { this.cookies.push(args); return this; },
});
const req = (body = {}, extra = {}) => ({
  body, ip: '1.1.1.1',
  socket: { remoteAddress: '2.2.2.2' },
  get: (h) => (h === 'User-Agent' ? 'UA' : null),
  ...extra,
});

test('bus-owner-login controller preserves HTTP adaptation', async (t) => {
  await t.test('phone wins over emailOrPhone, sets cookie, response body correct', async () => {
    const original = service.login;
    const calls = [];
    service.login = async (input) => {
      calls.push(input);
      return { statusCode: 200, refreshToken: 'rt', responseBody: { success: true, accessToken: 'at' } };
    };
    try {
      const out = res();
      await run(req({ phone: 'p', emailOrPhone: 'e', password: 'pw' }), out);
      assert.deepEqual(calls[0], { rawPhone: 'p', password: 'pw', deviceInfo: 'UA', ipAddress: '1.1.1.1' });
      assert.equal(out.statusCode, 200);
      assert.deepEqual(out.body, { success: true, accessToken: 'at' });
      assert.equal(out.body.refreshToken, undefined);
      assert.deepEqual(out.cookies[0], ['busOwnerRefreshToken', 'rt', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      }]);
    } finally { service.login = original; }
  });

  await t.test('emailOrPhone fallback, socket IP, null metadata, no cookie', async () => {
    const original = service.login;
    let input;
    service.login = async (i) => { input = i; return { statusCode: 200, responseBody: { ok: true } }; };
    try {
      const out = res();
      await run(req({ emailOrPhone: 'e', password: 'pw' }, { ip: null, get: () => null }), out);
      assert.equal(input.rawPhone, 'e');
      assert.equal(input.deviceInfo, null);
      assert.equal(input.ipAddress, '2.2.2.2');
      assert.equal(out.cookies.length, 0);
    } finally { service.login = original; }
  });

  await t.test('missing metadata forwards null deviceInfo and null ipAddress', async () => {
    const original = service.login;
    let input;
    service.login = async (i) => { input = i; return { statusCode: 200, responseBody: { ok: true } }; };
    try {
      const out = res();
      await run(req({ phone: 'p', password: 'pw' }, {
        ip: null,
        socket: undefined,
        get: () => null,
      }), out);
      assert.deepEqual(input, {
        rawPhone: 'p',
        password: 'pw',
        deviceInfo: null,
        ipAddress: null,
      });
      assert.equal(out.statusCode, 200);
    } finally { service.login = original; }
  });

  await t.test('AppError forwards exact body and status', async () => {
    const original = service.login;
    try {
      const expected = new AppError('bad', 418, { success: false, message: 'bad', errorCode: 'X' });
      service.login = async () => { throw expected; };
      const out = res();
      await run(req(), out);
      assert.equal(out.statusCode, 418);
      assert.deepEqual(out.body, expected.responseBody);
    } finally { service.login = original; }
  });

  await t.test('unexpected error maps to 500 generic body', async () => {
    const original = service.login;
    try {
      service.login = async () => { throw new Error('db exploded'); };
      const out = res();
      await run(req(), out);
      assert.equal(out.statusCode, 500);
      assert.deepEqual(out.body, { success: false, message: 'Login failed. Please try again.' });
    } finally { service.login = original; }
  });

  await t.test('service toObject failure maps to 500 generic body', async () => {
    const original = service.login;
    try {
      service.login = async () => { throw new Error('toObject failed'); };
      const out = res();
      await run(req(), out);
      assert.equal(out.statusCode, 500);
      assert.deepEqual(out.body, { success: false, message: 'Login failed. Please try again.' });
    } finally { service.login = original; }
  });

  await t.test('cookie error maps to 500', async () => {
    const original = service.login;
    try {
      service.login = async () => ({ statusCode: 200, refreshToken: 'rt', responseBody: {} });
      const out = res();
      out.cookie = () => { throw new Error('cookie error'); };
      await run(req(), out);
      assert.equal(out.statusCode, 500);
    } finally { service.login = original; }
  });
});
