'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../../../src/modules/agent/auth/session/agent-session.service');
const controller = require('../../../src/modules/agent/auth/session/agent-session.controller');

const req = (extra = {}) => ({
  cookies: extra.cookies || {},
  body: extra.body,
  userInfo: extra.userInfo,
});

const res = (order = [], fail = {}) => {
  const state = { clears: [], statusCode: null, body: null };
  return {
    state,
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

test('agent-session controller preserves logout ordering and fallback behavior', async (t) => {
  await t.test('normal path is revoke, clear cookie, increment, respond', async () => {
    const order = [];
    const restoreRevoke = patch('revokeSessionToken', async (tok) => order.push(`revoke:${tok}`));
    const restoreInc = patch('invalidateAccessToken', async (id) => order.push(`increment:${id}`));
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
      assert.equal(r.state.statusCode, 200);
      assert.deepEqual(r.state.body, { success: true, message: 'Logged out successfully.' });
    } finally { restoreRevoke(); restoreInc(); }
  });

  await t.test('skips revoke when token absent and skips increment when userId absent', async () => {
    const order = [];
    const restoreRevoke = patch('revokeSessionToken', async () => assert.fail('no revoke'));
    const restoreInc = patch('invalidateAccessToken', async () => assert.fail('no increment'));
    try {
      const r = res(order);
      await controller.logout(req(), r, assert.fail);
      assert.deepEqual(order, ['clear']);
      assert.deepEqual(r.state.body, { success: true, message: 'Logged out successfully.' });
    } finally { restoreRevoke(); restoreInc(); }
  });

  await t.test('revoke failure stops increment and returns fallback 200', async () => {
    const order = [];
    const restoreRevoke = patch('revokeSessionToken', async () => {
      order.push('revoke');
      throw new Error('revoke');
    });
    const restoreInc = patch('invalidateAccessToken', async () => assert.fail('no increment'));
    try {
      const r = res(order);
      await controller.logout(req({ body: { refreshToken: 'tok' }, userInfo: { id: 'u' } }), r, assert.fail);
      assert.deepEqual(order, ['revoke', 'clear']);
      assert.equal(r.state.statusCode, 200);
      assert.deepEqual(r.state.body, { success: true, message: 'Logged out.' });
    } finally { restoreRevoke(); restoreInc(); }
  });

  await t.test('increment failure clears once normally, once in catch, and returns fallback', async () => {
    const order = [];
    const restoreRevoke = patch('revokeSessionToken', async () => order.push('revoke'));
    const restoreInc = patch('invalidateAccessToken', async () => {
      order.push('increment');
      throw new Error('inc');
    });
    try {
      const r = res(order);
      await controller.logout(req({ body: { refreshToken: 'tok' }, userInfo: { id: 'u' } }), r, assert.fail);
      assert.deepEqual(order, ['revoke', 'clear', 'increment', 'clear']);
      assert.deepEqual(r.state.body, { success: true, message: 'Logged out.' });
    } finally { restoreRevoke(); restoreInc(); }
  });

  await t.test('normal clearCookie failure stops increment and still returns fallback', async () => {
    const order = [];
    const restoreRevoke = patch('revokeSessionToken', async () => order.push('revoke'));
    const restoreInc = patch('invalidateAccessToken', async () => assert.fail('no increment'));
    try {
      const r = res(order, { clear: true });
      await controller.logout(req({ body: { refreshToken: 'tok' }, userInfo: { id: 'u' } }), r, assert.fail);
      assert.deepEqual(order, ['revoke', 'clear', 'clear']);
      assert.deepEqual(r.state.body, { success: true, message: 'Logged out.' });
    } finally { restoreRevoke(); restoreInc(); }
  });
});
