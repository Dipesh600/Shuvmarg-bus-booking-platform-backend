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
const router  = express.Router();
const rateLimit = require("express-rate-limit");
const agentAuth     = require("../../controllers/authControllers.js/agentAuthController.js");
const otpRateLimiter = require("../../middleware/otpRateLimiter.js");
const { otpVerifyLimiter } = require("../../middleware/otpRateLimiter.js");

// Strict rate limiter for login attempts (per IP — 10 per 15 min)
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: "Too many login attempts. Please wait 15 minutes." },
});

// ── 3-step self-registration ──────────────────────────────────────────────────
router.post("/sendOTP",    otpRateLimiter, agentAuth.sendOTP);
router.post("/verifyOTP",  otpVerifyLimiter, agentAuth.verifyOTP);     // ← phone-keyed verify limit
router.post("/register",   agentAuth.register);
router.post("/resendOTP",  otpRateLimiter, agentAuth.resendOTP);

// ── Login ─────────────────────────────────────────────────────────────────────
router.post("/login", loginRateLimiter, agentAuth.login);

// ── Token management ──────────────────────────────────────────────────────────
router.post("/refresh", agentAuth.refresh);
router.post("/logout",  agentAuth.logout);

// ── Password reset (3-step, mirrors registration flow) ───────────────────────
router.post("/requestPasswordReset", otpRateLimiter, agentAuth.requestPasswordReset);
router.post("/verifyOtpForReset",    otpVerifyLimiter, agentAuth.verifyOtpForReset); // ← phone-keyed verify limit
router.post("/resetPassword",        otpVerifyLimiter, agentAuth.resetPassword);      // ← phone-keyed verify limit
router.post("/resendOtpForReset",    otpRateLimiter, agentAuth.resendOtpForReset);

module.exports = router;
