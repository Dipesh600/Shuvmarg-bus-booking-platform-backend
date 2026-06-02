/**
 * routes/authRoutes/activateAuthRoutes.js
 *
 * Account activation endpoints for invited users (conductors, drivers, admin-created bus owners).
 * Mounted at /api/auth/activate
 */

const express = require("express");
const router = express.Router();
const activateController = require("../../controllers/authControllers.js/activateAccountController.js");
const otpRateLimiter = require("../../middleware/otpRateLimiter.js");

// Send activation OTP
router.post("/sendOTP", otpRateLimiter, activateController.sendActivationOTP);

// Activate account (verify OTP + set new password)
router.post("/", activateController.activateAccount);

module.exports = router;
