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
const agentSession  = require("../../src/modules/agent/auth/session");
const agentLogin    = require("../../src/modules/agent/auth/login");
const agentRegistration = require("../../src/modules/agent/auth/registration");
const agentPasswordReset = require("../../src/modules/agent/auth/password-reset");
const otpRateLimiter = require("../../middleware/otpRateLimiter.js");
const { otpVerifyLimiter } = require("../../middleware/otpRateLimiter.js");

// Strict rate limiter for login attempts (per account — 10 per 15 min)
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => {
    const identifier = req.body?.phone || req.body?.emailOrPhone || req.ip;
    return String(identifier).replace(/\s+/g, "").toLowerCase();
  },
  message: { success: false, message: "Too many login attempts. Please wait 15 minutes.", errorCode: "LOGIN_RATE_LIMIT" },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

// ── 3-step self-registration ──────────────────────────────────────────────────
router.post("/sendOTP",    otpRateLimiter, agentRegistration.sendOTP);
router.post("/verifyOTP",  otpVerifyLimiter, agentRegistration.verifyOTP);     // ← phone-keyed verify limit
router.post("/register",   agentRegistration.register);
router.post("/resendOTP",  otpRateLimiter, agentRegistration.resendOTP);

// ── Login ─────────────────────────────────────────────────────────────────────
router.post("/login", loginRateLimiter, agentLogin.login);

// ── Token management ──────────────────────────────────────────────────────────
router.post("/refresh", agentSession.refresh);
router.post("/logout",  agentSession.logout);

// ── Password reset ───────────────────────────────────────────────────────────
router.post("/requestPasswordReset", otpRateLimiter, agentPasswordReset.requestPasswordReset);
router.post("/verifyOtpForReset",    otpVerifyLimiter, agentPasswordReset.verifyOtpForReset); // ← phone-keyed verify limit
router.post("/resetPassword",        otpVerifyLimiter, agentPasswordReset.resetPassword);      // ← phone-keyed verify limit
router.post("/resendOtpForReset",    otpRateLimiter, agentPasswordReset.resendOtpForReset);

module.exports = router;
