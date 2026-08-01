const mongoose = require("mongoose");

/**
 * StopPoint — Physical boarding/dropping micro-location under a Stop.
 *
 * Relationship: many StopPoints belong to one Stop.
 * Example: Stop = "Kathmandu", StopPoints = ["Gongabu Bus Park", "Kalanki"]
 *
 * Transitional discovery model retained for legacy records only.
 * New physical locations belong in BoardingLocation. New route stops use the
 * stop-fallback policy instead of receiving an automatic duplicate StopPoint.
 *
 * No contactNumber here — that belongs to a future operator-counter model
 * that layers on top of the registry, not the registry itself.
 */
const stopPointSchema = new mongoose.Schema(
    {
        stopId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Stop",
            required: true,
            // Named stopId (not routeStopId) — a StopPoint belongs to a Stop node,
            // not to a specific route. An operator can reference this from any route
            // that passes through the parent Stop.
        },
        name: {
            type: String,
            required: true,
            trim: true,
            // e.g., "Gongabu New Bus Park", "Kalanki Chowk", "Naya Bus Park Gate 3"
        },
        nameNe: {
            type: String,
            trim: true,
            // Nepali name — used for Nepali-language UI rendering
        },
        type: {
            type: String,
            enum: ["BUS_PARK", "COUNTER", "LANDMARK", "JUNCTION_POINT", "CUSTOM"],
            default: "CUSTOM",
        },
        coordinates: {
            lat: { type: Number, default: null },
            lng: { type: Number, default: null },
        },
        supportsBoarding: {
            type: Boolean,
            default: true,
            // false = drop-off only (e.g. a destination-only counter)
        },
        supportsDropping: {
            type: Boolean,
            default: true,
            // false = pick-up only
        },
        verificationStatus: {
            type: String,
            enum: ["PENDING", "VERIFIED", "REJECTED"],
            default: "VERIFIED",
        },
        source: {
            type: String,
            enum: ["MANUAL", "DISCOVERY", "OPERATOR_REQUEST"],
            default: "MANUAL",
        },
        status: {
            type: String,
            enum: ["ACTIVE", "INACTIVE"],
            default: "ACTIVE",
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
        },
    },
    { timestamps: true }
);

// ── Indexes ────────────────────────────────────────────────────────────────────
// Core lookup: "give me all active stop points for stop X"
stopPointSchema.index({ stopId: 1, status: 1 });
// Admin review queue: unverified points submitted via operator requests
stopPointSchema.index({ source: 1, verificationStatus: 1 });

module.exports = mongoose.model("StopPoint", stopPointSchema);
