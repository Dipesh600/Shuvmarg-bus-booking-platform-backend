'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../../../src/modules/bus-owner/auth/session/bus-owner-session.service');
const controller = require('../../../src/modules/bus-owner/auth/session/bus-owner-session.controller');

const req = (x = {}) => ({
  cookies: x.cookies || {},
  body: x.body,
  userInfo: x.userInfo,
});

const res = (order = [], failClear = false) => {
  const state = { clears: [], statusCode: null, body: null };
  return {
    state,
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

test('bus-owner logout controller preserves ordering and fallback behavior', async (t) => {
  await t.test('normal path is revoke, clear, increment, respond', async () => {
    const order = [];
    const rr = patch('revokeSessionToken', async (tok) => order.push(`revoke:${tok}`));
    const ri = patch('invalidateAccessToken', async (id) => order.push(`increment:${id}`));
    try {
      const r = res(order);
      await controller.logout(req({
        cookies: { refreshToken: 'cookie' },
        body: { refreshToken: 'body' },
        userInfo: { id: 'u1' },
      }), r, assert.fail);
      assert.deepEqual(order, ['revoke:cookie', 'clear', 'increment:u1']);
      assert.deepEqual(r.state.clears[0], {
        name: 'refreshToken',
        options: { httpOnly: true, secure: false, sameSite: 'Lax' },
      });
      assert.deepEqual(r.state.body, {
        success: true,
        message: 'Logged out successfully.',
      });
    } finally { rr(); ri(); }
  });

  await t.test('skips revoke and increment when inputs are absent', async () => {
    const order = [];
    const rr = patch('revokeSessionToken', async () => assert.fail('no revoke'));
    const ri = patch('invalidateAccessToken', async () => assert.fail('no increment'));
    try {
      await controller.logout(req(), res(order), assert.fail);
      assert.deepEqual(order, ['clear']);
    } finally { rr(); ri(); }
  });

  await t.test('revoke failure clears in catch and returns bus-owner fallback', async () => {
    const order = [];
    const rr = patch('revokeSessionToken', async () => {
      order.push('revoke');
      throw new Error('revoke');
    });
    const ri = patch('invalidateAccessToken', async () => assert.fail('no increment'));
    try {
      const r = res(order);
      await controller.logout(req({ body: { refreshToken: 'tok' }, userInfo: { id: 'u' } }), r, assert.fail);
      assert.deepEqual(order, ['revoke', 'clear']);
      assert.deepEqual(r.state.body, {
        success: true,
        message: 'Logged out successfully.',
      });
    } finally { rr(); ri(); }
  });

  await t.test('second clearCookie failure escapes through asyncHandler', async () => {
    const order = [];
    const rr = patch('revokeSessionToken', async () => order.push('revoke'));
    const ri = patch('invalidateAccessToken', async () => assert.fail('no increment'));
    try {
      let forwarded;
      await controller.logout(
        req({ body: { refreshToken: 'tok' }, userInfo: { id: 'u' } }),
        res(order, true),
        (err) => { forwarded = err; },
      );
      assert.deepEqual(order, ['revoke', 'clear', 'clear']);
      assert.equal(forwarded.message, 'clear failed');
    } finally { rr(); ri(); }
  });
});
