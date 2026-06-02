const mongoose = require("mongoose");

/**
 * LAYER 2: Route Variant (Approved Path)
 *
 * Each corridor can have MULTIPLE variants — different physical paths
 * between the same two cities.
 *
 * Example:
 *   Corridor: Kathmandu → Bardibas
 *   Variant 1: Via BP Highway     (KTM-BRD-BP01)
 *   Variant 2: Via Hetauda         (KTM-BRD-HT01)
 *
 * Each variant also has a DIRECTION (FORWARD or RETURN).
 * When a FORWARD variant is created, the system can auto-generate a RETURN variant.
 * Both variants reference each other via `returnVariantId`.
 */
const routeVariantSchema = new mongoose.Schema(
    {
        code: {
            type: String,
            required: true,
            unique: true,
            uppercase: true,
            trim: true,
            // e.g., "KTM-BRD-BP01", "KTM-BRD-HT01"
        },
        corridorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "RouteCorridor",
            required: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
            // e.g., "Via BP Highway", "Via Hetauda - Mahendra Highway"
        },
        type: {
            type: String,
            enum: ["HIGHWAY", "MOUNTAIN", "EXPRESSWAY", "LOCAL", "STANDARD"],
            default: "STANDARD",
        },
        direction: {
            type: String,
            enum: ["FORWARD", "RETURN"],
            required: true,
            default: "FORWARD",
        },
        // Links the RETURN variant back to its FORWARD counterpart and vice versa
        returnVariantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "RouteVariant",
            default: null,
        },
        distanceKm: {
            type: Number,
            default: null,
        },
        durationMinutes: {
            type: Number,
            default: null,
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

routeVariantSchema.index({ corridorId: 1, status: 1 });
routeVariantSchema.index({ direction: 1 });

module.exports = mongoose.model("RouteVariant", routeVariantSchema);
