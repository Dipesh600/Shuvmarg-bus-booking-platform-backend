/**
 * models/otpModel.js
 *
 * Schema for one-time passwords.
 *
 * Security design:
 *  - One document per { phone, purpose } — enforced by unique compound index.
 *  - `sendCount` tracks how many OTPs were sent in the current window.
 *  - `blockedUntil` is set when max sends are exhausted — blocks new OTP requests.
 *  - `maxAttempts` limits brute-force guessing. After exhaustion, a new OTP must be sent.
 *  - TTL index on `otpExpiry` auto-cleans expired records from MongoDB.
 */

const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    trim: true,
  },
  otp: {
    type: String,
    required: true,
  },
  purpose: {
    type: String,
    enum: [
      "REGISTRATION",
      "PASSWORD_RESET",
      "PHONE_CHANGE",
      "ACCOUNT_ACTIVATION",
      "BUSOWNER_REGISTRATION",
      "BUSOWNER_PASSWORD_RESET",
      "AGENT_REGISTRATION",
      "AGENT_PASSWORD_RESET",
    ],
    required: true,
  },
  otpExpiry: {
    type: Date,
    required: true,
  },
  isUsed: {
    type: Boolean,
    default: false,
  },
  attempts: {
    type: Number,
    default: 0,
  },
  maxAttempts: {
    type: Number,
    default: 5,
  },
  // How many OTPs have been sent for this phone+purpose in the current window.
  // Resets to 1 when a fresh OTP is created (upsert). Incremented on resend.
  sendCount: {
    type: Number,
    default: 1,
  },
  // When set, blocks any new OTP sends for this phone+purpose until this time.
  // Set when sendCount hits MAX_OTP_SENDS or when maxAttempts is exhausted.
  blockedUntil: {
    type: Date,
    default: null,
  },
  // Timestamp of the last successful OTP send.
  // Used to enforce a minimum cooldown between consecutive sends.
  lastSentAt: {
    type: Date,
    default: null,
  },
}, { timestamps: true });

// Compound unique index: exactly one active OTP per phone per purpose
otpSchema.index({ phone: 1, purpose: 1 }, { unique: true });

// TTL index — MongoDB auto-removes expired OTP documents
otpSchema.index({ otpExpiry: 1 }, { expireAfterSeconds: 0 });

// --- Instance methods ---

/** True if the OTP code itself has expired */
otpSchema.methods.isExpired = function () {
  return Date.now() > this.otpExpiry;
};

/** True if the phone+purpose is currently blocked from receiving new OTPs */
otpSchema.methods.isBlocked = function () {
  return this.blockedUntil != null && Date.now() < this.blockedUntil;
};

/** True if this OTP record can still be verified (not used, not expired, attempts remain) */
otpSchema.methods.isValid = function () {
  return !this.isExpired() && !this.isUsed && this.attempts < this.maxAttempts;
};

/** Mark the OTP as consumed */
otpSchema.methods.markAsUsed = function () {
  this.isUsed = true;
  return this.save();
};

/** Increment failed attempt counter */
otpSchema.methods.incrementAttempts = function () {
  this.attempts += 1;
  return this.save();
};

module.exports = mongoose.model("OTP", otpSchema);
