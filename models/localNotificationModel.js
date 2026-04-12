const mongoose = require("mongoose");

const NOTIFICATION_TYPES = [
  "BOOKING_CONFIRMED",
  "TICKET_CANCELLED",
  "REFERRAL_BONUS",
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
