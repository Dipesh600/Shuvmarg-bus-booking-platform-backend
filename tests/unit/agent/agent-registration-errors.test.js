'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const errors = require('../../../src/modules/agent/auth/registration/agent-registration.errors');

test('agent-registration errors preserve exact contracts', () => {
  for (const [factory, statusCode, body] of [
    [errors.missingPhoneError, 400, { success: false, message: 'Phone number is required.' }],
    [errors.invalidNepalPhoneError, 400, { success: false, message: 'Please enter a valid Nepal mobile number.' }],
    [errors.missingVerifyInputError, 400, { success: false, message: 'Phone number and verification code are required.' }],
    [errors.invalidOtpLengthError, 400, { success: false, message: 'Verification code must be 6 digits.' }],
    [errors.phoneNotVerifiedError, 400, { success: false, message: 'Phone not verified. Please complete OTP verification first.' }],
    [errors.otpExpiredError, 400, { success: false, message: 'OTP verification has expired. Please verify your phone again.' }],
    [errors.missingUpgradePasswordError, 400, { success: false, message: 'Password is required.' }],
    [errors.missingNewPasswordError, 400, { success: false, message: 'Password is required for new registration.' }],
    [errors.duplicateEmailError, 409, { success: false, message: 'This email address is already registered.' }],
    [errors.resendExistingAgentError, 409, {
      success: false,
      message: 'This mobile number is already registered as an agent.',
      errorCode: 'ROLE_ALREADY_REGISTERED',
    }],
  ]) {
    const err = factory();
    assert.equal(err.statusCode, statusCode);
    assert.deepEqual(err.responseBody, body);
  }
  assert.deepEqual(errors.otpSendBlockedError(6).responseBody, {
    success: false,
    message: 'Too many OTP requests. Please wait 6 minute(s) before trying again.',
    errorCode: 'OTP_SEND_BLOCKED',
    retryAfterMinutes: 6,
  });
  assert.deepEqual(errors.invalidPasswordError({ errors: ['first', 'second'] }).responseBody, {
    success: false,
    message: 'first',
    errors: ['first', 'second'],
  });
});
