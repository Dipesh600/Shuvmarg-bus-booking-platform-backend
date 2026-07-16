'use strict';

const asyncHandler = require('../../../shared/http/async-handler');
const respond = require('../../../shared/http/respond');
const requestPasswordResetService = require('./request-password-reset.service');
const verifyResetOtpService = require('./verify-reset-otp.service');
const resetPasswordService = require('./reset-password.service');

/**
 * Execute a service call and write the result directly to res.
 * Services return { statusCode, responseBody } on both success and handled errors.
 * They throw { statusCode, responseBody } for policy/validation errors.
 * asyncHandler forwards unhandled errors (Error instances) to Express error middleware.
 */
const runService = async (res, fn) => {
  try {
    const result = await fn();
    return respond(res, result.statusCode, result.responseBody);
  } catch (err) {
    if (err && typeof err.statusCode === 'number' && err.responseBody) {
      return respond(res, err.statusCode, err.responseBody);
    }
    throw err; // genuine unexpected error — let asyncHandler/Express handle it
  }
};

exports.requestPasswordReset = asyncHandler(async (req, res) => {
  const { emailOrPhone } = req.body;
  return runService(res, () => requestPasswordResetService.requestPasswordReset({ emailOrPhone }));
});

exports.verifyOtpForReset = asyncHandler(async (req, res) => {
  const { emailOrPhone, otp } = req.body;
  return runService(res, () => verifyResetOtpService.verifyResetOtp({ emailOrPhone, otp }));
});

exports.resetPassword = asyncHandler(async (req, res) => {
  const { emailOrPhone, otp, newPassword } = req.body;
  return runService(res, () => resetPasswordService.resetPassword({ emailOrPhone, otp, newPassword }));
});
