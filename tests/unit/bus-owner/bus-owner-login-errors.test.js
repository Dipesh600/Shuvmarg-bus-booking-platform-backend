'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const AppError = require('../../../src/shared/errors/app-error');
const errors = require('../../../src/modules/bus-owner/auth/login/bus-owner-login.errors');

const assertError = (err, status, body) => {
  assert.ok(err instanceof AppError);
  assert.equal(err.statusCode, status);
  assert.deepEqual(err.responseBody, body);
};

test('bus-owner-login errors unit tests', async (t) => {
  await t.test('missingPhoneError is 400 with correct message and no errorCode', () => {
    const err = errors.missingPhoneError();
    assertError(err, 400, { success: false, message: 'Phone number is required.' });
    assert.equal(err.responseBody.errorCode, undefined);
  });

  await t.test('missingPasswordError is 400 with correct message and no errorCode', () => {
    const err = errors.missingPasswordError();
    assertError(err, 400, { success: false, message: 'Password is required.' });
    assert.equal(err.responseBody.errorCode, undefined);
  });

  await t.test('invalidCredentialsError is 401 with no errorCode', () => {
    const err = errors.invalidCredentialsError();
    assertError(err, 401, { success: false, message: 'Invalid phone number or password.' });
    assert.equal(err.responseBody.errorCode, undefined);
  });

  await t.test('deletedAccountError is 403 with ACCOUNT_DEACTIVATED', () => {
    const err = errors.deletedAccountError();
    assertError(err, 403, {
      success: false,
      message: 'This account has been deactivated. Please contact support.',
      errorCode: 'ACCOUNT_DEACTIVATED',
    });
  });

  await t.test('lockedAccountError is 429 with dynamic minutes and ACCOUNT_LOCKED', () => {
    const err = errors.lockedAccountError(3);
    assertError(err, 429, {
      success: false,
      message: 'Account temporarily locked due to too many failed attempts. Try again in 3 minute(s).',
      errorCode: 'ACCOUNT_LOCKED',
    });
  });

  await t.test('bannedAccountError is 403 with ACCOUNT_BANNED and preserves message', () => {
    const err = errors.bannedAccountError('Your account has been suspended. Reason: fraud');
    assertError(err, 403, {
      success: false,
      message: 'Your account has been suspended. Reason: fraud',
      errorCode: 'ACCOUNT_BANNED',
    });
  });

  await t.test('inactiveAccountError is 403 with ACCOUNT_INACTIVE and preserves message', () => {
    const err = errors.inactiveAccountError('Your account has been deactivated. Please contact support.');
    assertError(err, 403, {
      success: false,
      message: 'Your account has been deactivated. Please contact support.',
      errorCode: 'ACCOUNT_INACTIVE',
    });
  });

  await t.test('missingBusOwnerRoleError is 403 with ROLE_NOT_FOUND and exact message', () => {
    const err = errors.missingBusOwnerRoleError();
    assertError(err, 403, {
      success: false,
      message: "You don't have an operator account. Please register as a bus operator first.",
      errorCode: 'ROLE_NOT_FOUND',
    });
  });

  await t.test('invalidPasswordAttemptsError is 401 with dynamic remaining and no errorCode', () => {
    const err = errors.invalidPasswordAttemptsError(2);
    assertError(err, 401, {
      success: false,
      message: 'Invalid phone number or password. 2 attempt(s) remaining.',
    });
    assert.equal(err.responseBody.errorCode, undefined);
  });

  await t.test('newlyLockedAccountError is 401 with no errorCode', () => {
    const err = errors.newlyLockedAccountError();
    assertError(err, 401, {
      success: false,
      message: 'Too many failed attempts. Account locked for 15 minutes.',
    });
    assert.equal(err.responseBody.errorCode, undefined);
  });
});
