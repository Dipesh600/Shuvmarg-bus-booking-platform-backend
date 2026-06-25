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
const rateLimit = require("express-rate-limit");
const router = express.Router();
const busOwnerAuth = require("../../controllers/authControllers.js/busOwnerAuthController.js");
const otpRateLimiter = require("../../middleware/otpRateLimiter.js");

// Strict rate limiter for login attempts — 10 attempts per 15 minutes per IP
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: "Too many login attempts from this device. Please wait 15 minutes.",
    errorCode: "LOGIN_RATE_LIMIT_EXCEEDED",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count every attempt, not just failures
});

// 3-step self-registration
router.post("/sendOTP",   otpRateLimiter, busOwnerAuth.sendOTP);
router.post("/verifyOTP", busOwnerAuth.verifyOTP);
router.post("/register",  busOwnerAuth.register);
router.post("/resendOTP", otpRateLimiter, busOwnerAuth.resendOTP);

// Login (dedicated bus-owner endpoint with proper phone normalization + role check)
router.post("/login", loginRateLimiter, busOwnerAuth.login);

// Password Reset (Bus Owner specific)
router.post("/requestPasswordReset", otpRateLimiter, busOwnerAuth.requestPasswordReset);
router.post("/verifyOtpForReset", busOwnerAuth.verifyOtpForReset);
router.post("/resetPassword", busOwnerAuth.resetPassword);
router.post("/resendOtpForReset", otpRateLimiter, busOwnerAuth.resendOtpForReset);

// Session management (no JWT required — these operate on refresh tokens)
router.post("/refresh", busOwnerAuth.refresh);
router.post("/logout",  busOwnerAuth.logout);

module.exports = router;
