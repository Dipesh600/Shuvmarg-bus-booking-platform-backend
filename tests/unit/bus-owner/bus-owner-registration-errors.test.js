'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const errors = require('../../../src/modules/bus-owner/auth/registration/bus-owner-registration.errors');

const body = (factory) => {
  const err = factory();
  return [err.statusCode, err.responseBody];
};

test('bus-owner registration errors preserve exact contracts', async (t) => {
  await t.test('core validation errors', () => {
    assert.deepEqual(body(errors.missingPhoneError), [400, {
      success: false,
      message: 'Phone number is required.',
    }]);
    assert.deepEqual(body(errors.invalidNepalPhoneError), [400, {
      success: false,
      message: 'Please enter a valid Nepal mobile number.',
    }]);
    assert.deepEqual(body(errors.roleAlreadyRegisteredError), [409, {
      success: false,
      message: 'This mobile number is already registered as a bus operator.',
      errorCode: 'ROLE_ALREADY_REGISTERED',
    }]);
  });

  await t.test('registration and OTP-specific errors', () => {
    assert.deepEqual(body(() => errors.missingRegistrationFieldError('Company name')), [400, {
      success: false,
      message: 'Company name is required.',
    }]);
    assert.deepEqual(body(errors.phoneNotVerifiedError), [400, {
      success: false,
      message: 'Phone not verified. Please complete OTP verification first.',
    }]);
    assert.deepEqual(body(errors.otpExpiredError), [400, {
      success: false,
      message: 'OTP verification has expired. Please verify your phone again.',
    }]);
    assert.deepEqual(body(() => errors.otpSendBlockedError(6)), [429, {
      success: false,
      message: 'Too many OTP requests. Please wait 6 minute(s) before trying again.',
      errorCode: 'OTP_SEND_BLOCKED',
      retryAfterMinutes: 6,
    }]);
  });

  await t.test('password and duplicate errors', () => {
    assert.deepEqual(body(errors.missingNewPasswordError), [400, {
      success: false,
      message: 'Password is required for new registration.',
    }]);
    assert.deepEqual(body(() => errors.invalidPasswordError({ errors: ['first', 'second'] })), [400, {
      success: false,
      message: 'first',
      errors: ['first', 'second'],
    }]);
    assert.deepEqual(body(() => errors.duplicateKeyError('Email is already registered.')), [409, {
      success: false,
      message: 'Email is already registered.',
    }]);
  });
});
