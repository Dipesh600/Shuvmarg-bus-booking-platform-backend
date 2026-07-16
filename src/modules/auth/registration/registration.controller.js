'use strict';

const asyncHandler = require('../../../shared/http/async-handler');
const respond = require('../../../shared/http/respond');
const sendPhoneOtpService = require('./send-phone-otp.service');
const verifyPhoneOtpService = require('./verify-phone-otp.service');
const completeRegistrationService = require('./complete-registration.service');

exports.sendPhoneOTP = asyncHandler(async (req, res) => {
  const { phone } = req.body;
  const result = await sendPhoneOtpService.sendPhoneOTP({ phone });
  return respond(res, result.statusCode, result.responseBody);
});

exports.verifyPhoneOTP = asyncHandler(async (req, res) => {
  const { phone, otp } = req.body;
  const result = await verifyPhoneOtpService.verifyPhoneOTP({ phone, otp });
  return respond(res, result.statusCode, result.responseBody);
});

exports.completeRegistration = asyncHandler(async (req, res) => {
  const { phone, name, email, address, password, gender, referralCode, verificationToken } = req.body;
  const ipAddress = req.ip || req.connection?.remoteAddress || null;
  const deviceInfo = req.get('User-Agent') || null;

  const result = await completeRegistrationService.completeRegistration({
    phone, name, email, address, password, gender, referralCode,
    verificationToken, ipAddress, deviceInfo,
  });

  return respond(res, result.statusCode, result.responseBody);
});
