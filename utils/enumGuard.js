/**
 * utils/enumGuard.js
 *
 * Anti-enumeration primitives for public authentication endpoints.
 *
 * THREAT
 * ──────
 * An unauthenticated attacker submits phone numbers to public registration or
 * password-reset endpoints.  A distinct HTTP status, JSON field, or response
 * latency for "phone already registered" vs "phone not found" lets the attacker
 * map Shuvmarg users.  That map powers phishing, credential stuffing, and
 * SIM-swap attacks.
 *
 * DEFENCE STRATEGY
 * ────────────────
 * 1. Uniform HTTP 200 responses on sendOTP endpoints (in each controller)
 *    The controllers check registration status and decide whether to send an OTP,
 *    but they always return the SAME 200 body regardless of the outcome.
 *    No distinct 409 / 403 status codes are emitted on public OTP endpoints.
 *
 * 2. OTP-first ordering (password-reset verifyOtpForReset endpoints)
 *    The submitted OTP is validated BEFORE the user record is fetched.
 *    If the OTP is invalid, the function returns immediately with a generic error
 *    so there is no timing difference between "wrong OTP" and "phone not found".
 *
 * 3. Minimum-latency padding (requestPasswordReset endpoints)
 *    When the fast path (user not found, early return) is measurably faster than
 *    the slow path (user found + OTP sent via SMS), a minimum wall-clock delay
 *    is enforced on the fast path so a timing side-channel cannot be exploited.
 *
 * EXPORTS
 * ───────
 * • withMinimumLatency(fn, minMs)
 *   Runs `fn` and pads the response to at least `minMs` milliseconds.
 *
 * • otpFirstVerify(phone, cleanOtp, purpose, markUsed, verifyFn, userLookupFn)
 *   Validates OTP before fetching the user record.
 */

"use strict";

/**
 * Wraps an async action so it always takes at least `minMs` wall-clock ms.
 *
 * Used on requestPasswordReset: when the user is not found the function returns
 * almost immediately, whereas a valid account goes through a DB lookup + SMS
 * dispatch (~200-400 ms).  Padding the fast path to 600 ms makes the two
 * outcomes indistinguishable by timing.
 *
 * @param {Function} fn     Async function to execute.
 * @param {number}   minMs  Minimum response time in milliseconds.
 * @returns {Promise<any>}  Whatever `fn` resolves with.
 */
const withMinimumLatency = async (fn, minMs = 600) => {
  const start = Date.now();
  const result = await fn();
  const elapsed = Date.now() - start;
  if (elapsed < minMs) {
    await new Promise((r) => setTimeout(r, minMs - elapsed));
  }
  return result;
};

/**
 * OTP-first verification for the verifyOtpForReset family of endpoints.
 *
 * Checks the submitted OTP BEFORE looking up the user record.  This eliminates
 * the timing and response-code side-channel that existed when the user lookup
 * came first: a missing user returned immediately, while a valid phone went
 * through an OTP DB read + comparison.
 *
 * @param {string}   phone        Normalised phone number.
 * @param {string}   cleanOtp     Sanitised 6-digit OTP string.
 * @param {string}   purpose      OTP purpose (e.g. "PASSWORD_RESET").
 * @param {boolean}  markUsed     Whether to consume (mark used) the OTP now.
 *                                Pass false for the "peek" step; resetPassword
 *                                passes true to actually consume it.
 * @param {Function} verifyFn     The verifyOTPCode utility.
 * @param {Function} userLookupFn async (phone) → User|null
 * @returns {Promise<{ valid: boolean, user: Object|null, error: string|null }>}
 *   `error` is always a generic, client-safe string when `valid` is false.
 *   The actual reason (wrong OTP vs unknown phone) is never disclosed.
 */
const otpFirstVerify = async (
  phone,
  cleanOtp,
  purpose,
  markUsed,
  verifyFn,
  userLookupFn
) => {
  // Step 1: Validate OTP. If invalid, stop here — no user lookup, no leak.
  const otpResult = await verifyFn(phone, cleanOtp, purpose, markUsed);
  if (!otpResult.valid) {
    return { valid: false, user: null, error: "Invalid or expired verification code." };
  }

  // Step 2: OTP is valid. Now fetch the user.
  const user = await userLookupFn(phone);
  if (!user) {
    // Stale OTP from a deleted account or data anomaly — treat identically to wrong OTP.
    return { valid: false, user: null, error: "Invalid or expired verification code." };
  }

  return { valid: true, user, error: null };
};

module.exports = { withMinimumLatency, otpFirstVerify };
