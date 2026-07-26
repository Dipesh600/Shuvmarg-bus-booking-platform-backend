/**
 * routes/authRoutes/busOwnerAuthRoutes.js
 *
 * Auth endpoints for the bus owner web portal.
 * Mounted at /api/auth/busowner
 *
 * Public (no JWT):
 *   POST /sendOTP    — send verification OTP
 *   POST /verifyOTP  — verify OTP
 *   POST /register   — complete registration
 *   POST /resendOTP  — resend OTP (rate-limited)
 *   POST /login      — login (rate-limited)
 */

"use strict";

const express = require("express");
const busOwnerLogin = require("../../src/modules/bus-owner/auth/login");
const busOwnerPasswordReset = require("../../src/modules/bus-owner/auth/password-reset");
const busOwnerRegistration = require("../../src/modules/bus-owner/auth/registration");
const busOwnerSession = require("../../src/modules/bus-owner/auth/session");
const otpLimiters = require("../../middleware/otpRateLimiter.js");
const { busOwnerLoginRateLimiter: productionLoginLimiter } = require("../../middleware/loginRateLimiters.js");

const createBusOwnerAuthRouter = ({
  otpVerifyLimiter = otpLimiters.otpVerifyLimiter,
  otpSendLimiter = otpLimiters.otpSendLimiter,
  otpPresenceLimiter = otpLimiters.validatePhonePresent,
  loginRateLimiter = productionLoginLimiter,
} = {}) => {
  const router = express.Router();

  router.post("/sendOTP", otpSendLimiter, otpPresenceLimiter, busOwnerRegistration.sendOTP);
  router.post("/verifyOTP", otpVerifyLimiter, busOwnerRegistration.verifyOTP);
  router.post("/register", busOwnerRegistration.register);
  router.post("/resendOTP", otpSendLimiter, otpPresenceLimiter, busOwnerRegistration.resendOTP);
  router.post("/login", loginRateLimiter, busOwnerLogin.login);

  router.post("/requestPasswordReset", otpSendLimiter, otpPresenceLimiter, busOwnerPasswordReset.requestPasswordReset);
  router.post("/verifyOtpForReset", otpVerifyLimiter, busOwnerPasswordReset.verifyOtpForReset);
  router.post("/resetPassword", otpVerifyLimiter, busOwnerPasswordReset.resetPassword);
  router.post("/resendOtpForReset", otpSendLimiter, otpPresenceLimiter, busOwnerPasswordReset.resendOtpForReset);

  router.post("/refresh", busOwnerSession.refresh);
  router.post("/logout", busOwnerSession.logout);

  return router;
};

module.exports = createBusOwnerAuthRouter();
module.exports.createBusOwnerAuthRouter = createBusOwnerAuthRouter;
