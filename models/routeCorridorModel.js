const mongoose = require("mongoose");
const {
    buildCorridorPairKey,
} = require("../src/domain/corridor/corridor-identity.js");

/**
 * LAYER 1: Route Corridor (Platform Controlled)
 *
 * A corridor is the direction-neutral official connection between two
 * searchable registry stops. It owns identity, not the physical path.
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
        _endpointPairKey: {
            type: String,
            required: true,
            select: false,
        },
        // Deprecated compatibility field. Corridors are always direction-neutral;
        // variants define FORWARD and RETURN availability.
        isSymmetric: {
            type: Boolean,
            default: true,
        },
        status: {
            type: String,
            enum: ["ACTIVE", "INACTIVE", "PENDING"],
            default: "PENDING",
        },
        source: {
            type: String,
            enum: ["ADMIN", "ROUTE_REQUEST", "DISCOVERY"],
            default: "ADMIN",
        },
        sourceReferenceId: { type: String, trim: true, default: null },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
        },
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
            default: null,
        },
        notes: {
            type: String,
            trim: true,
        },
    },
    { timestamps: true }
);

routeCorridorSchema.pre("validate", function (next) {
    try {
        this._endpointPairKey = buildCorridorPairKey(
            this.originId, this.destinationId
        );
        this.isSymmetric = true;
        next();
    } catch (error) {
        next(error);
    }
});

// Pair identity is direction-neutral: A↔B and B↔A are the same corridor.
routeCorridorSchema.index(
    { _endpointPairKey: 1 },
    {
        unique: true,
        partialFilterExpression: { _endpointPairKey: { $type: "string" } },
    }
);
routeCorridorSchema.index({ originId: 1, destinationId: 1 });
routeCorridorSchema.index({ status: 1 });

module.exports = mongoose.model("RouteCorridor", routeCorridorSchema);
