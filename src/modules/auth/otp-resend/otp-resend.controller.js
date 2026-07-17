'use strict';

const asyncHandler = require('../../../shared/http/async-handler');
const respond = require('../../../shared/http/respond');
const otpResendService = require('./otp-resend.service');

exports.resendOtp = asyncHandler(async (req, res) => {
  const { phone, purpose } = req.body;
  const result = await otpResendService.resendOtp({ phone, purpose });
  return respond(res, result.statusCode, result.responseBody);
});
