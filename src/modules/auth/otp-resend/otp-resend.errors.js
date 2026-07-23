'use strict';

/**
 * AppError factories for the resendOtp endpoint.
 * All errors flow through asyncHandler → global error handler.
 *
 * Purpose validation (invalid purpose → 400) is owned by otp-resend.policy.js
 * and is not duplicated here.
 */
const AppError = require('../../../shared/errors/app-error');

const registeredPhoneError = () =>
  new AppError('Phone already registered', 409, {
    success: false,
    message: 'This phone number is already registered.',
    errorCode: 'PHONE_ALREADY_REGISTERED',
  });

const otpBlockedError = (minutesLeft) =>
  new AppError('OTP send blocked', 429, {
    success: false,
    message: `Too many OTP requests. Please wait ${minutesLeft} minute(s) before trying again.`,
    errorCode: 'OTP_SEND_BLOCKED',
    retryAfterMinutes: minutesLeft,
  });

const otpCooldownError = (secondsLeft) =>
  new AppError('OTP send cooldown', 429, {
    success: false,
    message: `Please wait ${secondsLeft} second(s) before requesting a new OTP.`,
    errorCode: 'OTP_COOLDOWN',
    retryAfterSeconds: secondsLeft,
  });

const resendFailedError = (cause) =>
  new AppError('Failed to resend OTP', 500, {
    success: false,
    message: 'Failed to resend OTP. Please try again.',
  }, null, cause);

module.exports = {
  registeredPhoneError,
  otpBlockedError,
  otpCooldownError,
  resendFailedError,
};
