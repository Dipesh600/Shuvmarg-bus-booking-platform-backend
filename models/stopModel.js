const mongoose = require("mongoose");

/**
 * LAYER 3: Stop Registry
 *
 * The most critical asset of the platform.
 * Every city/junction/town is a reusable node in the route graph.
 * Stops are NEVER duplicated — if Kathmandu exists, all routes reference the same record.
 */
const stopSchema = new mongoose.Schema(
    {
        code: {
            type: String,
            required: true,
            unique: true,
            uppercase: true,
            trim: true,
            // e.g., "KTM", "PKR", "HTD", "BRD"
        },
        name: {
            type: String,
            required: true,
            trim: true,
            // e.g., "Kathmandu", "Pokhara", "Hetauda"
        },
        type: {
            type: String,
            enum: ["CITY", "JUNCTION", "TOWN", "BORDER"],
            default: "CITY",
        },
        state: {
            type: String,
            trim: true,
            // e.g., "Bagmati", "Gandaki"
        },
        aliases: [{
            type: String,
            trim: true
        }],
        // Optional: coordinates for future map integration
        coordinates: {
            lat: { type: Number, default: null },
            lng: { type: Number, default: null },
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

        // ── Popularity Tracking ───────────────────────────────────────────────
        // Incremented only when a user explicitly SELECTS this stop in the UI.
        // Not on search, not on hover — only on confirmed selection.
        selectionCount: {
            type: Number,
            default: 0,
            index: true,
        },
        // Tracks selections in the last 30 days (reset periodically via a cron job).
        // Weighted more heavily in popularityScore so trending stops surface quickly.
        recentSelectionCount: {
            type: Number,
            default: 0,
        },
        // Computed score: (recentSelections × 2) + (lifetimeSelections × 0.2)
        // Prevents old majors drowning out newly growing destinations.
        popularityScore: {
            type: Number,
            default: 0,
            index: true,
        },
    },
    { timestamps: true }
);

// Index for fast name-based search (used in UI autocomplete)
stopSchema.index({ name: "text", code: 1 });
stopSchema.index({ status: 1 });
// Compound index for the popular stops query — status filter + score sort in one pass
stopSchema.index({ status: 1, popularityScore: -1 });

module.exports = mongoose.model("Stop", stopSchema);

