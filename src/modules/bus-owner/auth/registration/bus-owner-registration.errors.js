'use strict';

const AppError = require('../../../../shared/errors/app-error');

const bodyError = (message, statusCode, extra = {}) => new AppError(
  message,
  statusCode,
  { success: false, message, ...extra },
);

const missingPhoneError = () => bodyError('Phone number is required.', 400);
const invalidNepalPhoneError = () => bodyError('Please enter a valid Nepal mobile number.', 400);
const missingVerifyInputError = () =>
  bodyError('Phone number and verification code are required.', 400);
const invalidOtpLengthError = () => bodyError('Verification code must be 6 digits.', 400);
const invalidOtpError = (message) => bodyError(message, 400);
const roleAlreadyRegisteredError = () => bodyError(
  'This mobile number is already registered as a bus operator.',
  409,
  { errorCode: 'ROLE_ALREADY_REGISTERED' },
);
const missingRegistrationFieldError = (field) => bodyError(`${field} is required.`, 400);
const shortNameError = () => bodyError('Name must be at least 3 characters.', 400);
const shortCompanyNameError = () => bodyError('Company name must be at least 3 characters.', 400);
const verificationTokenError = (message) => bodyError(message, 400);
const phoneNotVerifiedError = () =>
  bodyError('Phone not verified. Please complete OTP verification first.', 400);
const otpExpiredError = () =>
  bodyError('OTP verification has expired. Please verify your phone again.', 400);
const missingNewPasswordError = () =>
  bodyError('Password is required for new registration.', 400);
const invalidPasswordError = (check) => bodyError(
  check.errors[0],
  400,
  { errors: check.errors },
);
const duplicateEmailError = () => bodyError('This email address is already registered.', 409);
const otpSendBlockedError = (minutes) => bodyError(
  `Too many OTP requests. Please wait ${minutes} minute(s) before trying again.`,
  429,
  { errorCode: 'OTP_SEND_BLOCKED', retryAfterMinutes: minutes },
);
const duplicateKeyError = (message) => bodyError(message, 409);

module.exports = {
  missingPhoneError,
  invalidNepalPhoneError,
  missingVerifyInputError,
  invalidOtpLengthError,
  invalidOtpError,
  roleAlreadyRegisteredError,
  missingRegistrationFieldError,
  shortNameError,
  shortCompanyNameError,
  verificationTokenError,
  phoneNotVerifiedError,
  otpExpiredError,
  missingNewPasswordError,
  invalidPasswordError,
  duplicateEmailError,
  otpSendBlockedError,
  duplicateKeyError,
};
