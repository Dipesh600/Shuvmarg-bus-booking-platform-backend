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
        // Estimated minutes from the ORIGIN stop of this variant
        // Used for ETA display and timing calculations
        estimatedMinutesFromOrigin: {
            type: Number,
            default: 0,
        },
    },
    { timestamps: true }
);

// Ensure a stop doesn't appear twice in the same variant
routeStopSchema.index({ variantId: 1, stopId: 1 }, { unique: true });
// For fast ordered retrieval of stops for a variant
routeStopSchema.index({ variantId: 1, sequence: 1 });

module.exports = mongoose.model("RouteStop", routeStopSchema);
