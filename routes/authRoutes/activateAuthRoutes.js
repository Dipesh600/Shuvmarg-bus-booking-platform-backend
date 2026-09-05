/**
 * routes/authRoutes/activateAuthRoutes.js
 *
 * Account activation endpoints for invited agents, conductors, and drivers.
 * Mounted at /api/auth/activate
 */

const express = require("express");
const activateController = require("../../controllers/authControllers.js/activateAccountController.js");
const otpLimiters = require("../../middleware/otpRateLimiter.js");

const createActivateAuthRouter = ({
  otpSendLimiter = otpLimiters.otpSendLimiter,
  otpVerifyLimiter = otpLimiters.otpVerifyLimiter,
  otpPresenceLimiter = otpLimiters.validatePhonePresent,
} = {}) => {
  const router = express.Router();

  router.post("/sendOTP", otpSendLimiter, otpPresenceLimiter, activateController.sendActivationOTP);
  router.post("/", otpVerifyLimiter, otpPresenceLimiter, activateController.activateAccount);
  return router;
};

module.exports = createActivateAuthRouter();
module.exports.createActivateAuthRouter = createActivateAuthRouter;
