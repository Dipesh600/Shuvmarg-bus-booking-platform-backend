const mongoose = require("mongoose");

/**
 * CONDUCTOR PROFILE MODEL
 *
 * Conductors are assigned by bus owners. They don't self-register.
 *
 * Flow:
 *   1. Bus owner calls assignConductor → creates User (role:conductor, status:invited)
 *      + ConductorProfile linked to the owner's brand
 *   2. Conductor receives SMS with activation link
 *   3. Conductor activates account → sets password → status: active
 *   4. Conductor can now login and confirm passenger boarding
 *
 * Chain: OperatorBrand → ConductorProfile → Trip (per assignment)
 */
const conductorProfileSchema = new mongoose.Schema(
    {
        // ─── CHAIN LINKS ──────────────────────────────────────────────────────
        brandId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "OperatorBrand",
            required: true,
            index: true,
        },
        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        // Link to the User account (always created on assignment)
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true,
        },

        // ─── IDENTITY ─────────────────────────────────────────────────────────
        fullName: {
            type: String,
            required: true,
            trim: true,
        },
        phone: {
            type: String,
            required: true,
            trim: true,
        },

        // ─── OPERATIONAL STATUS ────────────────────────────────────────────────
        status: {
            type: String,
            enum: ["AVAILABLE", "ON_DUTY", "OFF_DUTY", "SUSPENDED", "INACTIVE"],
            default: "AVAILABLE",
            index: true,
        },

        // ─── AUDIT ─────────────────────────────────────────────────────────────
        assignedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        notes: {
            type: String,
            default: null,
            trim: true,
        },
    },
    { timestamps: true }
);

// Brand dashboard: all conductors for a brand
conductorProfileSchema.index({ brandId: 1, status: 1 });
// Owner view: all conductors across all brands
conductorProfileSchema.index({ ownerId: 1, status: 1 });

module.exports = mongoose.model("ConductorProfile", conductorProfileSchema);
