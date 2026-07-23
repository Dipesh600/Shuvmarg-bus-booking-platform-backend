"use strict";

const crypto = require("crypto");

/**
 * Fail fast at module load time if the required HMAC secret is absent.
 * A missing SECRET_KEY would silently compute OTP hashes with a known
 * string — any developer with repo access could pre-compute the entire
 * 6-digit keyspace offline.
 */
const OTP_HMAC_SECRET = process.env.SECRET_KEY;

if (!OTP_HMAC_SECRET) {
  throw new Error(
    "[otpHelper] SECRET_KEY environment variable is required for OTP HMAC but is not set. " +
      "Set it in your .env file and restart the server."
  );
}

/**
 * Generate a keyed HMAC for an OTP.
 * Prevents offline brute-forcing of the 6-digit keyspace if the DB is compromised.
 * @param {string} otp
 * @returns {string} 64-character hex string
 */
const hashOTP = (otp) =>
  crypto
    .createHmac("sha256", OTP_HMAC_SECRET)
    .update(String(otp))
    .digest("hex");

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
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }

  if (a.length !== b.length) {
    return false;
  }

  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");

  return crypto.timingSafeEqual(bufA, bufB);
};

module.exports = {
  hashOTP,
  generateOtpCode,
  safeCompare,
};
