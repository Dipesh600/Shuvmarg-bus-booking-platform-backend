const mongoose = require("mongoose");

/**
 * AGENT WALLET TRANSACTION MODEL
 *
 * Commission ledger for agents. Every financial event in an agent's commission
 * wallet creates a transaction here. The Agent.commissionBalance is updated
 * atomically with each transaction — this collection is the audit trail.
 *
 * Separate from the passenger WalletTransaction because:
 *   - Different transaction types (COMMISSION_CREDIT vs cashback/refund)
 *   - Different settlement flow (agent withdrawal vs passenger spending)
 *   - Balance can go negative on commission reversal (passengers can't)
 *   - Different reporting requirements (agent earnings vs passenger rewards)
 *
 * Spec: shuvmarg-agent-model.md § 13.3
 */
const agentWalletTransactionSchema = new mongoose.Schema(
    {
        agentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Agent",
            required: true,
            index: true,
        },

        // What happened
        type: {
            type: String,
            enum: [
                "COMMISSION_CREDIT",    // Online booking confirmed → commission earned
                "COMMISSION_REVERSAL",  // Online booking cancelled or no-show → commission reversed
                "SETTLEMENT_DEBIT",     // Agent withdrew commission → balance reduced
                "ADMIN_ADJUSTMENT",     // Manual admin credit/debit (corrections, bonuses)
            ],
            required: true,
        },

        // Which direction the money moved
        direction: {
            type: String,
            enum: ["CREDIT", "DEBIT"],
            required: true,
        },

        // Always positive — direction field indicates credit vs debit
        amount: {
            type: Number,
            required: true,
            min: 0.01,
        },

        // Agent's commission balance AFTER this transaction was applied
        // Critical for audit — enables full ledger reconstruction
        balanceAfter: {
            type: Number,
            required: true,
        },

        // === REFERENCES ===
        // At most one of these is populated per transaction

        // For COMMISSION_CREDIT and COMMISSION_REVERSAL
        relatedBookingId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AgentBooking",
            default: null,
        },

        // For SETTLEMENT_DEBIT
        relatedSettlementId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AgentSettlement",
            default: null,
        },

        // Human-readable note (e.g., "Booking SHV-TK-4231 cancelled by passenger")
        note: {
            type: String,
            default: null,
            trim: true,
        },
    },
    { timestamps: true }
);

/* =======================
   INDEXES
======================= */

// Agent's transaction history (wallet screen, sorted by date)
agentWalletTransactionSchema.index({ agentId: 1, createdAt: -1 });

// Filter by transaction type (earned/reversed/settled tabs)
agentWalletTransactionSchema.index({ agentId: 1, type: 1 });

// Admin: find all transactions for a specific booking
agentWalletTransactionSchema.index({ relatedBookingId: 1 });

module.exports = mongoose.model("AgentWalletTransaction", agentWalletTransactionSchema);
