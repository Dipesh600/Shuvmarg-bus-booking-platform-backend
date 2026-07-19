'use strict';

const AppError = require('../../../../shared/errors/app-error');
const asyncHandler = require('../../../../shared/http/async-handler');
const respond = require('../../../../shared/http/respond');
const service = require('./bus-owner-password-reset.service');
const policy = require('./bus-owner-password-reset.policy');

const handleError = (res, error, prefix, statusCode, body) => {
  if (error instanceof AppError) return respond(res, error.statusCode, error.responseBody);
  console.error(prefix, error.message);
  return respond(res, statusCode, body);
};

const requestPasswordReset = asyncHandler(async (req, res) => {
  try {
    const result = await service.requestPasswordReset({ rawPhone: req.body.phone });
    return respond(res, result.statusCode, result.responseBody);
  } catch (error) {
    if (policy.isSparrowSmsError(error)) {
      return handleError(res, error, '[BusOwner requestPasswordReset] Error:', 502, {
        success: false,
        message: 'SMS gateway error. Please try again.',
      });
    }
    return handleError(res, error, '[BusOwner requestPasswordReset] Error:', 500, {
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
    return handleError(res, error, '[BusOwner verifyOtpForReset] Error:', 500, {
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
    });
    return respond(res, result.statusCode, result.responseBody);
  } catch (error) {
    return handleError(res, error, '[BusOwner resetPassword] Error:', 500, {
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
    return handleError(res, error, '[BusOwner resendOtpForReset] Error:', 500, {
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
