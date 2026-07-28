'use strict';

/**
 * tests/unit/auth/passenger-otp-errors.test.js
 *
 * Safe-error response boundary tests for passenger-otp-auth.errors.js.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const errors = require('../../../src/modules/auth/passenger-otp-auth/passenger-otp-auth.errors');

test('passenger-otp-auth errors — safe error response boundary', async (t) => {
  await t.test('unexpectedPassengerStateError responseBody omits detail and cause', () => {
    const err = errors.unexpectedPassengerStateError('internal secret diagnostic info');

    assert.equal(err.statusCode, 500);
    assert.equal(err.responseBody.errorCode, 'UNEXPECTED_PASSENGER_STATE');
    assert.equal(err.responseBody.detail, undefined, 'responseBody must not leak detail');
    assert.equal(err.responseBody.cause, undefined, 'responseBody must not leak cause');
    assert.ok(err.cause instanceof Error, 'internal cause should remain on error object instance');
    assert.equal(err.cause.message, 'internal secret diagnostic info');
  });

  await t.test('accountRestrictedError responseBody omits contact, phone, and email', () => {
    const err = errors.accountRestrictedError();

    assert.equal(err.statusCode, 403);
    assert.equal(err.responseBody.errorCode, 'ACCOUNT_RESTRICTED');
    assert.equal(err.responseBody.contact, undefined, 'responseBody must not contain contact');
    assert.equal(err.responseBody.phone, undefined, 'responseBody must not contain phone');
    assert.equal(err.responseBody.email, undefined, 'responseBody must not contain email');
    assert.deepEqual(err.responseBody, {
      success: false,
      message: 'This account is not eligible for authentication. Please contact support.',
      errorCode: 'ACCOUNT_RESTRICTED',
    });
  });
});
