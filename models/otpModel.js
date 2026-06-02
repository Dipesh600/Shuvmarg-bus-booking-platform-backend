const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
  },
  otp: {
    type: String,
    required: true,
  },
  purpose: {
    type: String,
    enum: ["REGISTRATION", "PASSWORD_RESET", "PHONE_CHANGE", "ACCOUNT_ACTIVATION"],
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
}, { timestamps: true });

// Compound index: one active OTP per phone per purpose
otpSchema.index({ phone: 1, purpose: 1 }, { unique: true });

// Index for automatic cleanup of expired OTPs
otpSchema.index({ otpExpiry: 1 }, { expireAfterSeconds: 0 });

// Method to check if OTP is expired
otpSchema.methods.isExpired = function() {
  return Date.now() > this.otpExpiry;
};

// Method to check if OTP is valid
otpSchema.methods.isValid = function() {
  return !this.isExpired() && !this.isUsed && this.attempts < this.maxAttempts;
};

// Method to mark OTP as used
otpSchema.methods.markAsUsed = function() {
  this.isUsed = true;
  return this.save();
};

// Method to increment attempts
otpSchema.methods.incrementAttempts = function() {
  this.attempts += 1;
  return this.save();
};

module.exports = mongoose.model("OTP", otpSchema);
