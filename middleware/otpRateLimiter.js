/**
 * middleware/otpRateLimiter.js
 *
 * Three middlewares:
 *
 * 1. validatePhonePresent  — sanity-check used on OTP *send* routes (sendOTP, resendOTP).
 *    The real send-rate enforcement lives in createAndSendOTP() via `blockedUntil`.
 *
 * 2. otpVerifyLimiter      — rate limiter keyed by PHONE NUMBER (not IP) applied to
 *    all OTP *verification* routes (verifyPhoneOTP, verifyOtpForReset, resetPassword).
 *
 *    Why phone-keyed, not IP-keyed?
 *    An attacker can rotate IPs to bypass a global IP limiter. Keying by phone means
 *    distributing across IPs provides zero benefit — all attempts against the same
 *    phone are counted together regardless of source IP.
 *
 *    10 requests per phone per 10 minutes. Combined with the 5-attempt atomic DB
 *    cap inside verifyOTPCode(), an attacker gets at most 10 HTTP-level attempts,
 *    of which only 5 can ever reach the DB comparison before the OTP is dead.
 *
 *    The phone is extracted from req.body before the limit check. If no phone is
 *    present the request falls through to validatePhonePresent which will reject it.
 *
 * 3. otpSendLimiter        — rate limiter keyed by IP ADDRESS applied to all OTP
 *    *send* routes (sendOTP, resendOTP, requestPasswordReset).
 *
 *    Why IP-keyed here?
 *    This layer prevents volumetric abuse: a single attacker machine cannot use our
 *    SMS gateway to send OTPs to thousands of different phone numbers per hour.
 *    20 requests per IP per 15 minutes is permissive enough for legitimate users
 *    (who only ever hit it 1–3 times) but blocks automated scripts.
 *
 *    This is a defence-in-depth complement to the per-phone cooldown and block
 *    logic inside createAndSendOTP(). Both layers must be satisfied to send an OTP.
 */

const rateLimit = require("express-rate-limit");

// ── 1. Phone-presence sanity check (for send/resend routes) ──────────────────

const validatePhonePresent = (req, res, next) => {
  const phone = req.body?.phone || req.body?.emailOrPhone;

  if (!phone) {
    return res.status(400).json({
      success: false,
      message: "Phone number is required.",
    });
  }

  next();
};

// ── 2. Phone-keyed rate limiter for OTP verify routes ────────────────────────

const otpVerifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,   // 10-minute window
  max: 10,                     // 10 attempts per phone per window
  keyGenerator: (req) => {
    // Key by phone number, not IP — IP rotation provides zero benefit
    const phone = req.body?.phone || req.body?.emailOrPhone || req.ip;
    return String(phone).replace(/\s+/g, "").toLowerCase();
  },
  message: {
    success: false,
    message: "Too many verification attempts for this phone number. Please wait 10 minutes.",
    errorCode: "OTP_VERIFY_RATE_LIMIT",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,  // Count every attempt, including successes
});

// ── 3. IP-keyed rate limiter for OTP send routes (volumetric protection) ──────
//
// Prevents a single machine from bombing thousands of different phone numbers.
// 20 OTP-send requests per IP per 15 minutes.
// This is distinct from the per-phone cooldown/block enforced by createAndSendOTP().

const otpSendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15-minute window
  max: 20,                     // 20 OTP send requests per IP
  keyGenerator: (req) => req.ip,
  message: {
    success: false,
    message: "Too many OTP requests from this device. Please wait 15 minutes.",
    errorCode: "OTP_SEND_IP_RATE_LIMIT",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

module.exports = validatePhonePresent;
module.exports.otpVerifyLimiter = otpVerifyLimiter;
module.exports.otpSendLimiter = otpSendLimiter;
