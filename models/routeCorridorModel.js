const mongoose = require("mongoose");

/**
 * LAYER 1: Route Corridor (Platform Controlled)
 *
 * A corridor is the highest-level concept — just the declared path
 * between two cities. NO stops. NO variants. Just identity.
 *
 * Example: Kathmandu ↔ Bardibas
 *
 * Variants of THIS corridor define the actual paths (via BP Highway, via Hetauda, etc.)
 */
const routeCorridorSchema = new mongoose.Schema(
    {
        code: {
            type: String,
            required: true,
            unique: true,
            uppercase: true,
            trim: true,
            // Auto-generated: "KTM-BRD", "KTM-PKR"
            // Convention: ORIGIN_CODE-DESTINATION_CODE
        },
        originId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Stop",
            required: true,
        },
        destinationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Stop",
            required: true,
        },
        // If true, this corridor implies the return trip automatically
        // Platform doesn't need to create a separate KTM→BRD and BRD→KTM corridor
        // Instead, VARIANTS define direction (FORWARD vs RETURN)
        isSymmetric: {
            type: Boolean,
            default: true,
        },
        status: {
            type: String,
            enum: ["ACTIVE", "INACTIVE", "PENDING"],
            default: "ACTIVE",
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
        },
        notes: {
            type: String,
            trim: true,
        },
    },
    { timestamps: true }
);

// Composite index: prevent duplicate corridors between same two cities
routeCorridorSchema.index({ originId: 1, destinationId: 1 }, { unique: true });
routeCorridorSchema.index({ status: 1 });

module.exports = mongoose.model("RouteCorridor", routeCorridorSchema);
