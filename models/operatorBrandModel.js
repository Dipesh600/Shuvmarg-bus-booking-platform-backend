const mongoose = require("mongoose");

const operatorBrandSchema = new mongoose.Schema(
    {
        // Human-readable ID: OB-KTM-001
        brandCode: {
            type: String,
            unique: true,
            index: true,
        },

        // Owner who registered / owns this brand
        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        brandName: {
            type: String,
            required: true,
            trim: true,
        },

        // Optional logo image URL
        logo: {
            type: String,
            default: null,
        },

        contactEmail: {
            type: String,
            trim: true,
            lowercase: true,
            default: null,
        },

        contactPhone: {
            type: String,
            default: null,
        },

        // Address / base of operations
        baseCity: {
            type: String,
            default: null,
        },

        // Platform commission rate for this brand (e.g. 8 = 8%)
        commissionRate: {
            type: Number,
            default: 8,
            min: 0,
            max: 100,
        },

        // Bank details for settlement payouts to this brand
        bankDetails: {
            accountHolderName: { type: String, default: null },
            bankName: { type: String, default: null },
            accountNumber: { type: String, default: null },
            ifscOrSwift: { type: String, default: null },
        },

        // Lifecycle status
        status: {
            type: String,
            enum: ["PENDING", "ACTIVE", "SUSPENDED"],
            default: "PENDING",
            index: true,
        },

        kycStatus: {
            type: String,
            enum: ["NOT_SUBMITTED", "PENDING", "APPROVED", "REJECTED"],
            default: "NOT_SUBMITTED",
        },

        // Admin who approved / suspended
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SuperAdmin",
            default: null,
        },
        approvedAt: { type: Date, default: null },

        suspendedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SuperAdmin",
            default: null,
        },
        suspendedReason: { type: String, default: null },

        // Notes from admin
        notes: { type: String, default: null },
    },
    { timestamps: true }
);

// Auto-generate brandCode: OB-XXXNNN
operatorBrandSchema.pre("save", async function (next) {
    if (this.brandCode) return next();

    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const nums = "0123456789";
    const rand = (set, n) => Array.from({ length: n }, () => set[Math.floor(Math.random() * set.length)]).join("");

    let uniqueFound = false;
    let candidate;
    while (!uniqueFound) {
        candidate = `OB-${rand(chars, 3)}${rand(nums, 3)}`;
        const existing = await mongoose.model("OperatorBrand").findOne({ brandCode: candidate });
        if (!existing) uniqueFound = true;
    }

    this.brandCode = candidate;
    next();
});

module.exports = mongoose.model("OperatorBrand", operatorBrandSchema);
