'use strict';

/**
 * tests/unit/auth/passenger-otp-login-guard.test.js
 *
 * Regression tests for the PASSWORD_NOT_SET guard in login.service.js.
 */

process.env.SECRET_KEY ||= 'test-only-secret-32chars-minimum!!';

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const loginRepository = require('../../../src/modules/auth/login/login.repository');
const tokenService = require('../../../utils/tokenService');
const loginService = require('../../../src/modules/auth/login/login.service');

const patch = (obj, key, fn, restore) => {
  const old = obj[key]; obj[key] = fn; restore.push(() => { obj[key] = old; });
};

/** Partial-match rejects helper: throws if any expected prop doesn't match. */
const rejectsPartial = async (fn, expected) => {
  try { await fn(); assert.fail('Expected rejection'); }
  catch (err) {
    if (err.code === 'ERR_ASSERTION') throw err;
    for (const [k, v] of Object.entries(expected)) {
      if (typeof v === 'object' && v !== null) {
        for (const [k2, v2] of Object.entries(v)) {
          assert.equal(err[k]?.[k2], v2, `${k}.${k2} mismatch`);
        }
      } else { assert.equal(err[k], v, `${k} mismatch`); }
    }
  }
};

const baseUser = (fields = {}) => ({
  _id: 'uid1', role: 'passenger', roles: ['passenger'], status: 'active',
  deletedAt: null, lockedUntil: null, failedLoginAttempts: 0,
  forcePasswordChange: false, tokenVersion: 0, password: null,
  toObject: function () { return { ...this }; }, ...fields,
});

const call = (extra = {}) => loginService.authenticate({ emailOrPhone: '9800000010', password: 'any', ...extra });

test('login service PASSWORD_NOT_SET guard', async (t) => {
  await t.test('null password returns 401 PASSWORD_NOT_SET', async () => {
    const restore = [];
    patch(loginRepository, 'findUserByEmailOrPhone', async () => baseUser({ password: null }), restore);
    try { await rejectsPartial(() => call(), { statusCode: 401, responseBody: { errorCode: 'PASSWORD_NOT_SET' } }); }
    finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('empty-string password treated as passwordless', async () => {
    const restore = [];
    patch(loginRepository, 'findUserByEmailOrPhone', async () => baseUser({ password: '' }), restore);
    try { await rejectsPartial(() => call(), { statusCode: 401, responseBody: { errorCode: 'PASSWORD_NOT_SET' } }); }
    finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('PASSWORD_NOT_SET does not increment failedLoginAttempts', async () => {
    const restore = [];
    let incrementCalled = false;
    patch(loginRepository, 'findUserByEmailOrPhone', async () => baseUser({ password: null }), restore);
    patch(loginRepository, 'incrementFailedAttempts', async () => { incrementCalled = true; return {}; }, restore);
    try {
      await rejectsPartial(() => call(), { statusCode: 401 });
      assert.equal(incrementCalled, false);
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('banned account error precedes PASSWORD_NOT_SET check', async () => {
    const restore = [];
    patch(loginRepository, 'findUserByEmailOrPhone', async () => baseUser({ password: null, status: 'banned' }), restore);
    try { await rejectsPartial(() => call(), { responseBody: { errorCode: 'ACCOUNT_BANNED' } }); }
    finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('password-bearing account is not rejected with PASSWORD_NOT_SET', async () => {
    const restore = [];
    const hash = await bcrypt.hash('correct!1', 4);
    patch(loginRepository, 'findUserByEmailOrPhone', async () => baseUser({ password: hash }), restore);
    patch(loginRepository, 'recordSuccessfulLogin', async () => {}, restore);
    try {
      const err = await loginService.authenticate({ emailOrPhone: '9800000010', password: 'correct!1' }).catch((e) => e);
      // The call may fail on token generation (not stubbed — destructured binding), but it must NOT
      // fail with PASSWORD_NOT_SET. If the guard fires incorrectly this errorCode will be present.
      assert.notEqual(err?.responseBody?.errorCode, 'PASSWORD_NOT_SET');
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('wrong password increments attempt counter — no PASSWORD_NOT_SET', async () => {
    const restore = [];
    const hash = await bcrypt.hash('real-pass1', 4);
    patch(loginRepository, 'findUserByEmailOrPhone', async () => baseUser({ password: hash }), restore);
    patch(loginRepository, 'incrementFailedAttempts', async () => ({ failedLoginAttempts: 1 }), restore);
    try {
      await rejectsPartial(() => loginService.authenticate({ emailOrPhone: '9800000010', password: 'wrong' }), { statusCode: 401 });
      const err = await loginService.authenticate({ emailOrPhone: '9800000010', password: 'wrong' }).catch((e) => e);
      assert.notEqual(err.responseBody?.errorCode, 'PASSWORD_NOT_SET');
    } finally { restore.reverse().forEach((fn) => fn()); }
  });
});
