'use strict';

/**
 * src/modules/auth/passenger-otp-auth/request-passenger-otp.service.js
 *
 * Handles the OTP send request for passenger authentication.
 *
 * Responsibilities:
 *   - Validate and normalize the phone number
 *   - Check account eligibility (restricted accounts receive neutral response)
 *   - Delegate OTP generation and SMS delivery to otpHelper
 *   - Map OTP send errors to typed AppErrors
 *
 * Does NOT:
 *   - Create a User record
 *   - Grant passenger role
 *   - Issue tokens
 *   - Return account details
 */

const { normalizePhone } = require('../../../../utils/phoneGuard');
const otpHelper = require('../../../../utils/otpHelper');
const repository = require('./passenger-otp-auth.repository');
const policy = require('./passenger-otp-auth.policy');
const errors = require('./passenger-otp-auth.errors');

/** Neutral response — returned for all successful-or-eligible-unknown send attempts. */
const NEUTRAL_SEND_BODY = {
  success: true,
  message: 'If this number is eligible, a verification code has been sent.',
};

/**
 * Request a passenger authentication OTP.
 *
 * @param {{ rawPhone: string }} input
 * @returns {Promise<{ statusCode: 200, responseBody: Object }>}
 * @throws {AppError} 400 on validation failure, 429 on OTP send rate limit
 */
const requestPassengerOTP = async ({ rawPhone }) => {
  if (!rawPhone) throw errors.missingPhoneError();

  const normalizedPhone = normalizePhone(rawPhone);
  if (!normalizedPhone || !policy.isValidNepalMobile(normalizedPhone)) {
    throw errors.invalidPhoneError();
  }

  // Eligibility guard: restricted accounts get the neutral response with no SMS sent.
  // This avoids billing for OTPs that can never complete authentication while
  // preserving enumeration protection (response shape is identical for all cases).
  const existing = await repository.findPassengerOtpEligibilityByPhone(rawPhone);
  if (existing && policy.isEligibilityRestricted(existing)) {
    return { statusCode: 200, responseBody: NEUTRAL_SEND_BODY };
  }

  try {
    await otpHelper.createAndSendOTP(
      normalizedPhone,
      policy.PASSENGER_AUTH_PURPOSE,
      policy.PASSENGER_AUTH_SMS_PREFIX,
    );
  } catch (err) {
    if (policy.isOtpBlocked(err)) {
      throw errors.otpSendBlockedError(policy.otpBlockedMinutes(err));
    }
    if (policy.isOtpCooldown(err)) {
      throw errors.otpSendCooldownError(policy.otpCooldownSeconds(err));
    }
    if (policy.isSparrowSmsError(err)) {
      throw errors.smsSendError();
    }
    throw err;
  }

  return { statusCode: 200, responseBody: NEUTRAL_SEND_BODY };
};

module.exports = { requestPassengerOTP };
