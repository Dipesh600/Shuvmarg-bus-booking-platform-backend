/**
 * routes/authRoutes/agentAuthRoutes.js
 *
 * Self-registration, login, token management, and password reset
 * endpoints for the agent portal.
 *
 * Mounted at /api/auth/agent
 */

"use strict";

const express = require("express");
const agentSession  = require("../../src/modules/agent/auth/session");
const agentLogin    = require("../../src/modules/agent/auth/login");
const agentRegistration = require("../../src/modules/agent/auth/registration");
const agentPasswordReset = require("../../src/modules/agent/auth/password-reset");
const otpLimiters = require("../../middleware/otpRateLimiter.js");
const { agentLoginRateLimiter: productionLoginLimiter } = require("../../middleware/loginRateLimiters.js");

const createAgentAuthRouter = ({
  otpVerifyLimiter = otpLimiters.otpVerifyLimiter,
  otpSendLimiter = otpLimiters.otpSendLimiter,
  otpPresenceLimiter = otpLimiters.validatePhonePresent,
  loginRateLimiter = productionLoginLimiter,
} = {}) => {
  const router = express.Router();

  router.post("/sendOTP", otpSendLimiter, otpPresenceLimiter, agentRegistration.sendOTP);
  router.post("/verifyOTP", otpVerifyLimiter, agentRegistration.verifyOTP);
  router.post("/register", agentRegistration.register);
  router.post("/resendOTP", otpSendLimiter, otpPresenceLimiter, agentRegistration.resendOTP);
  router.post("/login", loginRateLimiter, agentLogin.login);

  router.post("/refresh", agentSession.refresh);
  router.post("/logout", agentSession.logout);

  router.post("/requestPasswordReset", otpSendLimiter, otpPresenceLimiter, agentPasswordReset.requestPasswordReset);
  router.post("/verifyOtpForReset", otpVerifyLimiter, agentPasswordReset.verifyOtpForReset);
  router.post("/resetPassword", otpVerifyLimiter, agentPasswordReset.resetPassword);
  router.post("/resendOtpForReset", otpSendLimiter, otpPresenceLimiter, agentPasswordReset.resendOtpForReset);

  return router;
};

module.exports = createAgentAuthRouter();
module.exports.createAgentAuthRouter = createAgentAuthRouter;
