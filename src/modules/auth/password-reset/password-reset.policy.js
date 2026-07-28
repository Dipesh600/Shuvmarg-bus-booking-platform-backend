'use strict';

/**
 * Stateless validation helpers for the password-reset flow.
 * No Mongoose imports. No side effects.
 */
const AppError = require('../../../shared/errors/app-error');

/**
 * Assert emailOrPhone is present.
 * @throws {{ statusCode, responseBody }} on failure
 */
const validateResetRequestInput = (emailOrPhone) => {
  if (!emailOrPhone) {
    throw new AppError('Missing phone number', 400, { status: false, message: 'Email or Phone is required!' });
  }
};

/**
 * Assert emailOrPhone and otp are present.
 * @throws {{ statusCode, responseBody }} on failure
 */
const validateVerifyInput = (emailOrPhone, otp) => {
  if (!emailOrPhone || !otp) {
    throw new AppError('Missing verify input', 400, { status: false, message: 'Phone/Email and OTP are required!' });
  }
};

/**
 * Assert all three reset fields are present.
 * @throws {{ statusCode, responseBody }} on failure
 */
const validateResetInput = (emailOrPhone, otp, newPassword) => {
  if (!emailOrPhone || !otp || !newPassword) {
    throw new AppError('Missing reset input', 400, { status: false, message: 'All fields are required.' });
  }
};

/**
 * Strip non-digit characters and enforce 6-digit length.
 * Returns cleaned OTP string.
 * @throws {{ statusCode, responseBody }} when sanitized length ≠ 6
 */
const sanitizeOtp = (raw, message = 'OTP must be a 6-digit code.') => {
  const clean = String(raw).replace(/\D/g, '');
  if (clean.length !== 6) {
    throw new AppError('Invalid OTP length', 400, { status: false, message: message === 'OTP must be a 6-digit code.' ? message : 'Verification code must be 6 digits.' });
  }
  return clean;
};

module.exports = {
  validateResetRequestInput,
  validateVerifyInput,
  validateResetInput,
  sanitizeOtp,
};
