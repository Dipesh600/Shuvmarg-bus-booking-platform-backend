'use strict';

const asyncHandler = require('../../../shared/http/async-handler');
const respond = require('../../../shared/http/respond');
const requestPasswordResetService = require('./request-password-reset.service');
const verifyResetOtpService = require('./verify-reset-otp.service');
const resetPasswordService = require('./reset-password.service');

exports.requestPasswordReset = asyncHandler(async (req, res) => {
  const { emailOrPhone } = req.body;
  const result = await requestPasswordResetService.requestPasswordReset({ emailOrPhone });
  return respond(res, result.statusCode, result.responseBody);
});

exports.verifyOtpForReset = asyncHandler(async (req, res) => {
  const { emailOrPhone, otp } = req.body;
  const result = await verifyResetOtpService.verifyResetOtp({ emailOrPhone, otp });
  return respond(res, result.statusCode, result.responseBody);
});

exports.resetPassword = asyncHandler(async (req, res) => {
  const { emailOrPhone, otp, newPassword } = req.body;
  const result = await resetPasswordService.resetPassword({ emailOrPhone, otp, newPassword });
  return respond(res, result.statusCode, result.responseBody);
});
