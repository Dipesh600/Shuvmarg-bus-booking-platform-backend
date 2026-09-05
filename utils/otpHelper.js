/** Central OTP issuance/verification with purpose isolation, keyed hashes and shared attempt/send limits. */

const OTP = require("../models/otpModel.js");
const sendSMS = require("../handlers/sparro-otp.js");
const {
  hashOTP,
  generateOtpCode,
  safeCompare,
} = require("../src/shared/auth/otp-code.crypto.js");

const OTP_EXPIRY_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;    // wrong guesses before the code is dead
const MAX_OTP_SENDS = 3;        // max OTP sends per phone+purpose per window
const BLOCK_DURATION_MS = 10 * 60 * 1000;  // 10 minutes
const OTP_SEND_COOLDOWN_MS = 60 * 1000;    // 60-second cooldown between sends

/**
 * Human-readable SMS prefix per OTP purpose.
 */
const PREFIX_MAP = {
  REGISTRATION:           "Your Shuv Marg Verification code is",
  PASSWORD_RESET:         "Your Shuv Marg account recovery code is",
  PHONE_CHANGE:           "Your Shuv Marg Phone Change code is",
  ACCOUNT_ACTIVATION:     "Your Shuv Marg Account Activation code is",
  BUSOWNER_REGISTRATION:  "Your Shuv Marg Operator Verification code is",
  BUSOWNER_PASSWORD_RESET:"Your Shuv Marg Operator Password Reset code is",
  AGENT_REGISTRATION:     "Your Shuv Marg Agent Verification code is",
  AGENT_PASSWORD_RESET:   "Your Shuv Marg Agent Password Reset code is",
  DRIVER_PASSWORD_RESET:  "Your Shuv Marg Driver Password Reset code is",
};

const otpSnapshot = (record) => record ? {
  otp: record.otp,
  otpExpiry: record.otpExpiry,
  isUsed: record.isUsed,
  attempts: record.attempts,
  maxAttempts: record.maxAttempts,
  sendCount: record.sendCount,
  blockedUntil: record.blockedUntil,
  lastSentAt: record.lastSentAt,
} : null;

const rollbackFailedDelivery = async ({ existing, previous, phone, purpose, hashedOtp }) => {
  if (existing?._id && previous) {
    await OTP.findOneAndUpdate(
      { _id: existing._id, otp: hashedOtp },
      { $set: previous },
    );
    return;
  }
  await OTP.deleteOne({ phone, purpose, otp: hashedOtp });
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
 * @param {Function} [send=sendSMS] - Injectable only for deterministic tests.
 * @returns {Promise<{ success: boolean, expiresIn: string }>}
 */
const createAndSendOTP = async (phone, purpose, customPrefix = null, send = sendSMS) => {
  // ── Check 1: Hard block (send-count exhausted) ─────────────────────────────
  const existing = await OTP.findOne({ phone, purpose });
  const previous = otpSnapshot(existing);
  if (existing && existing.isBlocked()) {
    const unblockAt = new Date(existing.blockedUntil);
    const minutesLeft = Math.ceil((unblockAt - Date.now()) / 60000);
    const err = new Error(`OTP_SEND_BLOCKED:${minutesLeft}`);
    err.statusCode = 429;
    err.minutesLeft = minutesLeft;
    throw err;
  }

  // ── Check 2: Cooldown (60-second gap between sends) ──────────────────────────
  if (existing && existing.lastSentAt) {
    const elapsed = Date.now() - new Date(existing.lastSentAt).getTime();
    if (elapsed < OTP_SEND_COOLDOWN_MS) {
      const secondsLeft = Math.ceil((OTP_SEND_COOLDOWN_MS - elapsed) / 1000);
      const err = new Error(`OTP_COOLDOWN:${secondsLeft}`);
      err.statusCode = 429;
      err.secondsLeft = secondsLeft;
      throw err;
    }
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

  const hashedOtp = hashOTP(otpCode);

  // Upsert: reset OTP, attempts, and expiry — but preserve/update send-rate fields
  await OTP.findOneAndUpdate(
    { phone, purpose },
    {
      otp: hashedOtp,
      otpExpiry,
      isUsed: false,
      attempts: 0,
      maxAttempts: OTP_MAX_ATTEMPTS,
      sendCount: newSendCount,
      blockedUntil: newBlockedUntil,
      lastSentAt: new Date(),       // stamp for cooldown enforcement
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const prefix = customPrefix || PREFIX_MAP[purpose] || "Your Shuv Marg code is";
  const message = `${prefix}: ${otpCode}. Valid for ${OTP_EXPIRY_MINUTES} minutes. Do not share this code.`;

  try {
    await send(phone, message);
  } catch (deliveryError) {
    // The OTP is reserved before contacting the provider so a queued SMS can
    // never contain a code that is absent from the database. If queueing fails,
    // restore the prior OTP state (or delete a first-time reservation) with a
    // compare-and-swap filter. A failed provider call must not consume a resend,
    // create a cooldown, or leave an undelivered code valid.
    try {
      await rollbackFailedDelivery({ existing, previous, phone, purpose, hashedOtp });
    } catch (rollbackError) {
      console.error('[OTP rollback] Failed after SMS delivery error:', rollbackError.message);
    }
    throw deliveryError;
  }

  return {
    success: true,
    expiresIn: `${OTP_EXPIRY_MINUTES} minutes`,
  };
};

/**
 * Verify an OTP for a given phone and purpose.
 *
 * SECURITY — RACE CONDITION FIX (HIGH severity):
 *
 * Previous implementation used a read → check → separate save pattern:
 *   1. findOne()  → reads attempts = N
 *   2. N < max?   → yes, proceed
 *   3. incrementAttempts() → this.attempts += 1; this.save()
 *
 * Under parallel requests, all goroutines read the same N and all pass
 * the check, allowing substantially more than maxAttempts wrong guesses.
 *
 * Fix: ALL state mutations now use atomic findOneAndUpdate with a
 * conditional filter that enforces the constraint at the database level:
 *
 *   Attempt increment:
 *     filter: { phone, purpose, isUsed: false, attempts: { $lt: maxAttempts }, otpExpiry: { $gt: now } }
 *     update: { $inc: { attempts: 1 } }
 *
 *   Mark as used:
 *     filter: { phone, purpose, isUsed: false, otpExpiry: { $gt: now } }
 *     update: { $set: { isUsed: true } }
 *
 * MongoDB guarantees these are atomic. Concurrent requests racing on the
 * same document: only those that find the document in the valid state win.
 * Subsequent requests get null back and fail safely.
 *
 * @param {string} phone
 * @param {string} otp - The code submitted by the user
 * @param {string} purpose
 * @param {boolean} [markUsed=true] - Mark OTP as used after a successful verify
 * @returns {Promise<{ valid: boolean, error: string|null }>}
 */
const verifyOTPCode = async (phone, otp, purpose, markUsed = true) => {
  const now = new Date();

  // ── Step 1: Lightweight initial read for human-readable error messages ─────
  // This read is informational only. The security gates are the atomic updates below.
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

  // Inform the caller if attempts are already exhausted (informational — not the gate)
  if (otpRecord.attempts >= otpRecord.maxAttempts) {
    // Atomically set the send block so attacker cannot immediately request a fresh OTP
    await OTP.findOneAndUpdate(
      { phone, purpose, $or: [{ blockedUntil: null }, { blockedUntil: { $lt: now } }] },
      { $set: { blockedUntil: new Date(Date.now() + BLOCK_DURATION_MS) } }
    );
    return { valid: false, error: "Maximum attempts exceeded. Please wait before requesting a new code." };
  }

  // ── Step 2: Constant-time comparison (timing-safe) ────────────────────────
  // Hash the incoming OTP using the same secret before comparing it to the DB value
  const hashedInput = hashOTP(otp);
  const codeMatches = safeCompare(String(otpRecord.otp), String(hashedInput));

  if (!codeMatches) {
    // ── ATOMIC increment — the real security gate ─────────────────────────────
    // The filter enforces the constraint at the DB level in a single operation.
    // Concurrent requests are serialized by MongoDB; once attempts reaches
    // maxAttempts the filter stops matching and all subsequent attempts return null.
    const updated = await OTP.findOneAndUpdate(
      {
        phone,
        purpose,
        isUsed: false,
        otpExpiry: { $gt: now },
        attempts: { $lt: otpRecord.maxAttempts },   // ← atomic guard (this IS the cap)
      },
      { $inc: { attempts: 1 } },
      { new: true }
    );

    if (!updated) {
      // Document no longer matches — either expired, already used, or maxAttempts
      // was just hit by a concurrent request. Apply the send block and refuse.
      await OTP.findOneAndUpdate(
        { phone, purpose, $or: [{ blockedUntil: null }, { blockedUntil: { $lt: now } }] },
        { $set: { blockedUntil: new Date(Date.now() + BLOCK_DURATION_MS) } }
      );
      return { valid: false, error: "Maximum attempts exceeded. Please wait before requesting a new code." };
    }

    // Apply send-block when this was the final allowed attempt
    if (updated.attempts >= updated.maxAttempts) {
      await OTP.findOneAndUpdate(
        { phone, purpose, $or: [{ blockedUntil: null }, { blockedUntil: { $lt: now } }] },
        { $set: { blockedUntil: new Date(Date.now() + BLOCK_DURATION_MS) } }
      );
    }

    const remaining = updated.maxAttempts - updated.attempts;
    return {
      valid: false,
      error: remaining > 0
        ? `Incorrect OTP. ${remaining} attempt(s) remaining.`
        : "Maximum attempts exceeded. Please wait before requesting a new code.",
    };
  }

  // ── Step 3: Correct code — atomically mark as used ────────────────────────
  if (markUsed) {
    // Single atomic operation: only succeeds if still unused and unexpired.
    // Prevents a race where two concurrent correct-OTP requests both mark success.
    const consumed = await OTP.findOneAndUpdate(
      {
        phone,
        purpose,
        isUsed: false,            // ← atomic guard: only one request can win
        otpExpiry: { $gt: now },
      },
      { $set: { isUsed: true } },
      { new: true }
    );

    if (!consumed) {
      // A concurrent request already consumed this OTP
      return { valid: false, error: "This OTP has already been used. Please request a new code." };
    }
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
