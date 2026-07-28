'use strict';

const AppError = require('../../../shared/errors/app-error');

const VALID_PURPOSES = ['REGISTRATION', 'PASSWORD_RESET', 'ACCOUNT_ACTIVATION'];
const DEFAULT_PURPOSE = 'REGISTRATION';

/**
 * Throw AppError 400 when phone is absent.
 * Note: the exclamation mark is deliberate — matches legacy service-level message.
 * The middleware (otpRateLimiter) uses a period; this is the service-level variant.
 *
 * @param {*} phone
 */
const requirePhone = (phone) => {
  if (!phone) {
    throw new AppError('Phone required', 400, {
      success: false,
      message: 'Phone number is required!',
    });
  }
};

/**
 * Resolve and validate the OTP purpose.
 * Defaults to REGISTRATION when purpose is undefined/null/empty.
 * Case-sensitive — 'registration' is not equal to 'REGISTRATION'.
 *
 * @param {string|undefined} purpose
 * @returns {string} resolved purpose
 */
const resolvePurpose = (purpose) => {
  const resolved = purpose || DEFAULT_PURPOSE;
  if (!VALID_PURPOSES.includes(resolved)) {
    throw new AppError('Invalid OTP purpose', 400, {
      success: false,
      message: 'Invalid OTP purpose.',
    });
  }
  return resolved;
};

module.exports = { requirePhone, resolvePurpose, VALID_PURPOSES, DEFAULT_PURPOSE };
