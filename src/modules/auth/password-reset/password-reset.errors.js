'use strict';

/**
 * Legacy error shapes for the three password-reset endpoints.
 *
 * All errors are plain objects because the legacy handlers respond directly
 * with res.status(N).json(body) — no AppError / global handler involved.
 */

const blockedError = (minutesLeft) => ({
  statusCode: 429,
  responseBody: {
    success: false,
    message: `Too many OTP requests. Please wait ${minutesLeft} minute(s) before trying again.`,
    errorCode: 'OTP_SEND_BLOCKED',
    retryAfterMinutes: minutesLeft,
  },
});

const sparrowError = () => ({
  statusCode: 502,
  responseBody: { status: false, message: 'SMS gateway error. Please try again.' },
});

const sendFailError = () => ({
  statusCode: 500,
  responseBody: { status: false, message: 'Failed to send OTP. Please try again.' },
});

const verifyInternalError = () => ({
  statusCode: 500,
  responseBody: { status: false, message: 'Internal Server Error' },
});

const resetFailError = () => ({
  statusCode: 500,
  responseBody: { status: false, message: 'Failed to reset password. Please try again.' },
});

/**
 * Map a thrown error from requestPasswordReset into a statusCode+responseBody.
 */
const mapRequestError = (err) => {
  if (err.message && err.message.startsWith('OTP_SEND_BLOCKED:')) {
    const minutesLeft = parseInt(err.message.split(':')[1], 10) || 10;
    return blockedError(minutesLeft);
  }
  if (err.message && err.message.includes('Sparrow SMS')) return sparrowError();
  return sendFailError();
};

module.exports = {
  blockedError,
  sparrowError,
  sendFailError,
  verifyInternalError,
  resetFailError,
  mapRequestError,
};
