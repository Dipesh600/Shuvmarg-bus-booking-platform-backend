const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    unique: true,
  },
  otp: {
    type: String,
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
    default: 3,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

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
