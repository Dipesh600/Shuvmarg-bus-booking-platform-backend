'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const AppError = require('../../../src/shared/errors/app-error');
const errors = require('../../../src/modules/bus-owner/auth/session/bus-owner-session.errors');

test('bus-owner session refresh errors preserve exact mappings', () => {
  const cases = [
    ['INVALID_REFRESH_TOKEN', 401, 'Session expired. Please sign in again.'],
    ['REFRESH_TOKEN_EXPIRED', 401, 'Session expired. Please sign in again.'],
    ['ACCOUNT_BANNED', 403, 'Your account has been suspended.'],
    ['ROLE_REVOKED', 403, 'Access revoked. Please contact support.'],
    ['UNKNOWN', 401, 'Session could not be renewed. Please sign in again.'],
  ];

  for (const [message, statusCode, responseMessage] of cases) {
    const cause = new Error(message);
    const mapped = errors.mapRefreshError(cause);
    assert.equal(mapped.statusCode, statusCode);
    assert.deepEqual(mapped.responseBody, {
      success: false,
      message: responseMessage,
    });
    assert.equal(mapped.cause, cause);
  }

  const missing = errors.missingRefreshTokenError();
  assert.equal(missing.statusCode, 401);
  assert.deepEqual(missing.responseBody, {
    success: false,
    message: 'Session expired. Please sign in again.',
  });

  const appError = new AppError('kept', 499, { success: false, message: 'kept' });
  assert.equal(errors.mapRefreshError(appError), appError);
});
