/**
 * routes/authRoutes/passengerAuthRoutes.js
 *
 * Auth endpoints for passenger OTP authentication.
 * Mounted at /api/auth/passenger
 *
 * Public (no JWT):
 *   POST /sendOTP   — request a passenger authentication OTP (rate-limited)
 *   POST /verifyOTP — verify OTP and receive a session (rate-limited)
 */

'use strict';

const express = require('express');
const passengerOtpAuth = require('../../src/modules/auth/passenger-otp-auth');
const otpLimiters = require('../../middleware/otpRateLimiter.js');

const createPassengerAuthRouter = ({
  otpVerifyLimiter = otpLimiters.otpVerifyLimiter,
  otpSendLimiter = otpLimiters.otpSendLimiter,
  otpPresenceLimiter = otpLimiters.validatePhonePresent,
} = {}) => {
  const router = express.Router();

  router.post('/sendOTP', otpSendLimiter, otpPresenceLimiter, passengerOtpAuth.sendOTP);
  router.post('/verifyOTP', otpVerifyLimiter, passengerOtpAuth.verifyOTP);
  return router;
};

module.exports = createPassengerAuthRouter();
module.exports.createPassengerAuthRouter = createPassengerAuthRouter;
