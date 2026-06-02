const mongoose = require("mongoose");

/**
 * ReferralV2 — Progressive Unlock Referral System
 *
 * SPEC REFERENCE: shuvmarg-money-spec.md §3, §8.2
 *
 * This model tracks the relationship between a referrer (User A) and a
 * referred user (User B). When User B signs up with User A's code:
 *   1. A ReferralV2 document is created (status: ACTIVE)
 *   2. NPR 100 is LOCKED in User A's SM Ledger (REFERRAL_LOCKED)
 *   3. NPR unlocks progressively as User B completes journeys:
 *      Journey 1 → NPR 30, 2 → 20, 3 → 20, 4 → 20, 5 → 10
 *
 * CRITICAL: Unlock triggers ONLY on journey.status = COMPLETED.
 * Never on booking confirmed, payment received, or booking cancelled.
 *
 * States:
 *   ACTIVE             → Created, 0 completed journeys
 *   PARTIALLY_UNLOCKED → 1–4 journeys completed
 *   FULLY_UNLOCKED     → All 5 journeys completed, full NPR 100 unlocked
 *   EXPIRED            → 60 days passed with 0 completed journeys
 *   VOIDED             → Fraud detected, all unlocked amounts reversed
 */

const referralV2Schema = new mongoose.Schema(
  {
    // User A — the one who shared the referral code
    referrerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // User B — the one who signed up using the code
    // UNIQUE: One referral per referred user, enforced at DB level
    referredUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // The referral code that was used (User A's code)
    referralCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    // Lifecycle status of this referral relationship
    status: {
      type: String,
      enum: [
        "ACTIVE",              // Created, no completed journeys yet
        "PARTIALLY_UNLOCKED",  // 1–4 journeys completed
        "FULLY_UNLOCKED",      // All 5 journeys completed
        "EXPIRED",             // 60 days passed with 0 bookings from referred user
        "VOIDED",              // Fraud — all unlocked amounts reversed
      ],
      default: "ACTIVE",
      required: true,
    },

    // Number of completed journeys by the referred user (0–5)
    // Only incremented when a trip transitions to status: "completed"
    // and the referred user had a valid, non-cancelled booking on that trip.
    journeysCompleted: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },

    // NPR sum unlocked so far (0–100)
    // Incremented as: 30 → 50 → 70 → 90 → 100
    totalUnlocked: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    // NPR remaining to unlock (100 → 70 → 50 → 30 → 10 → 0)
    // Always equals: 100 − totalUnlocked
    lockedRemaining: {
      type: Number,
      default: 100,
      min: 0,
      max: 100,
    },

    // Expiry date: 60 days from referred user's signup (createdAt)
    // After this date, if journeysCompleted is still 0, status → EXPIRED
    // If at least 1 journey completed, the referral stays active —
    // remaining locked amount expires after 12 months of inactivity (spec §3.6)
    expiresAt: {
      type: Date,
      required: true,
    },

    // ── FRAUD DETECTION (spec §3.7) ──────────────────────────────────────
    flaggedForReview: {
      type: Boolean,
      default: false,
    },
    flagReason: {
      type: String,
      default: null,
    },

    // ── AUDIT TRAIL ──────────────────────────────────────────────────────
    // Booking IDs that triggered each unlock (for dedup and audit)
    unlockHistory: [
      {
        bookingId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Booking",
          required: true,
        },
        journeyNumber: {
          type: Number,
          required: true,
          min: 1,
          max: 5,
        },
        amountUnlocked: {
          type: Number,
          required: true,
        },
        ledgerEntryId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "SMLedger",
          required: true,
        },
        unlockedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // The SM Ledger entry ID for the initial REFERRAL_LOCKED credit (NPR 100)
    lockedLedgerEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SMLedger",
      default: null,
    },

    // ── VOIDING (admin action) ───────────────────────────────────────────
    voidedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Admin who voided
      default: null,
    },
    voidedAt: {
      type: Date,
      default: null,
    },
    voidReason: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// ═══════════════════════════════════════════════════════════════════════
// INDEXES
// ═══════════════════════════════════════════════════════════════════════

// Enforces: one referral per referred user account (spec §3.7)
referralV2Schema.index({ referredUserId: 1 }, { unique: true });

// Dashboard query: all referrals for a given referrer, filtered by status
referralV2Schema.index({ referrerId: 1, status: 1 });

// Expiry cron: find ACTIVE referrals past their expiry date
referralV2Schema.index({ expiresAt: 1, status: 1 });

// Fraud detection: find recent referrals by referrer
referralV2Schema.index({ referrerId: 1, createdAt: -1 });

module.exports = mongoose.model("ReferralV2", referralV2Schema);
