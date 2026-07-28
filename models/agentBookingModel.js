const mongoose = require("mongoose");

/**
 * AGENT BOOKING MODEL
 *
 * Bridge between Agent and the core Booking. Every booking made by an agent
 * creates both a Booking record (for the seat map, manifest, and passenger)
 * and an AgentBooking record (for the agent's commission, payment mode, and
 * dashboard).
 *
 * Key design decisions:
 *   - passengerName/Phone are duplicated here for agent-side queries without
 *     joining to Booking → User
 *   - paymentMode (CASH/ONLINE) is agent-specific — the core Booking uses
 *     paymentMethod (ESEWA/KHALTI/CASH) for reconciliation
 *   - commissionRate is a snapshot at booking time — if the admin changes the
 *     agent's rate later, existing bookings keep the original rate
 *   - conductorStatus tracks boarding from the agent's perspective
 *
 * Spec: shuvmarg-agent-model.md § 13.2
 */
const agentBookingSchema = new mongoose.Schema(
    {
        agentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Agent",
            required: true,
            index: true,
        },

        bookingId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Booking",
            required: true,
            index: true,
        },

        // === PASSENGER (entered by agent) ===
        passengerName: {
            type: String,
            required: true,
            trim: true,
        },
        passengerPhone: {
            type: String,
            required: true,
            trim: true,
        },

        // === PAYMENT ===
        // Agent's choice: CASH (operator-linked only) or ONLINE (both types)
        paymentMode: {
            type: String,
            enum: ["ONLINE", "CASH"],
            required: true,
        },

        // Ticket price at time of booking
        // 0 for cash bookings (not processed by Shuvmarg)
        ticketPrice: {
            type: Number,
            default: 0,
            min: 0,
        },

        // === COMMISSION (online bookings only) ===
        // All null for cash bookings — Shuvmarg is not involved in cash commission

        // Snapshot of agent's commissionRate at booking time
        commissionRate: {
            type: Number,
            default: null,
        },

        // Calculated: ticketPrice × commissionRate / 100
        commissionAmount: {
            type: Number,
            default: null,
        },

        // Commission lifecycle for this booking
        commissionStatus: {
            type: String,
            enum: [
                "PENDING",      // Booking confirmed, commission calculation in progress
                "AVAILABLE",    // Commission credited to agent wallet
                "SETTLED",      // Commission withdrawn by agent
                "REVERSED",     // Booking cancelled or no-show — commission reversed
            ],
            default: null,
        },

        // Which settlement batch included this commission
        settlementId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AgentSettlement",
            default: null,
        },

        // === BOARDING DETAILS ===
        boardingPoint: { type: String, default: null, trim: true },
        droppingPoint: { type: String, default: null, trim: true },

        // Set by conductor when passenger boards or no-shows
        conductorStatus: {
            type: String,
            enum: ["PENDING", "BOARDED", "NO_SHOW"],
            default: "PENDING",
        },
    },
    { timestamps: true }
);

/* =======================
   INDEXES
======================= */

// Agent's booking history (dashboard, my bookings list)
agentBookingSchema.index({ agentId: 1, createdAt: -1 });

// Filter agent bookings by payment mode (cash vs online reports)
agentBookingSchema.index({ agentId: 1, paymentMode: 1 });

// Admin: find all bookings with pending/available commission
agentBookingSchema.index({ commissionStatus: 1 });

// Settlement processing: find all AVAILABLE commissions for an agent
agentBookingSchema.index({ agentId: 1, commissionStatus: 1 });

module.exports = mongoose.model("AgentBooking", agentBookingSchema);
