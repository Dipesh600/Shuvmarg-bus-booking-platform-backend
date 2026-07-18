'use strict';

const AppError = require('../../../../shared/errors/app-error');

const bodyError = (message, statusCode, extra = {}) => new AppError(
  message,
  statusCode,
  { success: false, message, ...extra },
);

const missingPhoneError = (message = 'Phone number is required.') => bodyError(message, 400);
const invalidNepalPhoneError = () => bodyError('Please enter a valid Nepal mobile number.', 400);
const missingVerifyInputError = () =>
  bodyError('Phone number and verification code are required.', 400);
const invalidOtpLengthError = () => bodyError('Verification code must be 6 digits.', 400);
const invalidOtpError = (message) => bodyError(message, 400);
const roleRaceError = () =>
  bodyError('Phone verification could not be completed. Please start again.', 400);
const missingNameError = () => bodyError('Name is required.', 400);
const shortNameError = () => bodyError('Name must be at least 3 characters.', 400);
const verificationTokenError = (message) => bodyError(message, 400);
const phoneNotVerifiedError = () =>
  bodyError('Phone not verified. Please complete OTP verification first.', 400);
const otpExpiredError = () =>
  bodyError('OTP verification has expired. Please verify your phone again.', 400);
const existingAgentError = () => bodyError(
  'This mobile number is already registered as an agent. Please log in instead.',
  409,
  { errorCode: 'ROLE_ALREADY_REGISTERED', hint: 'login' },
);
const missingUpgradePasswordError = () => bodyError('Password is required.', 400);
const missingNewPasswordError = () =>
  bodyError('Password is required for new registration.', 400);
const invalidPasswordError = (check) => bodyError(
  check.errors[0],
  400,
  { errors: check.errors },
);
const duplicateEmailError = () => bodyError('This email address is already registered.', 409);
const resendExistingAgentError = () => bodyError(
  'This mobile number is already registered as an agent.',
  409,
  { errorCode: 'ROLE_ALREADY_REGISTERED' },
);
const otpSendBlockedError = (minutes) => bodyError(
  `Too many OTP requests. Please wait ${minutes} minute(s) before trying again.`,
  429,
  { errorCode: 'OTP_SEND_BLOCKED', retryAfterMinutes: minutes },
);

const duplicateKeyError = (error) => {
  const field = Object.keys(error.keyPattern || {})[0];
  const labels = {
    phone: 'Mobile number',
    email: 'Email address',
    user: 'Phone number',
    agentId: 'Agent ID',
  };
  if (field === 'user') {
    return bodyError(
      'An agent account for this phone number already exists. Please log in instead.',
      409,
      { errorCode: 'AGENT_ALREADY_EXISTS', hint: 'login' },
    );
  }
  return bodyError(
    labels[field]
      ? `${labels[field]} is already registered.`
      : 'This information is already registered with another account.',
    409,
  );
};

module.exports = {
  missingPhoneError,
  invalidNepalPhoneError,
  missingVerifyInputError,
  invalidOtpLengthError,
  invalidOtpError,
  roleRaceError,
  missingNameError,
  shortNameError,
  verificationTokenError,
  phoneNotVerifiedError,
  otpExpiredError,
  existingAgentError,
  missingUpgradePasswordError,
  missingNewPasswordError,
  invalidPasswordError,
  duplicateEmailError,
  resendExistingAgentError,
  otpSendBlockedError,
  duplicateKeyError,
};
