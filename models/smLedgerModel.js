const mongoose = require("mongoose");

/**
 * SM Ledger — Append-Only Financial Ledger for Shuvmarg Money
 *
 * DESIGN PRINCIPLES (from spec §1.3, §1.4):
 *   1. APPEND-ONLY: Records are never updated or deleted.
 *      Corrections are new entries (e.g. CLAWBACK reverses a CASHBACK).
 *   2. AMOUNT IS ALWAYS POSITIVE: Direction is a separate field.
 *      Never infer direction from sign.
 *   3. BALANCE IS COMPUTED: Spendable balance = sum(ACTIVE credits) − sum(debits).
 *      Never stored as a single mutable number.
 *
 * This collection replaces `WalletTransaction` as the authoritative record.
 * WalletTransaction is kept for historical audit but receives no new writes
 * after migration.
 */

const consumedBySchema = new mongoose.Schema(
  {
    debitLedgerEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SMLedger",
      required: true,
    },
    amountConsumed: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const smLedgerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Booking that triggered this entry (null for referral locked, admin actions)
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
    },

    // Referral relationship this entry belongs to (null if not referral-related)
    referralId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ReferralV2",
      default: null,
    },

    // For CLAWBACK/REVERSAL entries — points to the original CREDIT being reversed
    relatedLedgerEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SMLedger",
      default: null,
    },

    // What kind of SM Money event this is
    type: {
      type: String,
      enum: [
        "CASHBACK",           // Earned on booking confirmation
        "CASHBACK_CLAWBACK",  // Reversed when booking cancelled
        "REFERRAL_LOCKED",    // NPR 100 locked when friend signs up
        "REFERRAL_UNLOCK",    // Progressive unlock (30→20→20→20→10)
        "REFUND",             // Booking cancelled, refund to SM Money
        "DEBIT",              // SM Money spent at checkout
        "DEBIT_REVERSAL",     // SM Money restored when gateway payment fails
        "EXPIRY",             // System debit when credit expires (12 months)
        "ADMIN_CREDIT",       // Manual credit by admin (reason required)
        "ADMIN_DEBIT",        // Manual debit by admin (reason required)
      ],
      required: true,
    },

    // CREDIT or DEBIT — never infer from sign
    direction: {
      type: String,
      enum: ["CREDIT", "DEBIT"],
      required: true,
    },

    // Always positive — direction field determines sign
    amount: {
      type: Number,
      required: true,
      min: 0.01, // Prevent zero-amount entries
    },

    // Lifecycle status of this entry
    status: {
      type: String,
      enum: [
        // For CREDITs:
        "ACTIVE",       // Credited, available in balance
        "USED",         // Fully consumed at checkout
        "EXPIRED",      // 12 months passed without spending
        "CLAWED_BACK",  // Booking cancelled, amount reversed
        "VOIDED",       // Admin action (fraud or error correction)
        "LOCKED",       // Referral locked — not yet unlocked
        // For DEBITs:
        "PROCESSED",    // Debit completed
      ],
      required: true,
    },

    // For REFERRAL_UNLOCK type: which booking number (1-5) triggered this unlock
    bookingNumber: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
    },

    // When this credit expires (12 months from creation for most types)
    expires_at: {
      type: Date,
      default: null, // Null for DEBIT entries
    },

    // Populated when this CREDIT is spent — tracks FIFO consumption
    // Each element records which debit entry consumed how much from this credit
    consumedBy: {
      type: [consumedBySchema],
      default: [],
    },

    // How much of this credit remains available (for partial consumption tracking)
    remainingAmount: {
      type: Number,
      default: null, // Set to `amount` on CREDIT creation, decremented on consumption
    },

    // Audit trail — human-readable description of what happened
    note: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// ═══════════════════════════════════════════════════════════════════════
// INDEXES — from spec §8.1, optimized for the exact queries we'll run
// ═══════════════════════════════════════════════════════════════════════

// Balance query: sum ACTIVE credits with valid expiry
smLedgerSchema.index({ userId: 1, status: 1, expires_at: 1 });

// Activity feed: user's ledger entries sorted by date, filterable by type
smLedgerSchema.index({ userId: 1, direction: 1, type: 1, createdAt: -1 });

// Booking-level lookup: find all entries for a specific booking (for clawback)
smLedgerSchema.index({ bookingId: 1 });

// Referral unlock dedup: ensure we don't double-credit the same booking number
smLedgerSchema.index({ referralId: 1, bookingNumber: 1 });

// Locked balance query: user's locked referral entries
smLedgerSchema.index({ userId: 1, type: 1, status: 1 });

// FIFO consumption: oldest-expiring ACTIVE credits first
smLedgerSchema.index({ userId: 1, status: 1, direction: 1, expires_at: 1 });

// Expiry cron: find all entries that need to be expired
smLedgerSchema.index({ status: 1, expires_at: 1 });

module.exports = mongoose.model("SMLedger", smLedgerSchema);
