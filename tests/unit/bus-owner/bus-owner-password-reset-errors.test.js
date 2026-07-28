'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const errors = require('../../../src/modules/bus-owner/auth/password-reset/bus-owner-password-reset.errors');

const shape = (error) => [error.statusCode, error.responseBody];

test('bus-owner password-reset errors preserve exact contracts', () => {
  assert.deepEqual(shape(errors.missingPhoneError()), [400, {
    success: false, message: 'Phone number is required.',
  }]);
  assert.deepEqual(shape(errors.missingVerifyInputError()), [400, {
    success: false, message: 'Phone and OTP are required!',
  }]);
  assert.deepEqual(shape(errors.missingResetInputError()), [400, {
    success: false, message: 'Phone, OTP, and new password are required.',
  }]);
  assert.deepEqual(shape(errors.invalidOtpLengthError()), [400, {
    success: false, message: 'Verification code must be 6 digits.',
  }]);
  assert.deepEqual(shape(errors.invalidOtpError('bad otp')), [400, {
    success: false, message: 'bad otp',
  }]);
  assert.deepEqual(shape(errors.invalidResetTargetError()), [400, {
    success: false, message: 'Invalid OTP or phone number.',
  }]);
  assert.deepEqual(shape(errors.invalidBusOwnerOtpError()), [400, {
    success: false, message: 'Invalid or expired verification code.',
  }]);
  assert.deepEqual(shape(errors.invalidPasswordError({ message: 'weak' })), [400, {
    success: false, message: 'weak',
  }]);
  assert.deepEqual(shape(errors.suspendedAccountError()), [403, {
    success: false,
    message: 'This account has been suspended. Please contact support.',
    errorCode: 'ACCOUNT_SUSPENDED',
  }]);
  assert.deepEqual(shape(errors.otpBlockedError(4)), [429, {
    success: false,
    message: 'Too many OTP requests. Please wait 4 minute(s) before trying again.',
    errorCode: 'OTP_SEND_BLOCKED',
    retryAfterMinutes: 4,
  }]);
});
