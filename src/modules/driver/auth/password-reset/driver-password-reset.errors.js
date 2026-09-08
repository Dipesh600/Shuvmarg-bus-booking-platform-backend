'use strict';

const AppError = require('../../../../shared/errors/app-error');

const bodyError = (message, statusCode, extra = {}) => new AppError(
  message,
  statusCode,
  { success: false, message, ...extra },
);

const missingPhone = () => bodyError('Phone number is required.', 400);
const missingVerifyInput = () => bodyError('Phone and OTP are required.', 400);
const missingResetInput = () =>
  bodyError('Phone, OTP, and new password are required.', 400);
const invalidOtpLength = () => bodyError('Verification code must be 6 digits.', 400);
const invalidOtp = () => bodyError('Invalid or expired verification code.', 400);
const invalidResetTarget = () => bodyError('Invalid OTP or phone number.', 400);
const driverAccountNotFound = () => bodyError(
  'No Driver account was found for this phone number.',
  404,
  { errorCode: 'DRIVER_ACCOUNT_NOT_FOUND' },
);
const driverAccountInvited = () => bodyError(
  'This Driver account is still invited. Use Set up invited account first.',
  409,
  { errorCode: 'DRIVER_ACCOUNT_INVITED' },
);
const driverAccountUnavailable = () => bodyError(
  'This Driver account is not active. Contact your operator for access.',
  409,
  { errorCode: 'DRIVER_ACCOUNT_UNAVAILABLE' },
);
const smsDeliveryFailed = () => bodyError(
  'The SMS service could not send the code. Please try again later.',
  502,
  { errorCode: 'SMS_DELIVERY_FAILED' },
);
const invalidPassword = (validation) => bodyError(
  validation.errors?.[0] || validation.message,
  400,
);
const otpBlocked = (minutes) => bodyError(
  `Too many OTP requests. Please wait ${minutes} minute(s) before trying again.`,
  429,
  { errorCode: 'OTP_SEND_BLOCKED', retryAfterMinutes: minutes },
);
const otpCooldown = (seconds) => bodyError(
  `Please wait ${seconds} second(s) before requesting a new OTP.`,
  429,
  { errorCode: 'OTP_COOLDOWN', retryAfterSeconds: seconds },
);

module.exports = {
  missingPhone,
  missingVerifyInput,
  missingResetInput,
  invalidOtpLength,
  invalidOtp,
  invalidResetTarget,
  driverAccountNotFound,
  driverAccountInvited,
  driverAccountUnavailable,
  smsDeliveryFailed,
  invalidPassword,
  otpBlocked,
  otpCooldown,
};
