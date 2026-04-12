const mongoose = require("mongoose");

const yatraPointsHistorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["earn", "redeem"],
      required: true,
      index: true,
    },
    points: {
      type: Number,
      required: true,
      min: 0,
    },
    balanceBefore: {
      type: Number,
      required: true,
      min: 0,
    },
    balanceAfter: {
      type: Number,
      required: true,
      min: 0,
    },
    // Optional booking/schedule references for traceability
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
      index: true,
    },
    scheduleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "busschedules",
      default: null,
    },
    ticketId: {
      type: String,
      default: null,
      index: true,
    },
    description: {
      type: String,
      default: null,
      trim: true,
    },
    meta: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true }
);

yatraPointsHistorySchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("YatraPointsHistory", yatraPointsHistorySchema);
