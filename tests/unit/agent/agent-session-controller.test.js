'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const AppError = require('../../../src/shared/errors/app-error');
const service = require('../../../src/modules/agent/auth/session/agent-session.service');
const controller = require('../../../src/modules/agent/auth/session/agent-session.controller');

const req = (extra = {}) => ({
  cookies: extra.cookies || {},
  body: extra.body,
  headers: extra.headers || {},
  ip: extra.ip,
  userInfo: extra.userInfo,
});

const res = (order = [], fail = {}) => {
  const state = { cookies: [], clears: [], statusCode: null, body: null };
  return {
    state,
    cookie: (name, value, options) => {
      order.push('cookie');
      if (fail.cookie) throw new Error('cookie failed');
      state.cookies.push({ name, value, options });
    },
    clearCookie: (name, options) => {
      order.push('clear');
      if (fail.clear) throw new Error('clear failed');
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

test('agent-session controller preserves refresh and logout contracts', async (t) => {
  await t.test('refresh uses cookie first, forwards metadata, sets cookie, omits JSON token', async () => {
    let input;
    const restore = patch('rotateSession', async (x) => {
      input = x;
      return { accessToken: 'access', refreshToken: 'new-refresh' };
    });
    try {
      const r = res();
      await controller.refresh(req({
        cookies: { refreshToken: 'cookie-token' },
        body: { refreshToken: 'body-token' },
        headers: { 'user-agent': 'UA' },
        ip: '1.2.3.4',
      }), r, assert.fail);
      assert.deepEqual(input, {
        refreshToken: 'cookie-token',
        deviceInfo: 'UA',
        ipAddress: '1.2.3.4',
      });
      assert.equal(r.state.statusCode, 200);
      assert.equal(r.state.body.refreshToken, undefined);
      assert.deepEqual(r.state.cookies[0], {
        name: 'agentRefreshToken',
        value: 'new-refresh',
        options: {
          httpOnly: true,
          secure: false,
          sameSite: 'Lax',
          maxAge: 7 * 24 * 60 * 60 * 1000,
        },
      });
    } finally { restore(); }
  });

  await t.test('refresh supports body fallback, null metadata, missing token and no new cookie', async () => {
    let input;
    const restore = patch('rotateSession', async (x) => {
      input = x;
      return { accessToken: 'access' };
    });
    try {
      const ok = res();
      await controller.refresh(req({ body: { refreshToken: 'body-token' } }), ok, assert.fail);
      assert.deepEqual(input, {
        refreshToken: 'body-token',
        deviceInfo: null,
        ipAddress: null,
      });
      assert.deepEqual(ok.state.cookies, []);
      const missing = res();
      await controller.refresh(req(), missing, assert.fail);
      assert.equal(missing.state.statusCode, 401);
      assert.deepEqual(missing.state.body, {
        success: false,
        message: 'Session expired. Please sign in again.',
      });
    } finally { restore(); }
  });

  await t.test('refresh maps token errors, AppError, unknown and cookie failure exactly', async () => {
    const cases = [
      ['INVALID_REFRESH_TOKEN', 401, 'Session expired. Please sign in again.'],
      ['REFRESH_TOKEN_EXPIRED', 401, 'Session expired. Please sign in again.'],
      ['ACCOUNT_BANNED', 403, 'Your account has been suspended.'],
      ['ROLE_REVOKED', 403, 'Access revoked. Please contact support.'],
      ['OTHER', 401, 'Session could not be renewed. Please sign in again.'],
    ];
    for (const [msg, status, bodyMessage] of cases) {
      const restore = patch('rotateSession', async () => { throw new Error(msg); });
      try {
        const r = res();
        await controller.refresh(req({ body: { refreshToken: 'tok' } }), r, assert.fail);
        assert.equal(r.state.statusCode, status);
        assert.deepEqual(r.state.body, {
          success: false,
          message: bodyMessage,
          ...(msg === 'ROLE_REVOKED' && { errorCode: msg }),
        });
      } finally { restore(); }
    }
    const appErr = new AppError('custom', 418, { custom: true });
    const restoreApp = patch('rotateSession', async () => { throw appErr; });
    try {
      const r = res();
      await controller.refresh(req({ body: { refreshToken: 'tok' } }), r, assert.fail);
      assert.equal(r.state.statusCode, 418);
      assert.deepEqual(r.state.body, { custom: true });
    } finally { restoreApp(); }
    const restoreCookie = patch('rotateSession', async () => ({ accessToken: 'a', refreshToken: 'r' }));
    try {
      const r = res([], { cookie: true });
      await controller.refresh(req({ body: { refreshToken: 'tok' } }), r, assert.fail);
      assert.equal(r.state.statusCode, 401);
      assert.equal(r.state.body.message, 'Session could not be renewed. Please sign in again.');
    } finally { restoreCookie(); }
  });
});
