'use strict';
/**
 * Unit tests for login.service.js
 *
 * Tests run in-process using monkey-patching — no real DB connection needed.
 * Each patch() call returns a dedicated restore function so patches never bleed.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

const loginService = require('../../../src/modules/auth/login/login.service');
const loginRepository = require('../../../src/modules/auth/login/login.repository');
const AppError = require('../../../src/shared/errors/app-error');

// ─── Patch helper — returns its own restore function ─────────────────────────

function patch(target, method, impl) {
  const original = target[method];
  target[method] = impl;
  return () => { target[method] = original; };
}

// ─── Minimal valid-user fixture ───────────────────────────────────────────────

const PLAIN_PW = 'TestPassword123!';
let hashedPw;  // populated once at module load, synchronously safe for tests

// bcrypt is async — obtain the hash before any test runs
const hashReady = bcrypt.hash(PLAIN_PW, 1).then(h => { hashedPw = h; });

function makeUser(overrides = {}) {
  return {
    _id: 'user-id-001',
    phone: '9800000000',
    get password() { return hashedPw; },
    status: 'active',
    role: 'passenger',
    roles: ['passenger'],
    deletedAt: null,
    lockedUntil: null,
    forcePasswordChange: false,
    ...overrides,
  };
}

// ─── Input validation ─────────────────────────────────────────────────────────

test('Service: missing emailOrPhone → AppError 400', async () => {
  await hashReady;
  const err = await loginService
    .authenticate({ emailOrPhone: '', password: 'x', appSource: '', deviceInfo: null, ipAddress: null })
    .catch(e => e);

  assert.ok(err instanceof AppError);
  assert.equal(err.statusCode, 400);
  assert.deepEqual(err.responseBody, { success: false, message: 'Email or Phone is required!' });
});

test('Service: missing password → AppError 400', async () => {
  await hashReady;
  const err = await loginService
    .authenticate({ emailOrPhone: '9800000000', password: '', appSource: '', deviceInfo: null, ipAddress: null })
    .catch(e => e);

  assert.ok(err instanceof AppError);
  assert.equal(err.statusCode, 400);
  assert.deepEqual(err.responseBody, { success: false, message: 'Password is required!' });
});

// ─── Early-stage failure (lookup) ────────────────────────────────────────────

test('Service: repo lookup explosion → AppError 500 with .cause', async () => {
  await hashReady;
  const boom = new Error('DB exploded');
  const restore = patch(loginRepository, 'findUserByEmailOrPhone', async () => { throw boom; });

  try {
    const err = await loginService
      .authenticate({ emailOrPhone: '9800000000', password: PLAIN_PW, appSource: '', deviceInfo: null, ipAddress: null })
      .catch(e => e);

    assert.ok(err instanceof AppError, 'must be AppError');
    assert.equal(err.statusCode, 500);
    assert.deepEqual(err.responseBody, { success: false, message: 'Internal Server Error' });
    assert.equal(err.cause, boom);
  } finally {
    restore();
  }
});

// ─── Late-stage failure (recordSuccessfulLogin) ───────────────────────────────

test('Service: recordSuccessfulLogin explosion → AppError 500 with .cause', async () => {
  await hashReady;
  const boom = new Error('write failed');

  const restoreLookup = patch(loginRepository, 'findUserByEmailOrPhone', async () => makeUser());
  const restoreRecord = patch(loginRepository, 'recordSuccessfulLogin', async () => { throw boom; });

  try {
    const err = await loginService
      .authenticate({ emailOrPhone: '9800000000', password: PLAIN_PW, appSource: '', deviceInfo: null, ipAddress: null })
      .catch(e => e);

    assert.ok(err instanceof AppError, 'must be AppError');
    assert.equal(err.statusCode, 500);
    assert.deepEqual(err.responseBody, { success: false, message: 'Internal Server Error' });
    assert.equal(err.cause, boom, 'original error must be retained as .cause');
  } finally {
    restoreLookup();
    restoreRecord();
  }
});
