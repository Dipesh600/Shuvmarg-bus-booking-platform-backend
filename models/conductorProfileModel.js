const mongoose = require("mongoose");
const { crewAccessFields } = require("../src/shared/crew/crew-access-state");

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
        ...crewAccessFields(),

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

        removedAt: { type: Date, default: null },
        removedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

        // ─── AUDIT ─────────────────────────────────────────────────────────────
        assignedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        createdBy: {
            type: String,
            enum: ["ADMIN", "OPERATOR"],
            default: "OPERATOR",
        },
        adminCreatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SuperAdmin",
            default: null,
        },
        notes: {
            type: String,
            default: null,
            trim: true,
        },

        // ─── TRIP ASSIGNMENT ───────────────────────────────────────────────────
        // Trips this conductor is assigned to operate.
        // Populated by bus owner in operator panel.
        // Used by conductor mode in the agent app to show "My trips today".
        assignedTripIds: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "Trip",
        }],
        statusHistory: [{
            from: { type: String, enum: ["AVAILABLE", "ON_DUTY", "OFF_DUTY", "SUSPENDED", "INACTIVE"] },
            to: { type: String, enum: ["AVAILABLE", "ON_DUTY", "OFF_DUTY", "SUSPENDED", "INACTIVE"] },
            actorId: { type: mongoose.Schema.Types.ObjectId, ref: "SuperAdmin" },
            at: { type: Date, default: Date.now },
            reason: { type: String, default: null },
        }],
        suspendedBy: { type: mongoose.Schema.Types.ObjectId, ref: "SuperAdmin", default: null },
        suspendedAt: { type: Date, default: null },
        suspensionReason: { type: String, default: null, trim: true },
    },
    { timestamps: true, optimisticConcurrency: true }
);

// Brand dashboard: all conductors for a brand
conductorProfileSchema.index({ brandId: 1, status: 1 });
// Owner view: all conductors across all brands
conductorProfileSchema.index({ ownerId: 1, status: 1 });
conductorProfileSchema.index({ ownerId: 1, accessStatus: 1 });

module.exports = mongoose.model("ConductorProfile", conductorProfileSchema);
