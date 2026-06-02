const mongoose = require("mongoose");

/**
 * Scratch Cards — Tap-to-reveal cashback cards
 *
 * From spec §2.4:
 *   - One scratch card per confirmed booking regardless of passenger count
 *   - Amount is pre-generated server-side at booking time
 *   - The cashback CREDIT is created immediately (balance reflects it)
 *   - Scratching is a purely UI event — no ledger state change
 *   - If booking is cancelled before scratch → card shows "reversed"
 *   - If 90 days pass without scratching → card expires (visual only)
 *
 * The `ledgerEntryId` links this card to its CASHBACK credit in sm_ledger.
 * The amount hidden behind the scratch overlay is always the same as the
 * credit amount — it's just a reveal mechanic, not a separate financial event.
 */

const scratchCardSchema = new mongoose.Schema(
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
    },

    // Pre-generated cashback amount — hidden until user scratches
    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    // Lifecycle of the scratch card
    status: {
      type: String,
      enum: [
        "UNSCRATCHED",  // Card exists, amount hidden, waiting for user to scratch
        "SCRATCHED",    // User revealed the amount — purely visual event
        "CLAWED_BACK",  // Booking was cancelled — card greyed out
        "EXPIRED",      // 90 days passed without scratching
      ],
      default: "UNSCRATCHED",
      index: true,
    },

    // When the user scratched (null if unscratched)
    scratchedAt: {
      type: Date,
      default: null,
    },

    // Reference to the CASHBACK credit entry in sm_ledger
    ledgerEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SMLedger",
      required: true,
    },

    // 90 days from creation — after this, card expires visually
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

// Find unscratched cards for a user (wallet screen horizontal scroll)
scratchCardSchema.index({ userId: 1, status: 1, createdAt: -1 });

// Expiry cron: find cards that need to be expired
scratchCardSchema.index({ status: 1, expiresAt: 1 });

// Booking lookup: find card for a specific booking (for clawback)
scratchCardSchema.index({ bookingId: 1 });

module.exports = mongoose.model("ScratchCard", scratchCardSchema);
