const mongoose = require("mongoose");

/**
 * LAYER 4: Route Stop Mapping
 *
 * Defines the ORDERED sequence of stops for a specific variant.
 * This is the "timetable backbone" — each stop knows:
 *   - Which variant it belongs to
 *   - Its position in the sequence
 *   - Estimated time from origin (for ETA display)
 *   - Whether it's a major stop (for UI display priority)
 *
 * Example for "KTM-BRD via BP Highway":
 *   seq 1: Kathmandu    (isMajor: true,  estimatedMins: 0)
 *   seq 2: Banepa       (isMajor: false, estimatedMins: 60)
 *   seq 3: Sindhuli     (isMajor: true,  estimatedMins: 150)
 *   seq 4: Bardibas     (isMajor: true,  estimatedMins: 360)
 *
 * This is SEPARATE from operator config — operators then SELECT a subset of these stops.
 */
const routeStopSchema = new mongoose.Schema(
    {
        variantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "RouteVariant",
            required: true,
        },
        stopId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Stop",
            required: true,
        },
        sequence: {
            type: Number,
            required: true,
            min: 1,
            // 1 = Origin, last number = Destination
        },
        isMajor: {
            type: Boolean,
            default: true,
            // Major = shown prominently in search/booking
            // Minor = junction, only shown for operators who explicitly stop there
        },
        // Distance in km from the ORIGIN stop of this variant.
        // Populated by the discovery publish action; can also be set manually.
        // Used for fare calculation on sub-routes (pick-up at stop B, drop-off at stop D).
        distanceFromOriginKm: {
            type: Number,
            default: null,
        },
        // Duration in minutes from the ORIGIN stop of this variant.
        // Canonical field name aligns with RouteDiscovery.publishedVariant schema.
        durationFromOriginMins: {
            type: Number,
            default: 0,
        },
        // Legacy alias — kept so existing controller reads don't break.
        // New code should write/read durationFromOriginMins instead.
        estimatedMinutesFromOrigin: {
            type: Number,
            default: 0,
        },
    },
    { timestamps: true }
);

// Ensure a stop doesn't appear twice in the same variant
routeStopSchema.index({ variantId: 1, stopId: 1 }, { unique: true });
// A sequence position is also unique within one variant. Application-level
// validation keeps the sequence contiguous; this index prevents concurrent
// writers from persisting two stops at the same position.
routeStopSchema.index({ variantId: 1, sequence: 1 }, { unique: true });

module.exports = mongoose.model("RouteStop", routeStopSchema);
