'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const AppError = require('../../../src/shared/errors/app-error');
const errors = require('../../../src/modules/agent/auth/password-reset/agent-password-reset.errors');

const assertErr = (err, statusCode, body) => {
  assert.equal(err instanceof AppError, true);
  assert.equal(err.statusCode, statusCode);
  assert.deepEqual(err.responseBody, body);
};

test('agent password reset error factories preserve exact contracts', async (t) => {
  await t.test('validation and target errors', () => {
    assertErr(errors.missingPhoneError(), 400, { success: false, message: 'Phone number is required.' });
    assertErr(errors.missingVerifyInputError(), 400, { success: false, message: 'Phone and OTP are required.' });
    assertErr(errors.missingResetInputError(), 400, { success: false, message: 'Phone, OTP, and new password are required.' });
    assertErr(errors.invalidOtpLengthError(), 400, { success: false, message: 'Verification code must be 6 digits.' });
    assertErr(errors.invalidResetTargetError(), 400, { success: false, message: 'Invalid OTP or phone number.' });
    assertErr(errors.invalidAgentOtpError(), 400, { success: false, message: 'Invalid or expired verification code.' });
  });

  await t.test('dynamic expected errors', () => {
    assertErr(errors.invalidOtpError('bad'), 400, { success: false, message: 'bad' });
    assertErr(errors.invalidPasswordError({ errors: ['weak'], message: 'fallback' }), 400, { success: false, message: 'weak' });
    assertErr(errors.otpBlockedError(5), 429, {
      success: false,
      message: 'Too many OTP requests. Please wait 5 minute(s) before trying again.',
      errorCode: 'OTP_SEND_BLOCKED',
      retryAfterMinutes: 5,
    });
  });
});
