const mongoose = require("mongoose");

const refundSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
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
      type: String, // URL/Path to screenshot or document (png, pdf, doc etc)
      default: null,
    },

  },
  { timestamps: true }
);

// Indexes for common queries
refundSchema.index({ bookingId: 1 });

module.exports = mongoose.model("Refund", refundSchema);
