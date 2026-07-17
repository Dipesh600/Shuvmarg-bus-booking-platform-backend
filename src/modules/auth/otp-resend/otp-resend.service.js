'use strict';

const AppError = require('../../../shared/errors/app-error');
const otpHelper = require('../../../../utils/otpHelper');
const phoneGuard = require('../../../../utils/phoneGuard');
const repository = require('./otp-resend.repository');
const policy = require('./otp-resend.policy');
const errors = require('./otp-resend.errors');

/**
 * Handle the REGISTRATION purpose branch.
 * Phone must NOT already be registered.
 *
 * @param {string} phone - raw submitted phone
 */
const handleRegistration = async (phone) => {
  const { registered } = await phoneGuard.isPhoneRegistered(phone);
  if (registered) {
    throw errors.registeredPhoneError();
  }
};

/**
 * Handle the PASSWORD_RESET purpose branch.
 * Returns early with generic 200 when user does not exist (enumeration-resistant).
 *
 * @param {string} phone - raw submitted phone
 * @returns {{ earlyReturn: { statusCode, responseBody } }|null}
 */
const handlePasswordReset = async (phone) => {
  const normalizedPhone = phoneGuard.normalizePhone(phone);
  const user = await repository.findPasswordResetUser(normalizedPhone);
  if (!user) {
    return {
      earlyReturn: {
        statusCode: 200,
        responseBody: {
          success: true,
          message: 'If an account exists, a new OTP has been sent.',
        },
      },
    };
  }
  return null;
};

/**
 * Send OTP and build the success response.
 * No error mapping here — caller owns the try/catch.
 *
 * @param {string} phone - raw submitted phone
 * @param {string} otpPurpose - resolved purpose
 * @returns {Promise<{ statusCode, responseBody }>}
 */
const sendOtpAndRespond = async (phone, otpPurpose) => {
  const result = await otpHelper.createAndSendOTP(phone, otpPurpose);
  return {
    statusCode: 200,
    responseBody: {
      success: true,
      message: 'New OTP sent successfully!',
      data: { expiresIn: result.expiresIn },
    },
  };
};

/**
 * Resend OTP — preserves the exact legacy resendOtp behavior.
 *
 * Operation order:
 *   1. Validate phone
 *   2. Resolve purpose (defaults to REGISTRATION)
 *   3. Apply purpose-specific account checks
 *   4. Return early for unknown PASSWORD_RESET accounts
 *   5. Call createAndSendOTP
 *   6. Map successful response / error
 *
 * Error mapping covers the entire orchestration so that failures in
 * isPhoneRegistered, normalizePhone, findPasswordResetUser, or
 * createAndSendOTP all produce the correct endpoint-specific responses.
 *
 * @param {{ phone: string, purpose: string|undefined }} input
 * @returns {Promise<{ statusCode: number, responseBody: object }>}
 */
const resendOtp = async ({ phone, purpose }) => {
  try {
    policy.requirePhone(phone);
    const otpPurpose = policy.resolvePurpose(purpose);

    if (otpPurpose === 'REGISTRATION') {
      await handleRegistration(phone);
    }

    if (otpPurpose === 'PASSWORD_RESET') {
      const check = await handlePasswordReset(phone);
      if (check && check.earlyReturn) return check.earlyReturn;
    }

    // ACCOUNT_ACTIVATION: no account precondition — proceed directly
    return await sendOtpAndRespond(phone, otpPurpose);
  } catch (error) {
    if (error instanceof AppError) throw error;

    if (error.message && error.message.startsWith('OTP_SEND_BLOCKED:')) {
      const minutesLeft = parseInt(error.message.split(':')[1], 10) || 10;
      throw errors.otpBlockedError(minutesLeft);
    }

    throw errors.resendFailedError(error);
  }
};

module.exports = { resendOtp };
