const mongoose = require("mongoose");

/**
 * Platform Config — Admin-configurable operational parameters
 *
 * Design:
 *   - Key-value store with versioned audit trail
 *   - Each config key is unique and stores a flexible `value` object
 *   - Changes are tracked: who changed it, when, with an optional note
 *   - No deployment needed to adjust gateway fees, cashback parameters, etc.
 *
 * Predefined config keys:
 *   - "gateway_fees"    → fee percentages per payment gateway
 *   - "cashback_config" → skew level, min/max NPR, percentage guard
 *   - "sm_money_config" → credit expiry months, scratch card expiry days, max discount %
 *   - "referral_config" → expiry days, unlock amounts array, total amount
 */

const platformConfigSchema = new mongoose.Schema(
  {
    // Unique config key — e.g. "gateway_fees", "cashback_config"
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    // Flexible value object — structure depends on the key
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    // Human-readable description of this config
    description: {
      type: String,
      default: null,
    },

    // Audit trail — who last modified this config
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SuperAdmin",
      default: null,
    },

    // Optional note explaining why the change was made
    note: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// ═══════════════════════════════════════════════════════════════════════
// DEFAULT CONFIG VALUES — used as fallback when no DB entry exists
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get a config value by key, falling back to a hardcoded default
 * if the key doesn't exist in the database yet.
 *
 * This ensures the system works out of the box without manual seeding,
 * while allowing admin overrides via the admin panel.
 */
const DEFAULTS = {
  gateway_fees: {
    esewa: { feePercent: 1.8, label: "eSewa" },
    khalti: { feePercent: 1.5, label: "Khalti" },
    ime_pay: { feePercent: 1.5, label: "IME Pay" },
    connect_ips: { feePercent: 0, label: "ConnectIPS" },
  },
  cashback_config: {
    skewLevel: 3,            // 1 = conservative, 5 = generous
    minNPR: 5,               // Floor
    maxNPR: 30,              // Cap
    maxPercentOfTicket: 15,  // Guard: never more than 15% of base ticket
    lowTicketThreshold: 100, // Below this, use 10% cap instead of 15%
    lowTicketMaxPercent: 10, // Cap for tickets below threshold
  },
  sm_money_config: {
    creditExpiryMonths: 12,      // Credits expire after 12 months
    scratchCardExpiryDays: 90,   // Scratch cards expire after 90 days
    maxDiscountPercent: 80,      // Combined offer + SM Money cap
  },
  referral_config: {
    expiryDays: 60,              // Referral expires if 0 journeys in 60 days
    unlockAmounts: [30, 20, 20, 20, 10], // Progressive unlock per journey
    totalAmount: 100,            // Total NPR available per referral
    codeApplyWindowHours: 24,    // Code must be applied within 24h of signup
    partialExpiryMonths: 12,     // Partially unlocked referrals expire after 12 months of inactivity
  },
};

platformConfigSchema.statics.getConfig = async function (key) {
  const doc = await this.findOne({ key }).lean();
  if (doc) return doc.value;

  // Return hardcoded default if not in DB
  if (DEFAULTS[key]) return DEFAULTS[key];

  return null;
};

/**
 * Set a config value. Creates the doc if it doesn't exist (upsert).
 * Always records who made the change and an optional reason.
 */
platformConfigSchema.statics.setConfig = async function (
  key,
  value,
  { updatedBy = null, note = null } = {}
) {
  return this.findOneAndUpdate(
    { key },
    {
      $set: {
        value,
        updatedBy,
        note,
      },
    },
    { upsert: true, new: true, runValidators: true }
  );
};

module.exports = mongoose.model("PlatformConfig", platformConfigSchema);
module.exports.DEFAULTS = DEFAULTS;
