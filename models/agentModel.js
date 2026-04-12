const mongoose = require("mongoose");

const agentSchema = new mongoose.Schema(
    {
        agentId: {
            type: String,
            unique: true,
            index: true,
        },

        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true,
        },

        /* =======================
           KYC & VERIFICATION
        ======================= */

        citizenshipCertificate: {
            documentUrls: [String],
            verified: { type: Boolean, default: false },
            verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Superadmin" },
            verifiedAt: Date,
            rejectionReason: { type: String, default: null },
        },

        agentAgreement: {
            documentUrls: [String],
            digitalSignature: String,
            verified: { type: Boolean, default: false },
            rejectionReason: { type: String, default: null },
        },

        bankAccount: {
            bankName: String,
            accountHolderName: String,
            accountNumber: String,
            verified: { type: Boolean, default: false },
            verificationReferenceId: String,
            documentUrls: [String],
            rejectionReason: { type: String, default: null },
        },

        addressProof: {
            documentType: {
                type: String,
                enum: ["citizenship", "utility_bill", "rental_agreement"],
            },
            documentUrls: [String],
            verified: { type: Boolean, default: false },
            rejectionReason: { type: String, default: null },
        },

        /* =======================
           APPROVAL & RISK
        ======================= */

        verificationStatus: {
            type: String,
            enum: ["pending", "approved", "rejected"],
            default: "pending",
        },

        rejectionReason: {
            type: String,
            default: null,
        },

        riskScore: {
            type: Number,
            default: 0,
        },

        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },

        approvedAt: Date,

        /* =======================
           BUSINESS DETAILS
        ======================= */

        agentCompanyName: {
            type: String,
        },

        operatingAreas: [
            {
                type: String, // city, district, route
            },
        ],

        commissionRate: {
            type: Number, // percentage
            default: 5,
        },

        /* =======================
           PERFORMANCE ANALYTICS
        ======================= */

        totalBookings: {
            type: Number,
            default: 0,
        },

        totalRevenue: {
            type: Number,
            default: 0,
        },

        totalCommissionEarned: {
            type: Number,
            default: 0,
        },

        /* =======================
           COMMISSION MANAGEMENT
        ======================= */

        walletBalance: {
            type: Number,
            default: 0,
        },

        deductions: {
            type: Number,
            default: 0,
        },

        /* =======================
           TRAINING
        ======================= */

        trainings: [
            {
                moduleName: String,
                completed: { type: Boolean, default: false },
                completedAt: Date,
                certificateUrl: String,
            },
        ],

        /* =======================
           ACCOUNT CONTROL
        ======================= */

        accountStatus: {
            type: String,
            enum: ["active", "inactive", "suspended"],
            default: "inactive",
        },
    },
    { timestamps: true }
);
// Auto-generate human-readable Agent ID: SUV-MARG-AGENT-001
agentSchema.pre("save", async function (next) {
    if (this.agentId) return next();

    const prefix = "SUV-MARG-AGENT";
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    const generateRandomPart = (length) => {
        let result = "";
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    };

    try {
        let uniqueIdFound = false;
        let candidate;

        while (!uniqueIdFound) {
            const randomCode = generateRandomPart(3);
            const randomNumber = String(Math.floor(Math.random() * 1000)).padStart(
                3,
                "0"
            );

            candidate = `${prefix}-${randomCode}-${randomNumber}`;

            const existing = await mongoose.model("Agent").findOne({ agentId: candidate });
            if (!existing) {
                uniqueIdFound = true;
            }
        }

        this.agentId = candidate;
        next();
    } catch (err) {
        next(err);
    }
});

module.exports = mongoose.model("Agent", agentSchema);
