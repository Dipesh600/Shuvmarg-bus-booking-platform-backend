'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const AppError = require('../../../src/shared/errors/app-error');
const errors = require('../../../src/modules/agent/auth/session/agent-session.errors');

test('agent-session refresh error mappings are exact', () => {
  const cases = [
    ['INVALID_REFRESH_TOKEN', 401, 'Session expired. Please sign in again.'],
    ['REFRESH_TOKEN_EXPIRED', 401, 'Session expired. Please sign in again.'],
    ['ACCOUNT_BANNED', 403, 'Your account has been suspended.'],
    ['ROLE_REVOKED', 403, 'Access revoked. Please contact support.'],
    ['SESSION_ROLE_MISMATCH', 401, 'This session belongs to another portal. Please sign in again.'],
    ['UNKNOWN', 401, 'Session could not be renewed. Please sign in again.'],
  ];

  for (const [message, statusCode, responseMessage] of cases) {
    const cause = new Error(message);
    const mapped = errors.mapRefreshError(cause);
    assert.equal(mapped.statusCode, statusCode);
    assert.deepEqual(mapped.responseBody, {
      success: false,
      message: responseMessage,
      ...(['ROLE_REVOKED', 'SESSION_ROLE_MISMATCH'].includes(message) && { errorCode: message }),
    });
    assert.equal(mapped.cause, cause);
  }

  const appError = new AppError('kept', 499, { success: false, message: 'kept' });
  assert.equal(errors.mapRefreshError(appError), appError);
});
