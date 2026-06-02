const mongoose = require("mongoose");

const NOTIFICATION_TYPES = [
  // Booking & Payment
  "BOOKING_CONFIRMED",
  "TICKET_CANCELLED",
  "DISPUTED_PAYMENT",
  "PAYMENT_DISPUTE",
  "DISPUTE_RESOLVED",

  // Referrals & Promotions
  "REFERRAL_BONUS",
  "COUPON_OFFER",

  // KYC & Verification
  "AGENT_KYC_UPDATE",
  "BUS_OWNER_KYC_UPDATE",

  // Fleet & Operations
  "FLEET_STATUS_UPDATE",

  // Admin Communications
  "ADMIN_BROADCAST",
  "ADMIN_SINGLE_PUSH",

  // Catch-all
  "GENERAL",
];

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  type: {
    type: String,
    enum: NOTIFICATION_TYPES,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  isRead: {
    type: Boolean,
    default: false,
  },
  meta: {
    type: Object, // For any extra data (e.g., ticketId, referralId, etc.)
    default: {},
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Notification", notificationSchema);
