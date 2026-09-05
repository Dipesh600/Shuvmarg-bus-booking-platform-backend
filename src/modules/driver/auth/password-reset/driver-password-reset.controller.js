'use strict';

const AppError = require('../../../../shared/errors/app-error');
const asyncHandler = require('../../../../shared/http/async-handler');
const respond = require('../../../../shared/http/respond');
const service = require('./driver-password-reset.service');
const { setPortalRefreshCookie } = require('../../../../../utils/portalSessionCookies');

const run = (action, fallback) => asyncHandler(async (req, res) => {
  try {
    const result = await action(req);
    if (result.refreshToken) setPortalRefreshCookie(res, 'driver', result.refreshToken);
    return respond(res, result.statusCode, result.responseBody);
  } catch (error) {
    if (error instanceof AppError) return respond(res, error.statusCode, error.responseBody);
    console.error('[Driver password reset] Error:', error.message);
    return respond(res, 500, { success: false, message: fallback });
  }
});

const requestPasswordReset = run(
  (req) => service.requestPasswordReset({ rawPhone: req.body.phone }),
  'Failed to send code. Please try again.',
);
const verifyOtpForReset = run(
  (req) => service.verifyOtpForReset({ rawPhone: req.body.phone, otp: req.body.otp }),
  'Verification could not be completed. Please try again.',
);
const resetPassword = run(
  (req) => service.resetPassword({
    rawPhone: req.body.phone,
    otp: req.body.otp,
    newPassword: req.body.newPassword,
    deviceInfo: req.get('User-Agent') || null,
    ipAddress: req.ip || req.socket?.remoteAddress || null,
  }),
  'Password could not be updated. Please try again.',
);
const resendOtpForReset = run(
  (req) => service.resendOtpForReset({ rawPhone: req.body.phone }),
  'Failed to resend code. Please try again.',
);

module.exports = { requestPasswordReset, verifyOtpForReset, resetPassword, resendOtpForReset };
