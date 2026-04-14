const mongoose = require("mongoose");

const fareRuleSchema = new mongoose.Schema(
    {
        // Can be linked to a specific fleet, route, or both
        fleetId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Buse",
            default: null,
            index: true,
        },
        routeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "BusRoute",
            default: null,
            index: true,
        },
        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        // Base fare (overrides route basePrice if set)
        baseFare: {
            type: Number,
            required: true,
            min: [0, "Base fare cannot be negative"],
        },

        // Seat class premiums (additional charge on top of base fare)
        seatClassPremium: {
            window: { type: Number, default: 0, min: 0 },
            aisle: { type: Number, default: 0, min: 0 },
            sleeper: { type: Number, default: 0, min: 0 },
        },

        // Advance booking discount
        advanceDiscount: {
            enabled: { type: Boolean, default: false },
            daysBeforeTravel: { type: Number, default: 7, min: 1 },
            discountPercent: { type: Number, default: 0, min: 0, max: 100 },
        },

        // Peak/surge pricing
        peakPricing: {
            enabled: { type: Boolean, default: false },
            peakDates: [{ type: String }],   // ["2026-10-15", "2026-12-25"]
            surchargePercent: { type: Number, default: 0, min: 0, max: 200 },
        },

        isActive: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

// Ensure unique constraint per fleet+route combo
fareRuleSchema.index({ fleetId: 1, routeId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("FareRule", fareRuleSchema);
