'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const errors = require('../../../src/modules/agent/auth/login/agent-login.errors');

test('agent-login errors preserve exact contracts', () => {
  const cases = [
    [errors.missingPhoneError(), 400, { success: false, message: 'Phone number is required.' }],
    [errors.missingPasswordError(), 400, { success: false, message: 'Password is required.' }],
    [errors.invalidCredentialsError(), 401, { success: false, message: 'Invalid phone number or password.' }],
    [errors.deletedAccountError(), 403, {
      success: false,
      message: 'This account has been deactivated. Please contact support.',
      errorCode: 'ACCOUNT_DEACTIVATED',
    }],
    [errors.lockedAccountError(2), 429, {
      success: false,
      message: 'Account temporarily locked due to too many failed attempts. Try again in 2 minute(s).',
      errorCode: 'ACCOUNT_LOCKED',
    }],
    [errors.missingAgentRoleError(), 403, {
      success: false,
      message: "You don't have an agent account. Please register as an agent first.",
      errorCode: 'ROLE_NOT_FOUND',
    }],
    [errors.invalidPasswordAttemptsError(1), 401, {
      success: false,
      message: 'Invalid phone number or password. 1 attempt(s) remaining.',
    }],
    [errors.newlyLockedAccountError(), 401, {
      success: false,
      message: 'Too many failed attempts. Account locked for 15 minutes.',
    }],
  ];
  for (const [err, statusCode, body] of cases) {
    assert.equal(err.statusCode, statusCode);
    assert.deepEqual(err.responseBody, body);
  }
  assert.deepEqual(errors.bannedAccountError('m').responseBody, {
    success: false,
    message: 'm',
    errorCode: 'ACCOUNT_BANNED',
  });
  assert.deepEqual(errors.inactiveAccountError('m').responseBody, {
    success: false,
    message: 'm',
    errorCode: 'ACCOUNT_INACTIVE',
  });
});
