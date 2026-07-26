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
const router = express.Router();
const busOwnerLogin = require("../../src/modules/bus-owner/auth/login");
const busOwnerPasswordReset = require("../../src/modules/bus-owner/auth/password-reset");
const busOwnerRegistration = require("../../src/modules/bus-owner/auth/registration");
const busOwnerSession = require("../../src/modules/bus-owner/auth/session");
const otpRateLimiter = require("../../middleware/otpRateLimiter.js");
const { otpVerifyLimiter, otpSendLimiter } = require("../../middleware/otpRateLimiter.js");
const { busOwnerLoginRateLimiter: loginRateLimiter } = require("../../middleware/loginRateLimiters.js");

// 3-step self-registration
router.post("/sendOTP",   otpSendLimiter, otpRateLimiter, busOwnerRegistration.sendOTP);
router.post("/verifyOTP", otpVerifyLimiter, busOwnerRegistration.verifyOTP);     // ← phone-keyed verify limit
router.post("/register",  busOwnerRegistration.register);
router.post("/resendOTP", otpSendLimiter, otpRateLimiter, busOwnerRegistration.resendOTP);

// Login (dedicated bus-owner endpoint with proper phone normalization + role check)
router.post("/login", loginRateLimiter, busOwnerLogin.login);

// Password Reset (Bus Owner specific)
router.post("/requestPasswordReset", otpSendLimiter, otpRateLimiter, busOwnerPasswordReset.requestPasswordReset);
router.post("/verifyOtpForReset", otpVerifyLimiter, busOwnerPasswordReset.verifyOtpForReset); // ← phone-keyed verify limit
router.post("/resetPassword",     otpVerifyLimiter, busOwnerPasswordReset.resetPassword);      // ← phone-keyed verify limit
router.post("/resendOtpForReset", otpSendLimiter, otpRateLimiter, busOwnerPasswordReset.resendOtpForReset);

// Session management (no JWT required — these operate on refresh tokens)
router.post("/refresh", busOwnerSession.refresh);
router.post("/logout",  busOwnerSession.logout);

module.exports = router;
