/**
 * routes/authRoutes/passengerAuthRoutes.js
 *
 * Auth endpoints for passenger OTP authentication.
 * Mounted at /api/auth/passenger
 *
 * Public (no JWT):
 *   POST /sendOTP   — request a passenger authentication OTP (rate-limited)
 *   POST /verifyOTP — verify OTP and receive a session (rate-limited)
 */

'use strict';

const express = require('express');
const router = express.Router();
const passengerOtpAuth = require('../../src/modules/auth/passenger-otp-auth');
const otpRateLimiter = require('../../middleware/otpRateLimiter.js');
const { otpVerifyLimiter } = require('../../middleware/otpRateLimiter.js');

// otpRateLimiter validates that a phone is present in the request body
// (validatePhonePresent middleware) — prevents blank requests reaching the service.
// The per-phone 60-second cooldown and 3-send block are enforced atomically inside
// createAndSendOTP(); stacking otpSendLimiter on top is not necessary here.
router.post('/sendOTP', otpRateLimiter, passengerOtpAuth.sendOTP);

// otpVerifyLimiter keys by phone number (not IP) — rate-limits to 10 verify
// attempts per phone per 10 minutes, complementing the 5-attempt atomic DB cap.
router.post('/verifyOTP', otpVerifyLimiter, passengerOtpAuth.verifyOTP);

module.exports = router;
