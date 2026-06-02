/**
 * routes/authRoutes/agentAuthRoutes.js
 *
 * Self-registration endpoints for the agent app.
 * Mounted at /api/auth/agent
 */

const express = require("express");
const router = express.Router();
const agentAuth = require("../../controllers/authControllers.js/agentAuthController.js");
const otpRateLimiter = require("../../middleware/otpRateLimiter.js");

// 3-step self-registration
router.post("/sendOTP",    otpRateLimiter, agentAuth.sendOTP);
router.post("/verifyOTP",  agentAuth.verifyOTP);
router.post("/register",   agentAuth.register);

module.exports = router;
