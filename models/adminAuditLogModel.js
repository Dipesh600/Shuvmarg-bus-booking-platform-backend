/**
 * models/adminAuditLogModel.js
 *
 * Immutable audit trail for every destructive admin action.
 *
 * Purpose:
 *   - Track who did what to whom, when, and why
 *   - Provide evidence for user disputes and compliance
 *   - Enable admin accountability and oversight
 *
 * Records are append-only — no update or delete operations should
 * ever be exposed on this collection. Admins can only read.
 */

const mongoose = require("mongoose");

const adminAuditLogSchema = new mongoose.Schema(
  {
    // Which admin performed the action
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SuperAdmin",
      required: true,
      index: true,
    },

    // What action was taken
    action: {
      type: String,
      enum: [
        "SUSPEND",
        "BAN",
        "REACTIVATE",
        "SOFT_DELETE",
        "FORCE_PASSWORD_RESET",
        "REVOKE_SESSIONS",
        "WALLET_ADJUST",
        "WALLET_FREEZE",
        "STATUS_CHANGE",
      ],
      required: true,
      index: true,
    },

    // What type of entity was targeted
    targetType: {
      type: String,
      enum: ["user", "busOwner", "agent"],
      required: true,
    },

    // The ID of the entity that was acted upon
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    // Admin-provided justification (required for destructive actions)
    reason: {
      type: String,
      default: null,
      maxlength: 500,
    },

    // Flexible metadata for action-specific context
    // e.g. { previousStatus: "active", newStatus: "banned", duration: "7d" }
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true, // createdAt = when the action happened
  }
);

// Query pattern: "show me all actions taken against this user"
adminAuditLogSchema.index({ targetId: 1, createdAt: -1 });

// Query pattern: "show me all actions taken by this admin"
adminAuditLogSchema.index({ adminId: 1, createdAt: -1 });

// Query pattern: "show me all bans in the last 7 days"
adminAuditLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model("AdminAuditLog", adminAuditLogSchema);
