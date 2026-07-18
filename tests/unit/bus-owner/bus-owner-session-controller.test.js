'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const AppError = require('../../../src/shared/errors/app-error');
const service = require('../../../src/modules/bus-owner/auth/session/bus-owner-session.service');
const controller = require('../../../src/modules/bus-owner/auth/session/bus-owner-session.controller');

const req = (x = {}) => ({
  cookies: x.cookies || {},
  body: x.body,
  headers: x.headers || {},
  ip: x.ip,
  userInfo: x.userInfo,
});

const res = (order = [], failClear = false) => {
  const state = { cookies: [], clears: [], statusCode: null, body: null };
  return {
    state,
    cookie: (name, value, options) => {
      order.push('cookie');
      state.cookies.push({ name, value, options });
    },
    clearCookie: (name, options) => {
      order.push('clear');
      if (failClear) throw new Error('clear failed');
      state.clears.push({ name, options });
    },
    status: (code) => {
      state.statusCode = code;
      return { json: (body) => { state.body = body; return state; } };
    },
  };
};

const patch = (name, fn) => {
  const orig = service[name];
  service[name] = fn;
  return () => { service[name] = orig; };
};

test('bus-owner refresh controller preserves token, cookie and error contracts', async (t) => {
  await t.test('cookie-first extraction, metadata, exact cookie, no JSON refresh token', async () => {
    let input;
    const restore = patch('rotateSession', async (x) => {
      input = x;
      return { accessToken: 'a', refreshToken: 'r' };
    });
    try {
      const r = res();
      await controller.refresh(req({
        cookies: { refreshToken: 'cookie' },
        body: { refreshToken: 'body' },
        headers: { 'user-agent': 'UA' },
        ip: '1.2.3.4',
      }), r, assert.fail);
      assert.deepEqual(input, {
        refreshToken: 'cookie',
        deviceInfo: 'UA',
        ipAddress: '1.2.3.4',
      });
      assert.deepEqual(r.state.cookies[0], {
        name: 'refreshToken',
        value: 'r',
        options: {
          httpOnly: true,
          secure: false,
          sameSite: 'Lax',
          maxAge: 7 * 24 * 60 * 60 * 1000,
        },
      });
      assert.deepEqual(r.state.body, {
        success: true,
        message: 'Token refreshed successfully.',
        accessToken: 'a',
      });
    } finally { restore(); }
  });

  await t.test('body fallback, null metadata, missing token and mappings', async () => {
    let input;
    const restore = patch('rotateSession', async (x) => {
      input = x;
      return { accessToken: 'a' };
    });
    try {
      const ok = res();
      await controller.refresh(req({ body: { refreshToken: 'body' } }), ok, assert.fail);
      assert.deepEqual(input, { refreshToken: 'body', deviceInfo: null, ipAddress: null });
      assert.deepEqual(ok.state.cookies, []);
      const missing = res();
      await controller.refresh(req(), missing, assert.fail);
      assert.equal(missing.state.statusCode, 401);
      assert.equal(missing.state.body.message, 'Session expired. Please sign in again.');
    } finally { restore(); }

    const cases = [
      ['INVALID_REFRESH_TOKEN', 401, 'Session expired. Please sign in again.'],
      ['REFRESH_TOKEN_EXPIRED', 401, 'Session expired. Please sign in again.'],
      ['ACCOUNT_BANNED', 403, 'Your account has been suspended.'],
      ['ROLE_REVOKED', 403, 'Access revoked. Please contact support.'],
      ['OTHER', 401, 'Session could not be renewed. Please sign in again.'],
    ];
    for (const [msg, status, bodyMessage] of cases) {
      const restoreCase = patch('rotateSession', async () => { throw new Error(msg); });
      try {
        const r = res();
        await controller.refresh(req({ body: { refreshToken: 'tok' } }), r, assert.fail);
        assert.equal(r.state.statusCode, status);
        assert.deepEqual(r.state.body, { success: false, message: bodyMessage });
      } finally { restoreCase(); }
    }
    const appErr = new AppError('custom', 418, { custom: true });
    const restoreApp = patch('rotateSession', async () => { throw appErr; });
    try {
      const r = res();
      await controller.refresh(req({ body: { refreshToken: 'tok' } }), r, assert.fail);
      assert.deepEqual(r.state.body, { custom: true });
    } finally { restoreApp(); }
  });
});
