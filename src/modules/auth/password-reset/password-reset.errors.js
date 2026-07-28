'use strict';

/**
 * Legacy error shapes for the three password-reset endpoints.
 *
 * All errors are now AppError instances so they can flow to the global
 * error handler via asyncHandler.
 */
const AppError = require('../../../shared/errors/app-error');

const blockedError = (minutesLeft) => new AppError('OTP send blocked', 429, {
  success: false,
  message: `Too many OTP requests. Please wait ${minutesLeft} minute(s) before trying again.`,
  retryAfterMinutes: minutesLeft,
  errorCode: 'OTP_SEND_BLOCKED'
}, 'OTP_SEND_BLOCKED');

const cooldownError = (secondsLeft) => new AppError('OTP send cooldown', 429, {
  success: false,
  message: `Please wait ${secondsLeft} second(s) before requesting a new OTP.`,
  retryAfterSeconds: secondsLeft,
  errorCode: 'OTP_COOLDOWN'
}, 'OTP_COOLDOWN');

const sparrowError = (cause) => new AppError('Sparrow SMS error', 502, { status: false, message: 'SMS gateway error. Please try again.' }, null, cause);

const sendFailError = (cause) => new AppError('Send OTP failed', 500, { status: false, message: 'Failed to send OTP. Please try again.' }, null, cause);

const verifyInternalError = (cause) => new AppError('Verify internal error', 500, { status: false, message: 'Internal Server Error' }, null, cause);

const resetFailError = (cause) => new AppError('Reset internal error', 500, { status: false, message: 'Failed to reset password. Please try again.' }, null, cause);

/**
 * Map a thrown error from requestPasswordReset into a statusCode+responseBody.
 */
const mapRequestError = (err) => {
  if (err.message && err.message.startsWith('OTP_SEND_BLOCKED:')) {
    const minutesLeft = parseInt(err.message.split(':')[1], 10) || 10;
    return blockedError(minutesLeft);
  }
  if (err.message && err.message.startsWith('OTP_COOLDOWN:')) {
    const secondsLeft = parseInt(err.message.split(':')[1], 10) || 60;
    return cooldownError(secondsLeft);
  }
  if (err.message && err.message.includes('Sparrow SMS')) return sparrowError(err);
  return sendFailError(err);
};

module.exports = {
  blockedError,
  cooldownError,
  sparrowError,
  sendFailError,
  verifyInternalError,
  resetFailError,
  mapRequestError,
};
