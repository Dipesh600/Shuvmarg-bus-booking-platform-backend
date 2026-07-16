'use strict';
/**
 * Unit tests for login.service.js
 *
 * Tests validate the service layer in isolation using in-process monkey-patching.
 * No real DB connection is needed — the repository is patched before each case.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const loginService = require('../../../src/modules/auth/login/login.service');
const loginRepository = require('../../../src/modules/auth/login/login.repository');
const AppError = require('../../../src/shared/errors/app-error');

// ─── helper: store original and restore after test ───────────────────────────
let _original;
function patchRepo(method, impl) {
  _original = loginRepository[method];
  loginRepository[method] = impl;
}
function restoreRepo(method) {
  loginRepository[method] = _original;
  _original = undefined;
}

// ─── missing-field validation lives in the service ───────────────────────────

test('Service: authenticate — missing emailOrPhone throws 400 AppError', async () => {
  const err = await loginService
    .authenticate({ emailOrPhone: '', password: 'x', appSource: '', deviceInfo: null, ipAddress: null })
    .catch(e => e);

  assert.ok(err instanceof AppError);
  assert.equal(err.statusCode, 400);
  assert.deepEqual(err.responseBody, { success: false, message: 'Email or Phone is required!' });
});

test('Service: authenticate — missing password throws 400 AppError', async () => {
  const err = await loginService
    .authenticate({ emailOrPhone: '9800000000', password: '', appSource: '', deviceInfo: null, ipAddress: null })
    .catch(e => e);

  assert.ok(err instanceof AppError);
  assert.equal(err.statusCode, 400);
  assert.deepEqual(err.responseBody, { success: false, message: 'Password is required!' });
});

// ─── unexpected repository rejection → wrapped AppError(500) ─────────────────

test('Service: authenticate — unexpected repository error wraps to AppError 500', async () => {
  const boom = new Error('DB exploded');

  patchRepo('findUserByEmailOrPhone', async () => { throw boom; });

  try {
    const err = await loginService
      .authenticate({ emailOrPhone: '9800000000', password: 'pw', appSource: '', deviceInfo: null, ipAddress: null })
      .catch(e => e);

    assert.ok(err instanceof AppError, 'result must be an AppError');
    assert.equal(err.statusCode, 500);
    assert.deepEqual(err.responseBody, {
      success: false,
      message: 'Internal Server Error',
    });
    assert.equal(err.cause, boom, 'original error must be stored as .cause');
  } finally {
    restoreRepo('findUserByEmailOrPhone');
  }
});
