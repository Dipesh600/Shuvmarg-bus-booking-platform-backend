'use strict';

const AppError = require('../../../../shared/errors/app-error');

const bodyError = (message, statusCode, extra = {}) => new AppError(
  message,
  statusCode,
  { success: false, message, ...extra },
);

const missingPhoneError = () => bodyError('Phone number is required.', 400);
const missingVerifyInputError = () => bodyError('Phone and OTP are required!', 400);
const missingResetInputError = () =>
  bodyError('Phone, OTP, and new password are required.', 400);
const invalidOtpLengthError = () => bodyError('Verification code must be 6 digits.', 400);
const invalidOtpError = (message) => bodyError(message, 400);
const invalidResetTargetError = () => bodyError('Invalid OTP or phone number.', 400);
const invalidBusOwnerOtpError = () => bodyError('Invalid or expired verification code.', 400);
const invalidPasswordError = (validation) => bodyError(validation.message, 400);
const suspendedAccountError = () => bodyError(
  'This account has been suspended. Please contact support.',
  403,
  { errorCode: 'ACCOUNT_SUSPENDED' },
);
const otpBlockedError = (minutes) => bodyError(
  `Too many OTP requests. Please wait ${minutes} minute(s) before trying again.`,
  429,
  { errorCode: 'OTP_SEND_BLOCKED', retryAfterMinutes: minutes },
);
const otpCooldownError = (seconds) => bodyError(
  `Please wait ${seconds} second(s) before requesting a new OTP.`,
  429,
  { errorCode: 'OTP_COOLDOWN', retryAfterSeconds: seconds },
);

const accountNotFoundError = () => bodyError(
  'No bus owner account found with this phone number.',
  404,
  { code: 'ACCOUNT_NOT_FOUND' },
);

module.exports = {
  missingPhoneError,
  accountNotFoundError,
  missingVerifyInputError,
  missingResetInputError,
  invalidOtpLengthError,
  invalidOtpError,
  invalidResetTargetError,
  invalidBusOwnerOtpError,
  invalidPasswordError,
  suspendedAccountError,
  otpBlockedError,
  otpCooldownError,
};
