const mongoose = require("mongoose");

const walletSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    balance: {
      type: Number,
      required: true,
      default: 0,
      // NOTE: min:0 removed — spec §11.1 allows negative balance
      // when cashback clawback exceeds current balance.
      // Display layer shows max(0, balance) to user.
    },
    // Preserved during migration from stored-balance to ledger-computed-balance.
    // Set once by migrate-to-sm-ledger.js, never written again.
    legacyBalance: {
      type: Number,
      default: null,
    },
    currency: {
      type: String,
      default: "NPR",
    },
    status: {
      type: String,
      enum: ["active", "frozen"],
      default: "active",
    },
    pin: {
      type: String,
      default: null,
    },
    isPinSet: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Wallet", walletSchema);
