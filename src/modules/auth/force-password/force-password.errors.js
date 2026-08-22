'use strict';

const AppError = require('../../../shared/errors/app-error');

const missingFieldsError = () =>
  new AppError('Missing force-password input', 400, {
    success: false,
    message: 'Temp token and new password are required.',
  });

const invalidTempTokenError = () =>
  new AppError('Invalid temp token', 401, {
    success: false,
    message: 'Temp token is invalid or expired. Please login again.',
  });

const invalidTokenPurposeError = () =>
  new AppError('Invalid token purpose', 401, {
    success: false,
    message: 'Invalid token purpose.',
  });

const invalidOtpError = (message) =>
  new AppError('Invalid OTP', 400, {
    success: false,
    message,
  });

const userNotFoundError = () =>
  new AppError('User not found', 404, {
    success: false,
    message: 'User not found.',
  });

const passwordChangeNotRequiredError = () =>
  new AppError('Password change not required', 400, {
    success: false,
    message: 'Password change is not required for this account.',
  });

const credentialStateError = () =>
  new AppError('Temporary credential unavailable', 401, {
    success: false,
    message: 'This one-time credential is expired or has already been used. Please login again.',
    errorCode: 'TEMPORARY_CREDENTIAL_INVALID',
  });

const accountUnavailableError = () =>
  new AppError('Account unavailable', 403, {
    success: false,
    message: 'This account cannot complete password setup. Please contact support.',
    errorCode: 'ACCOUNT_UNAVAILABLE',
  });

const forcePasswordFailedError = (cause) =>
  new AppError('Force password change failed', 500, {
    success: false,
    message: 'Internal Server Error',
  }, null, cause);

module.exports = {
  missingFieldsError,
  invalidTempTokenError,
  invalidTokenPurposeError,
  invalidOtpError,
  userNotFoundError,
  passwordChangeNotRequiredError,
  credentialStateError,
  accountUnavailableError,
  forcePasswordFailedError,
};
