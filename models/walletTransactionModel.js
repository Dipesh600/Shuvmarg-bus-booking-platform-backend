const mongoose = require("mongoose");

const walletTransactionSchema = new mongoose.Schema(
  {
    walletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wallet",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    type: {
      type: String,
      enum: ["credit", "debit"],
      required: true,
    },
    purpose: {
      type: String,
      enum: [
        "refund",
        "ticket_purchase",
        "bonus",
        "cashback",
        "promotional",
        "admin_adjustment",
        "reversal",
      ],
      required: true,
    },

    // Audit trail — reconcilable ledger fields
    balanceBefore: {
      type: Number,
      required: true,
    },
    balanceAfter: {
      type: Number,
      required: true,
    },

    // Polymorphic reference — links to Booking, Refund, or any future entity
    referenceType: {
      type: String,
      enum: ["booking", "refund", "admin", "system"],
      default: null,
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },

    // Transaction lifecycle
    status: {
      type: String,
      enum: ["completed", "reversed"],
      default: "completed",
    },

    remarks: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// Compound index for fast user-scoped queries
walletTransactionSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("WalletTransaction", walletTransactionSchema);
