const mongoose = require("mongoose");

/**
 * DRIVER PROFILE MODEL
 *
 * Drivers are first-class entities in the Shuvmarg platform.
 * A DriverProfile belongs to an OperatorBrand and is approved by an admin.
 *
 * Separation from User model:
 *   - A driver may or may not have a passenger app account (userId is optional)
 *   - Driver-specific compliance (license, medical) lives here, not on User
 *   - Brand-scoped: driver can only be assigned to trips under their brand
 *
 * Chain: OperatorBrand → DriverProfile → Schedule (default) → Trip (instance)
 */
const driverProfileSchema = new mongoose.Schema(
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
        // Optional: link to a User account (for driver app login)
        // null = driver has no platform app account
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
            sparse: true,
        },

        // ─── IDENTITY ────────────────────────────────────────────────────────
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
        email: {
            type: String,
            default: null,
            trim: true,
            lowercase: true,
        },
        photo: {
            type: String,   // URL
            default: null,
        },
        address: {
            type: String,
            default: null,
            trim: true,
        },
        gender: {
            type: String,
            enum: ["male", "female", "other"],
            default: null,
        },

        // ─── DRIVING LICENSE ─────────────────────────────────────────────────
        licenseNumber: {
            type: String,
            required: true,
            trim: true,
            uppercase: true,
        },
        licenseType: {
            type: String,
            // HV  = Heavy Vehicle — required for full-size buses (standard in Nepal)
            // LV  = Light Vehicle — hiace, minibus only
            // TRK = Truck/articulated (future)
            enum: ["HV", "LV", "TRK"],
            required: true,
        },
        licenseExpiry: {
            type: Date,
            required: true,
        },
        licenseDoc: {
            type: String,   // URL to scanned license
            default: null,
        },

        // ─── MEDICAL FITNESS CERTIFICATE ─────────────────────────────────────
        // Required by DoTM (Department of Transport Management) Nepal
        medicalCertExpiry: {
            type: Date,
            default: null,
        },
        medicalCertDoc: {
            type: String,   // URL
            default: null,
        },

        // ─── EXPERIENCE ──────────────────────────────────────────────────────
        experienceYears: {
            type: Number,
            default: 0,
            min: 0,
        },
        previousEmployer: {
            type: String,
            default: null,
            trim: true,
        },

        // ─── ASSIGNMENT ──────────────────────────────────────────────────────
        // The bus this driver is primarily assigned to (their regular vehicle)
        // Optional — a driver can be unassigned and still be used on schedules
        assignedBusId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Buse",
            default: null,
        },

        // ─── OPERATIONAL STATUS ───────────────────────────────────────────────
        status: {
            type: String,
            enum: ["AVAILABLE", "ON_DUTY", "OFF_DUTY", "SUSPENDED", "INACTIVE"],
            default: "AVAILABLE",
            index: true,
        },

        // ─── COMPLIANCE DOCUMENTS (structured) ───────────────────────────────
        // Mirrors the fleetDocuments structure for consistent admin review
        documents: {
            license: {
                url:       { type: String, default: null },
                validTill: { type: Date,   default: null },
            },
            medical: {
                url:       { type: String, default: null },
                validTill: { type: Date,   default: null },
            },
            // Police clearance certificate — required for some intercity routes
            policeReport: {
                url:       { type: String, default: null },
                validTill: { type: Date,   default: null },
            },
        },

        // ─── APPROVAL WORKFLOW ────────────────────────────────────────────────
        approvalStatus: {
            type: String,
            enum: ["PENDING", "APPROVED", "REJECTED"],
            default: "PENDING",
            index: true,
        },
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SuperAdmin",
            default: null,
        },
        approvedAt: {
            type: Date,
            default: null,
        },
        rejectedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SuperAdmin",
            default: null,
        },
        rejectedAt: {
            type: Date,
            default: null,
        },
        rejectionReason: {
            type: String,
            default: null,
        },

        // ─── AUDIT ────────────────────────────────────────────────────────────
        createdBy: {
            type: String,
            enum: ["ADMIN", "OPERATOR"],
            default: "ADMIN",
        },
        notes: {
            type: String,
            default: null,
            trim: true,
        },
    },
    { timestamps: true }
);

// ─── INDEXES ──────────────────────────────────────────────────────────────────
// Brand dashboard: all drivers for a brand
driverProfileSchema.index({ brandId: 1, approvalStatus: 1 });
// Owner view: all drivers across all brands
driverProfileSchema.index({ ownerId: 1, status: 1 });
// Schedule dropdown: approved + available drivers for a brand
driverProfileSchema.index({ brandId: 1, approvalStatus: 1, status: 1 });
// Compliance expiry monitoring (platform-wide)
driverProfileSchema.index({ licenseExpiry: 1 });
driverProfileSchema.index({ medicalCertExpiry: 1 });

module.exports = mongoose.model("DriverProfile", driverProfileSchema);
