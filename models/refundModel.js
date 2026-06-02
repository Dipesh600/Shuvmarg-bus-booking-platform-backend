const mongoose = require("mongoose");

const refundSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      index: true,
    },
    // The original payment transaction to be reversed
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      default: null,
      index: true,
    },
    originalAmount: {
      type: Number,
      required: true,
    },
    cancellationCharge: {
      type: Number,
      required: true,
      default: 0,
    },
    refundAmount: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "rejected", "not_applicable"],
      default: "pending",
      index: true,
    },
    requestedAt: {
      type: Date,
      default: Date.now,
    },
    processedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    reason: {
      type: String,
      required: true,
    },
    remarks: {
      type: String,
      default: null,
    },
    refundProof: {
      type: String,
      default: null,
    },

    // Which admin approved/processed the refund
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // The gateway refund reference (from eSewa/Khalti reversal API)
    refundGateway: {
      type: String,
      enum: ["esewa", "khalti", "bank_transfer", "cash", "yatra_balance", "other"],
      default: null,
    },
    refundGatewayId: {
      type: String,   // Reference ID returned by eSewa/Khalti refund API
      default: null,
    },
    refundGatewayResponse: {
      type: mongoose.Schema.Types.Mixed,  // Full JSON response from gateway
      default: null,
    },
  },
  { timestamps: true }
);

// Indexes for common queries
refundSchema.index({ bookingId: 1 });
refundSchema.index({ userId: 1, createdAt: -1 });
refundSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("Refund", refundSchema);
