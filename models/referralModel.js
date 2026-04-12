const mongoose = require("mongoose");

const referralHistorySchema = new mongoose.Schema({
  // User A (the one who used the referral code)
  referredUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  // User B (the one who owns the referral code)
  referrerUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  // Points awarded to User A (referred user)
  referredUserPoints: {
    type: Number,
    default: 0,
    min: 0,
  },
  // Points awarded to User B (referrer)
  referrerPoints: {
    type: Number,
    default: 0,
    min: 0,
  },
  // The referral code that was used (User B's code)
  usedReferralCode: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
  },
  // Status of the referral
  status: {
    type: String,
    enum: ["pending", "completed", "cancelled", "expired"],
    default: "completed",
  },
  // Type of referral reward
  rewardType: {
    type: String,
    enum: ["signup_bonus", "refral_point", "milestone_reward"],
    default: "refral_point",
  },
  // Additional metadata
  metadata: {
    // IP address when referral was used
    ipAddress: {
      type: String,
      default: null,
    },
    // Device info
    deviceInfo: {
      type: String,
      default: null,
    },
    // Campaign or source tracking
    campaign: {
      type: String,
      default: null,
    },
  },
  // Expiry date for the referral (if applicable)
  expiresAt: {
    type: Date,
    default: null,
  },
  // Notes or comments
  notes: {
    type: String,
    default: null,
  },
  // Whether points have been credited
  pointsCredited: {
    type: Boolean,
    default: true,
  },
  // Transaction IDs for point credits
  referredUserTransactionId: {
    type: String,
    default: null,
  },
  referrerTransactionId: {
    type: String,
    default: null,
  },
}, {
  timestamps: true, 
});


module.exports = mongoose.model("ReferralHistory", referralHistorySchema);
