'use strict';

const AppError = require('../../../shared/errors/app-error');

/**
 * Re-throw AppError instances unchanged; wrap everything else in a
 * legacy-shaped 500 AppError so the global handler never replaces the
 * endpoint-specific 500 contract.
 */
const toLegacySendOtpError = (error) => {
  if (error instanceof AppError) return error;
  return new AppError(
    'Failed to send OTP',
    500,
    { status: false, message: 'Failed to send OTP. Please try again.' },
    null,
    error
  );
};

const toLegacyVerifyOtpError = (error) => {
  if (error instanceof AppError) return error;
  return new AppError(
    'Failed to verify OTP',
    500,
    { status: false, message: 'Failed to verify OTP!', error: error.message },
    null,
    error
  );
};

const toLegacyCompleteRegError = (error) => {
  if (error instanceof AppError) return error;
  return new AppError(
    'Failed to complete registration',
    500,
    { status: false, message: 'Failed to complete registration!', error: error.message },
    null,
    error
  );
};

module.exports = { toLegacySendOtpError, toLegacyVerifyOtpError, toLegacyCompleteRegError };
