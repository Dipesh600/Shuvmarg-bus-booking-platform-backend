/**
 * routes/authRoutes/activateAuthRoutes.js
 *
 * Account activation endpoints for invited users (conductors, drivers, admin-created bus owners).
 * Mounted at /api/auth/activate
 */

const express = require("express");
const activateController = require("../../controllers/authControllers.js/activateAccountController.js");
const otpLimiters = require("../../middleware/otpRateLimiter.js");

const createActivateAuthRouter = ({
  otpSendLimiter = otpLimiters.otpSendLimiter,
  otpPresenceLimiter = otpLimiters.validatePhonePresent,
} = {}) => {
  const router = express.Router();

  router.post("/sendOTP", otpSendLimiter, otpPresenceLimiter, activateController.sendActivationOTP);
  router.post("/", activateController.activateAccount);
  return router;
};

module.exports = createActivateAuthRouter();
module.exports.createActivateAuthRouter = createActivateAuthRouter;
