const mongoose = require("mongoose");

/**
 * AGENT SETTLEMENT MODEL
 *
 * Tracks commission withdrawal requests from agents.
 *
 * Flow:
 *   1. Agent taps "Withdraw" in wallet screen
 *   2. AgentSettlement created with status PENDING
 *   3. Admin sees request in settlement queue
 *   4. Admin processes payment → PROCESSING → PAID
 *   5. Agent notified, commission balance reduced
 *
 * Failure handling:
 *   PAID = successfully sent (has transactionRef)
 *   FAILED = payment failed (wrong bank details, etc.)
 *     → Amount returned to agent commissionBalance
 *     → Agent notified to update settlement details
 *     → Admin can retry
 *
 * This is SEPARATE from the bus owner Settlement model because:
 *   - Agent settlements are agent-initiated withdrawals
 *   - Bus owner settlements are platform-to-operator payouts
 *   - Completely different financial flows and admin workflows
 *
 * Spec: shuvmarg-agent-model.md § 13.4
 */
const agentSettlementSchema = new mongoose.Schema(
    {
        agentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Agent",
            required: true,
            index: true,
        },

        requestedAt: {
            type: Date,
            default: Date.now,
        },

        // Amount being withdrawn
        amount: {
            type: Number,
            required: true,
            min: 0,
        },

        // === SETTLEMENT METHOD (snapshot at request time) ===
        // We snapshot the details because the agent may change their
        // bank account after requesting — the payout goes to the
        // account specified at request time.

        settlementMethod: {
            type: String,
            enum: ["BANK", "ESEWA", "KHALTI"],
            required: true,
        },

        // Bank details (when method = BANK)
        bankName: { type: String, default: null, trim: true },
        bankAccountNumber: { type: String, default: null, trim: true },
        bankAccountName: { type: String, default: null, trim: true },

        // Digital wallet number (when method = ESEWA or KHALTI)
        esewaNumber: { type: String, default: null, trim: true },
        khaltiNumber: { type: String, default: null, trim: true },

        // === LIFECYCLE ===

        status: {
            type: String,
            enum: [
                "PENDING",      // Agent requested, waiting for admin
                "PROCESSING",   // Admin has started processing
                "PAID",         // Successfully sent to agent
                "FAILED",       // Payment failed — amount returned to balance
            ],
            default: "PENDING",
        },

        // Populated when status = PAID
        paidAt: { type: Date, default: null },

        // Bank transfer ref, eSewa txn ID, or Khalti ref
        transactionRef: { type: String, default: null, trim: true },

        // Which admin processed this settlement
        processedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Superadmin",
            default: null,
        },

        // Admin notes (e.g., "Processed via NIC Asia batch #42")
        note: { type: String, default: null, trim: true },

        // Populated when status = FAILED
        failureReason: { type: String, default: null, trim: true },
    },
    { timestamps: true }
);

/* =======================
   INDEXES
======================= */

// Agent's settlement history
agentSettlementSchema.index({ agentId: 1, status: 1 });

// Admin settlement queue: pending/processing requests
agentSettlementSchema.index({ status: 1, requestedAt: -1 });

// Admin: recent settlements across all agents
agentSettlementSchema.index({ createdAt: -1 });

module.exports = mongoose.model("AgentSettlement", agentSettlementSchema);
