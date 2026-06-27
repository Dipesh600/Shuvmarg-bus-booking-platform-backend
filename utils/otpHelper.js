/**
 * utils/otpHelper.js
 *
 * Centralized OTP generation and verification logic.
 * All auth flows must use these functions — never inline OTP logic.
 *
 * Security measures:
 *  - 6-digit OTP (900,000 combinations) via crypto.randomInt (CSPRNG)
 *  - Constant-time comparison via crypto.timingSafeEqual
 *  - Mandatory `purpose` field prevents cross-flow OTP reuse
 *  - `blockedUntil` prevents SMS bombing after sendCount is exhausted
 *  - Attempts are tracked; brute-force exhaustion triggers blockedUntil
 */

const crypto = require("crypto");
const OTP = require("../models/otpModel.js");
const sendSMS = require("../handlers/sparro-otp.js");

const OTP_EXPIRY_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;   // wrong guesses before the code is dead
const MAX_OTP_SENDS = 3;       // max OTP sends per phone+purpose per window
const BLOCK_DURATION_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Generate a cryptographically secure 6-digit OTP.
 * @returns {string}
 */
const generateOtpCode = () => {
  const code = crypto.randomInt(100000, 999999);
  return String(code);
};

/**
 * Constant-time string comparison — prevents timing side-channel attacks.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
const safeCompare = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  return crypto.timingSafeEqual(bufA, bufB);
};

/**
 * Human-readable SMS prefix per OTP purpose.
 */
const PREFIX_MAP = {
  REGISTRATION:           "Your Shuv Marg Verification code is",
  PASSWORD_RESET:         "Your Shuv Marg Password Reset code is",
  PHONE_CHANGE:           "Your Shuv Marg Phone Change code is",
  ACCOUNT_ACTIVATION:     "Your Shuv Marg Account Activation code is",
  BUSOWNER_REGISTRATION:  "Your Shuv Marg Operator Verification code is",
  BUSOWNER_PASSWORD_RESET:"Your Shuv Marg Operator Password Reset code is",
  AGENT_REGISTRATION:     "Your Shuv Marg Agent Verification code is",
  AGENT_PASSWORD_RESET:   "Your Shuv Marg Agent Password Reset code is",
};

/**
 * Create and send an OTP for a given phone and purpose.
 *
 * Rate limiting logic (no extra collection needed):
 *  - If an existing record is `blockedUntil > now`, reject with 429.
 *  - Fresh OTP: upsert with sendCount = 1, blockedUntil = null.
 *  - Resend:    increment sendCount. If >= MAX_OTP_SENDS, set blockedUntil.
 *
 * @param {string} phone
 * @param {string} purpose
 * @param {string|null} [customPrefix] - Override SMS prefix
 * @returns {Promise<{ success: boolean, expiresIn: string }>}
 */
const createAndSendOTP = async (phone, purpose, customPrefix = null) => {
  // Check if this phone+purpose is currently send-blocked
  const existing = await OTP.findOne({ phone, purpose });
  if (existing && existing.isBlocked()) {
    const unblockAt = new Date(existing.blockedUntil);
    const minutesLeft = Math.ceil((unblockAt - Date.now()) / 60000);
    const err = new Error(`OTP_SEND_BLOCKED:${minutesLeft}`);
    err.statusCode = 429;
    err.minutesLeft = minutesLeft;
    throw err;
  }

  const otpCode = generateOtpCode();
  const otpExpiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  let newSendCount = 1;
  let newBlockedUntil = null;

  if (existing) {
    // This is a resend — increment the counter
    newSendCount = (existing.sendCount || 1) + 1;
    if (newSendCount >= MAX_OTP_SENDS) {
      // Block further sends for BLOCK_DURATION_MS
      newBlockedUntil = new Date(Date.now() + BLOCK_DURATION_MS);
    }
  }

  // Upsert: reset OTP, attempts, and expiry — but preserve/update send-rate fields
  await OTP.findOneAndUpdate(
    { phone, purpose },
    {
      otp: otpCode,
      otpExpiry,
      isUsed: false,
      attempts: 0,
      maxAttempts: OTP_MAX_ATTEMPTS,
      sendCount: newSendCount,
      blockedUntil: newBlockedUntil,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const prefix = customPrefix || PREFIX_MAP[purpose] || "Your Shuv Marg code is";
  const message = `${prefix}: ${otpCode}. Valid for ${OTP_EXPIRY_MINUTES} minutes. Do not share this code.`;

  await sendSMS(phone, message);

  return {
    success: true,
    expiresIn: `${OTP_EXPIRY_MINUTES} minutes`,
  };
};

/**
 * Verify an OTP for a given phone and purpose.
 * Returns a detailed result object — never throws for expected failures.
 *
 * On brute-force exhaustion: sets `blockedUntil` to prevent sending a new OTP
 * immediately (forces the attacker to wait before trying again).
 *
 * @param {string} phone
 * @param {string} otp - The code submitted by the user
 * @param {string} purpose
 * @param {boolean} [markUsed=true] - Mark OTP as used after a successful verify
 * @returns {Promise<{ valid: boolean, error: string|null }>}
 */
const verifyOTPCode = async (phone, otp, purpose, markUsed = true) => {
  const otpRecord = await OTP.findOne({ phone, purpose });

  if (!otpRecord) {
    return { valid: false, error: "No OTP found. Please request a new code." };
  }

  if (otpRecord.isUsed) {
    return { valid: false, error: "This OTP has already been used. Please request a new code." };
  }

  if (otpRecord.isExpired()) {
    return { valid: false, error: "OTP has expired. Please request a new code." };
  }

  if (otpRecord.attempts >= otpRecord.maxAttempts) {
    // Enforce a send block so attacker can't immediately request a fresh OTP
    if (!otpRecord.isBlocked()) {
      otpRecord.blockedUntil = new Date(Date.now() + BLOCK_DURATION_MS);
      await otpRecord.save();
    }
    return { valid: false, error: "Maximum attempts exceeded. Please wait before requesting a new code." };
  }

  // Constant-time comparison
  if (!safeCompare(String(otpRecord.otp), String(otp))) {
    await otpRecord.incrementAttempts();
    const remaining = otpRecord.maxAttempts - otpRecord.attempts;
    return {
      valid: false,
      error: `Incorrect OTP. ${remaining} attempt(s) remaining.`,
    };
  }

  // ✅ Success
  if (markUsed) {
    await otpRecord.markAsUsed();
  }

  return { valid: true, error: null };
};

module.exports = {
  generateOtpCode,
  safeCompare,
  createAndSendOTP,
  verifyOTPCode,
  OTP_EXPIRY_MINUTES,
  MAX_OTP_SENDS,
};
