const mongoose = require("mongoose");

/**
 * AGENT MODEL
 *
 * Represents a Shuvmarg ticket-selling agent. Two types:
 *   - DEFAULT: Self-applied agents who sell via online payments only
 *   - OPERATOR_LINKED: Bus owner's existing counter agents (cash + online)
 *
 * Application lifecycle:
 *   DRAFT → PENDING → APPROVED | MORE_INFO | REJECTED
 *                       ↓              ↓
 *                     ACTIVE ←── resubmit
 *                       ↕
 *                    SUSPENDED
 *
 * Spec: shuvmarg-agent-model.md § 13.1
 */
const agentSchema = new mongoose.Schema(
    {
        // Human-readable Agent ID: SHV-AG-XXXX-NNN
        agentId: {
            type: String,
            unique: true,
            index: true,
        },

        // Link to the User account (phone, password, role)
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true,
        },

        /* =======================
           AGENT TYPE & LIFECYCLE
        ======================= */

        agentType: {
            type: String,
            enum: ["DEFAULT", "OPERATOR_LINKED"],
            default: "DEFAULT",
        },

        // Unified application lifecycle status
        // Replaces the old verificationStatus + accountStatus split
        applicationStatus: {
            type: String,
            enum: [
                "DRAFT",        // Application started, not yet submitted
                "PENDING",      // Submitted, awaiting admin review
                "MORE_INFO",    // Admin requested additional info/documents
                "APPROVED",     // Approved and active
                "REJECTED",     // Rejected (can reapply after 24 hours unless permanent)
                "SUSPENDED",    // Temporarily suspended by admin
            ],
            default: "DRAFT",
        },

        submittedAt: { type: Date, default: null },
        approvedAt: { type: Date, default: null },
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Superadmin",
            default: null,
        },

        /* =======================
           OPERATOR LINK (OPERATOR_LINKED agents only)
        ======================= */

        // Which bus operator introduced this agent
        // null for DEFAULT agents
        linkedOperatorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "OperatorBrand",
            default: null,
            index: true,
        },

        // Whether agent can book any of the operator's buses, or only specific routes
        busAccessScope: {
            type: String,
            enum: ["ALL_OPERATOR_BUSES", "SPECIFIC_ROUTES"],
            default: "ALL_OPERATOR_BUSES",
        },

        // Only populated when busAccessScope = SPECIFIC_ROUTES
        allowedRouteIds: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "RouteVariant",
        }],

        /* =======================
           STEP 1: PERSONAL DETAILS
           (name, phone, email live on User model)
        ======================= */

        district: { type: String, default: null, trim: true },
        municipality: { type: String, default: null, trim: true },
        placeName: { type: String, default: null, trim: true },

        /* =======================
           IDENTIFICATION NUMBERS
           Stored as plain text — never used for financial purposes.
        ======================= */

        citizenshipNumber: { type: String, default: null, trim: true },
        nationalIdNumber:  { type: String, default: null, trim: true },  // Optional — not all agents have this
        panNumber:         { type: String, default: null, trim: true },

        /* =======================
           STEP 2: BUSINESS DETAILS
        ======================= */

        businessName: { type: String, default: null, trim: true },
        shopAddress: { type: String, default: null, trim: true },

        operationType: {
            type: String,
            enum: [
                "ticket_counter",
                "travel_agent",
                "mobile_shop",
                "hotel",
                "individual",
                "other",
            ],
            default: null,
        },

        // Self-reported monthly ticket sales
        claimedMonthlyVolume: { type: String, default: null, trim: true },

        // Free text — which bus operators they currently work with
        currentOperators: { type: String, default: null, trim: true },

        // How they heard about Shuvmarg
        referralSource: { type: String, default: null, trim: true },

        /* =======================
           STEP 3: DOCUMENT UPLOAD
           Uses S3 object keys (presigned URL generated on read).
           Follows the same pattern as bus owner KYC in s3Service.js.
           S3 path: agents/{agentId}/kyc/{documentType}/
        ======================= */

        documents: [
            {
                type: {
                    type: String,
                    enum: [
                        "citizenship_front",
                        "citizenship_back",
                        "national_id_front",
                        "national_id_back",
                        "shop_photo",
                        "pan_card",
                        "business_registration",
                    ],
                    required: true,
                },
                // S3 object key — converted to presigned URL via getPresignedUrl()
                fileKey: { type: String, required: true },
                uploadedAt: { type: Date, default: Date.now },
                verified: { type: Boolean, default: false },
                verifiedBy: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Superadmin",
                    default: null,
                },
                verifiedAt: { type: Date, default: null },
                rejectionReason: { type: String, default: null },
            },
        ],

        /* =======================
           STEP 4: SETTLEMENT DETAILS
           Where the agent receives commission payouts.
        ======================= */

        settlementMethod: {
            type: String,
            enum: ["BANK", "ESEWA", "KHALTI"],
            default: null,
        },

        // Bank details (only when settlementMethod = BANK)
        bankName: { type: String, default: null, trim: true },
        bankAccountNumber: { type: String, default: null, trim: true },
        bankAccountName: { type: String, default: null, trim: true },

        // eSewa / Khalti phone number
        esewaNumber: { type: String, default: null, trim: true },
        khaltiNumber: { type: String, default: null, trim: true },

        /* =======================
           ADMIN REVIEW FIELDS
        ======================= */

        rejectionReason: { type: String, default: null },
        rejectedAt: { type: Date, default: null },

        // Admin's specific request when status = MORE_INFO
        moreInfoRequest: { type: String, default: null },
        moreInfoRequestedAt: { type: Date, default: null },

        // If true, agent cannot reapply (fraud cases)
        isPermanentlyRejected: { type: Boolean, default: false },

        // Internal admin notes (not visible to agent)
        adminNotes: { type: String, default: null },

        /* =======================
           CONSENTS
           Legal compliance — timestamps prove acceptance.
        ======================= */

        // Timestamp of T&C acceptance at application submit time
        termsAcceptedAt:  { type: Date, default: null },
        // Whether agent opted in to WhatsApp notifications
        whatsappConsent:  { type: Boolean, default: false },

        /* =======================
           COMMISSION CONFIGURATION
        ======================= */

        // Commission rate for online bookings (percentage, e.g. 5 = 5%)
        commissionRate: {
            type: Number,
            default: 5,
            min: 0,
            max: 100,
        },

        // Minimum commission balance before withdrawal is allowed
        minSettlementThreshold: {
            type: Number,
            default: 500,  // NPR 500 at launch
            min: 0,
        },

        /* =======================
           COMMISSION WALLET
           Denormalized balance — updated atomically with each
           AgentWalletTransaction. Source of truth for display.
        ======================= */

        commissionBalance: {
            type: Number,
            default: 0,
            // Can go negative when cancellation reversal exceeds balance
        },

        /* =======================
           DENORMALIZED STATS
           For dashboard display only — never used for financial calculation.
        ======================= */

        totalOnlineBookings: { type: Number, default: 0 },
        totalCashBookings: { type: Number, default: 0 },
        totalCommissionEarned: { type: Number, default: 0 },
        totalCommissionSettled: { type: Number, default: 0 },
        lastBookingAt: { type: Date, default: null },

        /* =======================
           MARKETING
        ======================= */

        // Unique code for agent QR — passengers scan to book through this agent
        referralCode: {
            type: String,
            sparse: true,
            unique: true,
        },
        // S3 key for pre-generated QR code image
        qrCodeUrl: { type: String, default: null },

        /* =======================
           SUSPENSION (admin action)
        ======================= */

        suspendedAt: { type: Date, default: null },
        suspendedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Superadmin",
            default: null,
        },
        suspensionReason: { type: String, default: null },
    },
    { timestamps: true }
);

/* =======================
   INDEXES
======================= */

// Admin review queue: pending applications sorted by submission
agentSchema.index({ applicationStatus: 1, submittedAt: 1 });
// Operator dashboard: all agents linked to a brand
agentSchema.index({ linkedOperatorId: 1, applicationStatus: 1 });
// Agent type filter
agentSchema.index({ agentType: 1, applicationStatus: 1 });

/* =======================
   AUTO-GENERATE AGENT ID
   Format: SHV-AG-XXX-NNN (e.g. SHV-AG-KRM-042)
======================= */

agentSchema.pre("save", async function (next) {
    if (this.agentId) return next();

    const prefix = "SHV-AG";
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
