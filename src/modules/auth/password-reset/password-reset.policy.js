'use strict';

/**
 * Stateless validation helpers for the password-reset flow.
 * No Mongoose imports. No side effects.
 */

/**
 * Assert emailOrPhone is present.
 * @throws {{ statusCode, responseBody }} on failure
 */
const validateResetRequestInput = (emailOrPhone) => {
  if (!emailOrPhone) {
    throw { statusCode: 400, responseBody: { status: false, message: 'Email or Phone is required!' } };
  }
};

/**
 * Assert emailOrPhone and otp are present.
 * @throws {{ statusCode, responseBody }} on failure
 */
const validateVerifyInput = (emailOrPhone, otp) => {
  if (!emailOrPhone || !otp) {
    throw {
      statusCode: 400,
      responseBody: { status: false, message: 'Phone/Email and OTP are required!' },
    };
  }
};

/**
 * Assert all three reset fields are present.
 * @throws {{ statusCode, responseBody }} on failure
 */
const validateResetInput = (emailOrPhone, otp, newPassword) => {
  if (!emailOrPhone || !otp || !newPassword) {
    throw { statusCode: 400, responseBody: { status: false, message: 'All fields are required.' } };
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
    throw { statusCode: 400, responseBody: { status: false, message } };
  }
  return clean;
};

module.exports = {
  validateResetRequestInput,
  validateVerifyInput,
  validateResetInput,
  sanitizeOtp,
};
