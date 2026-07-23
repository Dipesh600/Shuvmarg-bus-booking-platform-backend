'use strict';

/**
 * src/modules/auth/passenger-otp-auth/passenger-otp-auth.errors.js
 *
 * AppError factories for the passenger OTP authentication flow.
 */

const AppError = require('../../../shared/errors/app-error');

const missingPhoneError = () =>
  new AppError('Phone number is required.', 400, {
    success: false,
    message: 'Phone number is required.',
    errorCode: 'MISSING_PHONE',
  });

const invalidPhoneError = () =>
  new AppError('Please enter a valid Nepal mobile number (97 or 98 series).', 400, {
    success: false,
    message: 'Please enter a valid Nepal mobile number (97 or 98 series).',
    errorCode: 'INVALID_PHONE',
  });

const missingVerifyInputError = () =>
  new AppError('Phone number and OTP are required.', 400, {
    success: false,
    message: 'Phone number and OTP are required.',
    errorCode: 'MISSING_VERIFY_INPUT',
  });

const invalidOtpLengthError = () =>
  new AppError('OTP must be exactly 6 digits.', 400, {
    success: false,
    message: 'OTP must be exactly 6 digits.',
    errorCode: 'INVALID_OTP_LENGTH',
  });

const invalidOtpError = (detail) =>
  new AppError(detail || 'Invalid OTP.', 400, {
    success: false,
    message: detail || 'Invalid OTP.',
    errorCode: 'INVALID_OTP',
  });

const otpSendBlockedError = (minutes) =>
  new AppError(`OTP sending is blocked. Try again in ${minutes} minute(s).`, 429, {
    success: false,
    message: `OTP sending is blocked. Try again in ${minutes} minute(s).`,
    errorCode: 'OTP_SEND_BLOCKED',
    retryAfterMinutes: minutes,
  });

const otpSendCooldownError = (seconds) =>
  new AppError(`Please wait ${seconds} second(s) before requesting a new code.`, 429, {
    success: false,
    message: `Please wait ${seconds} second(s) before requesting a new code.`,
    errorCode: 'OTP_SEND_COOLDOWN',
    retryAfterSeconds: seconds,
  });

const forcePasswordChangeError = () =>
  new AppError(
    'You must set a new password before continuing. Please use the password-setup flow.',
    403,
    {
      success: false,
      message: 'You must set a new password before continuing. Please use the password-setup flow.',
      errorCode: 'FORCE_PASSWORD_CHANGE',
    },
  );

const unexpectedPassengerStateError = (detail) =>
  new AppError(
    'Passenger account state is invalid. Please contact support.',
    500,
    {
      success: false,
      message: 'Passenger account state is invalid. Please contact support.',
      errorCode: 'UNEXPECTED_PASSENGER_STATE',
    },
    'UNEXPECTED_PASSENGER_STATE',
    detail ? new Error(detail) : null,
  );

const accountRestrictedError = () =>
  new AppError('This account is not eligible for authentication. Please contact support.', 403, {
    success: false,
    message: 'This account is not eligible for authentication. Please contact support.',
    errorCode: 'ACCOUNT_RESTRICTED',
  });

module.exports = {
  missingPhoneError,
  invalidPhoneError,
  missingVerifyInputError,
  invalidOtpLengthError,
  invalidOtpError,
  otpSendBlockedError,
  otpSendCooldownError,
  forcePasswordChangeError,
  unexpectedPassengerStateError,
  accountRestrictedError,
};
