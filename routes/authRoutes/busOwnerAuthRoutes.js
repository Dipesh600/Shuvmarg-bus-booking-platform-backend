/**
 * routes/authRoutes/busOwnerAuthRoutes.js
 *
 * Self-registration endpoints for the bus owner web portal.
 * Mounted at /api/auth/busowner
 */

const express = require("express");
const router = express.Router();
const busOwnerAuth = require("../../controllers/authControllers.js/busOwnerAuthController.js");
const otpRateLimiter = require("../../middleware/otpRateLimiter.js");

// 3-step self-registration
router.post("/sendOTP",    otpRateLimiter, busOwnerAuth.sendOTP);
router.post("/verifyOTP",  busOwnerAuth.verifyOTP);
router.post("/register",   busOwnerAuth.register);

module.exports = router;
