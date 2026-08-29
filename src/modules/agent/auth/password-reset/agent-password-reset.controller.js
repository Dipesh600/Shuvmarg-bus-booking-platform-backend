'use strict';

const AppError = require('../../../../shared/errors/app-error');
const asyncHandler = require('../../../../shared/http/async-handler');
const respond = require('../../../../shared/http/respond');
const service = require('./agent-password-reset.service');
const { setPortalRefreshCookie } = require('../../../../../utils/portalSessionCookies');

const handleError = (res, error, prefix, body) => {
  if (error instanceof AppError) return respond(res, error.statusCode, error.responseBody);
  console.error(prefix, error.message);
  return respond(res, 500, body);
};

const requestPasswordReset = asyncHandler(async (req, res) => {
  try {
    const result = await service.requestPasswordReset({ rawPhone: req.body.phone });
    return respond(res, result.statusCode, result.responseBody);
  } catch (error) {
    return handleError(res, error, '[Agent requestPasswordReset] Error:', {
      success: false,
      message: 'Failed to send OTP. Please try again.',
    });
  }
});

const verifyOtpForReset = asyncHandler(async (req, res) => {
  try {
    const result = await service.verifyOtpForReset({
      rawPhone: req.body.phone,
      otp: req.body.otp,
    });
    return respond(res, result.statusCode, result.responseBody);
  } catch (error) {
    return handleError(res, error, '[Agent verifyOtpForReset] Error:', {
      success: false,
      message: 'Internal Server Error',
    });
  }
});

const resetPassword = asyncHandler(async (req, res) => {
  try {
    const { otp, newPassword } = req.body;
    const result = await service.resetPassword({
      rawPhone: req.body.phone,
      otp,
      newPassword,
      deviceInfo: req.get('User-Agent') || null,
      ipAddress: req.ip || req.socket?.remoteAddress || null,
    });
    if (result.refreshToken) setPortalRefreshCookie(res, 'agent', result.refreshToken);
    return respond(res, result.statusCode, result.responseBody);
  } catch (error) {
    return handleError(res, error, '[Agent resetPassword] Error:', {
      success: false,
      message: 'Internal Server Error',
    });
  }
});

const resendOtpForReset = asyncHandler(async (req, res) => {
  try {
    const result = await service.resendOtpForReset({ rawPhone: req.body.phone });
    return respond(res, result.statusCode, result.responseBody);
  } catch (error) {
    return handleError(res, error, '[Agent resendOtpForReset] Error:', {
      success: false,
      message: 'Failed to resend code. Please try again.',
    });
  }
});

module.exports = {
  requestPasswordReset,
  verifyOtpForReset,
  resetPassword,
  resendOtpForReset,
};
