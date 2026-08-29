const mongoose = require("mongoose");
const { applyAgentCodeHooks } = require("../src/shared/identity/agent-code.hooks.js");
const { AGENT_SCOPES, KYC_STATUSES, OUTLET_TYPES } = require("../src/shared/identity/agent-enums.js");
const agentKycDocumentSchema = require("./schemas/agent-kyc-document.schema.js");

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
        // Human-facing agent code: SM-AG-XXXXXXX (see src/shared/identity).
        // This is the code an agent shares with operators to be assigned.
        // Sparse because agents created before the scheme carry only agentId.
        code: {
            type: String,
            unique: true,
            sparse: true,
        },

        // Legacy human-readable Agent ID: SHV-AG-XXX-NNN.
        // Superseded by `code`; still written and read during the transition.
        // Resolve either form with src/shared/identity/agent-code-lookup.js.
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
           SCOPE, OUTLET & PROVENANCE
           Vocabulary lives in src/shared/identity/agent-enums.js.
        ======================= */

        // Who owns the relationship. Supersedes `agentType`.
        scope: {
            type: String,
            enum: Object.values(AGENT_SCOPES),
            default: AGENT_SCOPES.PLATFORM,
        },

        // What kind of shopfront. Supersedes `operationType`.
        outletType: {
            type: String,
            enum: Object.values(OUTLET_TYPES),
            default: null,
        },

        // The bus owner who first created this agent, when an operator did.
        // Provenance only — it grants no selling right. Rights come from
        // AgentAssignment, and an agent created by one owner may be assigned by
        // any number of others.
        //
        // Refs User, not BusOwner: every other `ownerId` in this codebase is the
        // owner's User id (see OperatorBrand.ownerId), and req.userInfo.id is
        // what handlers actually hold. Deviating here would be the surprise.
        createdByOwnerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },

        /* =======================
           AGENT TYPE & LIFECYCLE
        ======================= */

        // DEPRECATED — superseded by `scope`. Still written by the super admin
        // 6-step wizard; dual-read via agent-enums.scopeOf(). Do not add readers.
        agentType: {
            type: String,
            enum: ["DEFAULT", "OPERATOR_LINKED"],
            default: "DEFAULT",
        },

        // Unified verification status, serving BOTH scope machines:
        //   OPERATOR  DRAFT → PHONE_VERIFIED → VERIFIED_BASIC → SUSPENDED
        //   PLATFORM  DRAFT → PENDING → MORE_INFO → APPROVED | REJECTED → SUSPENDED
        // The enum below is the union; which values are legal for a given agent
        // is decided by scope, in agent-enums.isKycStatusLegalForScope(). The
        // schema cannot express that — one field, two machines.
        applicationStatus: {
            type: String,
            enum: Object.values(KYC_STATUSES),
            default: KYC_STATUSES.DRAFT,
        },

        submittedAt: { type: Date, default: null },
        approvedAt: { type: Date, default: null },
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SuperAdmin",
            default: null,
        },

        /* =======================
           OPERATOR LINK — ALL DEPRECATED
           These describe the agent↔operator *relationship*, which is many-to-many:
           one agent, one published code, assignable by several operators, owned
           by none. A single ObjectId cannot hold that. They move to
           AgentAssignment in slice 2. Kept because the super admin 6-step wizard
           still writes them. Do not add readers.
        ======================= */

        // DEPRECATED — becomes AgentAssignment.operatorId.
        linkedOperatorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "OperatorBrand",
            default: null,
            index: true,
        },

        // DEPRECATED — becomes AgentAssignment.accessScope.
        busAccessScope: {
            type: String,
            enum: ["ALL_OPERATOR_BUSES", "SPECIFIC_ROUTES"],
            default: "ALL_OPERATOR_BUSES",
        },

        // DEPRECATED — becomes AgentAssignment.allowedRouteIds.
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
           Subdocument shape in models/schemas/agent-kyc-document.schema.js.
        ======================= */

        documents: [agentKycDocumentSchema],

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
           COMMISSION CONFIGURATION — DEPRECATED
           Commission is a term of the agent↔operator relationship, not a
           property of the agent. Both move to AgentAssignment.operatorCommission
           in slice 2, where they can differ per operator. Still written by the
           super admin wizard.
        ======================= */

        // DEPRECATED — becomes AgentAssignment.operatorCommission{mode,value}.
        commissionRate: {
            type: Number,
            default: 5,
            min: 0,
            max: 100,
        },

        // DEPRECATED — platform-scope only. Operator agents are paid by the
        // operator; we never hold or settle their money.
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
            ref: "SuperAdmin",
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
// Operator dashboard: all agents linked to a brand — DEPRECATED with the field
agentSchema.index({ linkedOperatorId: 1, applicationStatus: 1 });
// Agent type filter — DEPRECATED with the field
agentSchema.index({ agentType: 1, applicationStatus: 1 });
// Scope filter, replacing the agentType one above (admin directory, slice 5)
agentSchema.index({ scope: 1, applicationStatus: 1 });
// "Which agents did this owner create?" — provenance list on the owner's side
agentSchema.index({ createdByOwnerId: 1, createdAt: -1 });

/* =======================
   AUTO-GENERATE IDENTIFIERS
   code:    SM-AG-XXXXXXX  (current scheme)
   agentId: SHV-AG-XXX-NNN (legacy, dual-written until readers migrate)
======================= */

applyAgentCodeHooks(agentSchema);

module.exports = mongoose.model("Agent", agentSchema);
