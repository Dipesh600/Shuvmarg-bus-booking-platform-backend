/**
 * controllers/adminController/adminAgentController/adminAgentController.js
 *
 * Admin-facing agent management endpoints.
 *
 * Routes (registered in adminRoutes.js):
 *   POST  /api/admin/getAgentDetails     — Get single agent by ID
 *   GET   /api/admin/getAllAgents         — List all agents (with filters)
 *   POST  /api/admin/makeUserAgent       — Convert passenger user to agent
 *   PATCH /api/admin/agentKycStatus      — Review application (approve/reject/more-info)
 *   GET   /api/admin/agentDashboard      — Agent module stats
 */

const mongoose = require("mongoose");
const User = require("../../../models/userModel.js");
const Agent = require("../../../models/agentModel.js");
const UserDeviceInfo = require("../../../models/userDeviceInfoModel.js");
const emailManager = require("../../../emailManager/emailManager.js");
const sendOTP = require("../../../handlers/sparro-otp.js");
const {
    notificationManager,
    createLocalNotification,
} = require("../../notificationController/notification_manager.js");
const generateAgentStatusEmail = require("../../../handlers/agentStatusEmailTemp.js");
const { getPresignedUrl } = require("../../../services/s3Service.js");

// ─── HELPER: Resolve document presigned URLs for admin review ────────────────
const resolveDocumentUrls = async (documents) => {
    if (!documents || documents.length === 0) return [];

    return Promise.all(
        documents.map(async (doc) => {
            const docObj = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
            if (docObj.fileKey && !docObj.fileKey.startsWith("http")) {
                docObj.previewUrl = await getPresignedUrl(docObj.fileKey);
            }
            return docObj;
        })
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/getAgentDetails
// Body: { id } — can be userId, agentId (SHV-AG-XXX-NNN), or Agent._id
// ─────────────────────────────────────────────────────────────────────────────
const getAgentsById = async (req, res) => {
    try {
        const { id } = req.body;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Id is required!",
            });
        }

        let user = null;
        let agent = null;

        // Try as ObjectId (userId or Agent._id)
        if (mongoose.Types.ObjectId.isValid(id)) {
            agent = await Agent.findOne({ user: id });
            if (agent) {
                user = await User.findById(id).select("-password -__v");
            } else {
                agent = await Agent.findById(id);
                if (agent) {
                    user = await User.findById(agent.user).select("-password -__v");
                }
            }
        }

        // Try as agentId string (SHV-AG-XXX-NNN)
        if (!agent) {
            agent = await Agent.findOne({ agentId: id });
            if (agent) {
                user = await User.findById(agent.user).select("-password -__v");
            }
        }

        if (!agent) {
            return res.status(404).json({
                success: false,
                message: "Agent not found!",
            });
        }

        // Resolve document presigned URLs for admin review
        const agentData = agent.toObject();
        agentData.documents = await resolveDocumentUrls(agent.documents);

        // Embed resolved user data directly into agentDetails
        // so the frontend can access agentDetails.user.name even if profile fetch fails
        if (user) {
            agentData.user = { _id: user._id, name: user.name, phone: user.phone, email: user.email };
        }

        return res.status(200).json({
            success: true,
            message: "Agent details retrieved successfully!",
            data: {
                profile: user,
                agentDetails: agentData,
            },
        });
    } catch (error) {
        console.error("getAgentsById error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error!",
        });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/admin/agentKycStatus
// Body: { id, applicationStatus, rejectionReason, moreInfoRequest, ... }
//
// Admin reviews agent application:
//   PENDING → APPROVED | REJECTED | MORE_INFO
//   MORE_INFO → (agent resubmits) → PENDING (handled by agent controller)
//   APPROVED → SUSPENDED (admin action)
//   SUSPENDED → APPROVED (admin re-activation)
// ─────────────────────────────────────────────────────────────────────────────
const updateAgentKyc = async (req, res) => {
    try {
        const {
            id,
            applicationStatus,
            rejectionReason,
            moreInfoRequest,
            isPermanentlyRejected,
            commissionRate,
            minSettlementThreshold,
            adminNotes,
            // Per-document verification
            documentVerifications,
        } = req.body;

        let agent = null;

        if (id && mongoose.Types.ObjectId.isValid(id)) {
            agent = await Agent.findOne({ user: id });
            if (!agent) agent = await Agent.findById(id);
        }
        if (!agent && id) {
            agent = await Agent.findOne({ agentId: id });
        }

        if (!agent) {
            return res.status(404).json({
                success: false,
                message: "Agent not found!",
            });
        }

        // ── Per-document verification ──────────────────────────────────────
        if (documentVerifications && Array.isArray(documentVerifications)) {
            for (const dv of documentVerifications) {
                const doc = agent.documents.find((d) => d.type === dv.type);
                if (doc) {
                    if (typeof dv.verified === "boolean") {
                        doc.verified = dv.verified;
                        if (dv.verified) {
                            doc.verifiedBy = req.adminInfo?.id || null;
                            doc.verifiedAt = new Date();
                            doc.rejectionReason = null;
                        }
                    }
                    if (typeof dv.rejectionReason === "string") {
                        doc.rejectionReason = dv.rejectionReason;
                    }
                }
            }
        }

        // ── Application-level status change ────────────────────────────────
        if (applicationStatus) {
            const prevStatus = agent.applicationStatus;

            agent.applicationStatus = applicationStatus;

            if (applicationStatus === "APPROVED") {
                agent.approvedAt = new Date();
                agent.approvedBy = req.adminInfo?.id || null;
                agent.rejectionReason = null;
                agent.moreInfoRequest = null;

                // Sync User model
                await User.findByIdAndUpdate(agent.user, {
                    isVerified: true,
                    status: "active",
                });
            }

            if (applicationStatus === "REJECTED") {
                agent.rejectionReason = rejectionReason || "Application rejected.";
                if (typeof isPermanentlyRejected === "boolean") {
                    agent.isPermanentlyRejected = isPermanentlyRejected;
                }

                // NOTE: Do NOT set User.status = "pending" here!
                // That would lock the user out of ALL apps (passenger, etc).
                // Agent-specific rejection lives on Agent.applicationStatus only.
                // Only update isVerified on the User model.
                await User.findByIdAndUpdate(agent.user, {
                    isVerified: false,
                });
            }

            if (applicationStatus === "MORE_INFO") {
                agent.moreInfoRequest = moreInfoRequest || "Additional information required.";
                agent.moreInfoRequestedAt = new Date();
            }

            if (applicationStatus === "SUSPENDED") {
                agent.suspendedAt = new Date();
                agent.suspendedBy = req.adminInfo?.id || null;
                agent.suspensionReason = rejectionReason || "Account suspended.";

                await User.findByIdAndUpdate(agent.user, { status: "inactive" });
            }

            // Re-activation
            if (applicationStatus === "APPROVED" && prevStatus === "SUSPENDED") {
                agent.suspendedAt = null;
                agent.suspendedBy = null;
                agent.suspensionReason = null;

                await User.findByIdAndUpdate(agent.user, {
                    status: "active",
                    isVerified: true,
                });
            }
        }

        // ── Admin config fields ────────────────────────────────────────────
        if (typeof commissionRate === "number") agent.commissionRate = commissionRate;
        if (typeof minSettlementThreshold === "number") agent.minSettlementThreshold = minSettlementThreshold;
        if (typeof adminNotes === "string") agent.adminNotes = adminNotes;

        await agent.save();

        // ── Notifications — only fire when a final decision status is set ────
        // Skip ALL notifications when admin is only verifying/rejecting individual
        // documents (documentVerifications only, no applicationStatus change).
        if (applicationStatus) {
            const user = await User.findById(agent.user).select("name email phone");
            const statusText = agent.applicationStatus || "DRAFT";

            // Identify rejected documents for notification detail
            const invalidDocs = agent.documents
                .filter((d) => d.verified === false || d.rejectionReason)
                .map((d) => ({
                    label: d.type.replace(/_/g, " "),
                    reason: d.rejectionReason || null,
                }));

            // Email notification
            if (user && user.email) {
                try {
                    const emailHtml = generateAgentStatusEmail(
                        user.name,
                        statusText,
                        invalidDocs
                    );
                    await emailManager(user.email, "Agent Application Update", emailHtml);
                } catch (emailErr) {
                    console.warn("[updateAgentKyc] Email failed (non-fatal):", emailErr.message);
                }
            }

            // SMS notification
            if (user && user.phone) {
                try {
                    let smsText = `Dear ${user.name || "Agent"}, your agent application status is ${statusText}.`;
                    if (applicationStatus === "APPROVED") {
                        if (agent.agentType === "OPERATOR_LINKED") {
                            smsText = `Welcome ${user.name || "Agent"}, your agent application is approved. Download the app and start selling tickets now! (Access via www.shuvmargagent.vercel.app/ for now)`;
                        } else {
                            smsText = `Dear ${user.name || "Agent"}, your agent application status is approved. You can start booking tickets now at www.shuvmargagent.vercel.app/`;
                        }
                    }
                    if (invalidDocs.length > 0) {
                        const docNames = invalidDocs.map((d) => d.label).join(", ");
                        smsText += ` Documents needing attention: ${docNames}.`;
                    }
                    await sendOTP(user.phone, smsText);
                } catch (smsErr) {
                    console.warn("[updateAgentKyc] SMS failed (non-fatal):", smsErr.message);
                }
            }

            // Push notification (FCM + local)
            try {
                const title = "Agent Application Update";
                const body =
                    applicationStatus === "APPROVED"
                        ? "Congratulations! Your agent application has been approved."
                        : applicationStatus === "REJECTED"
                        ? "Your agent application has been reviewed. Please check the app for details."
                        : applicationStatus === "MORE_INFO"
                        ? "We need additional information for your application. Please check the app."
                        : `Application status: ${statusText}.`;

                if (agent.user) {
                    await createLocalNotification(agent.user, "AGENT_KYC_UPDATE", title, body, {
                        applicationStatus: statusText,
                    });

                    const devices = await UserDeviceInfo.find({ userId: agent.user });
                    const tokens = devices.map((d) => d.token).filter(Boolean);
                    if (tokens.length > 0) {
                        await notificationManager(tokens, title, body);
                    }
                }
            } catch (notifyError) {
                console.error("Agent notification error:", notifyError);
            }
        } // end: applicationStatus notification gate

        return res.status(200).json({
            success: true,
            message: "Agent application updated successfully!",
        });
    } catch (error) {
        console.error("updateAgentKyc error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error!",
        });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/getAllAgents?status=PENDING&type=DEFAULT
// ─────────────────────────────────────────────────────────────────────────────
const getAllAgents = async (req, res) => {
    try {
        const { status, type } = req.query;

        const filter = {};
        if (status) filter.applicationStatus = status;
        if (type) filter.agentType = type;

        const agents = await Agent.find(filter)
            .populate("user", "name email phone profilePicture status")
            .populate("linkedOperatorId", "brandName brandCode")
            .sort({ createdAt: -1 })
            .lean();

        const formatted = agents.map((a) => ({
            id: a._id,
            agentId: a.agentId,
            userId: a.user?._id,
            name: a.user?.name || "N/A",
            phone: a.user?.phone || "N/A",
            email: a.user?.email || null,
            profileImg: a.user?.profilePicture || null,
            applicationStatus: a.applicationStatus,
            agentType: a.agentType,
            linkedOperator: a.linkedOperatorId
                ? { name: a.linkedOperatorId.brandName, code: a.linkedOperatorId.brandCode }
                : null,
            location: [a.municipality, a.district].filter(Boolean).join(", ") || "N/A",
            commission: `${a.commissionRate}%`,
            commissionBalance: a.commissionBalance,
            totalBookings: a.totalOnlineBookings + a.totalCashBookings,
            operationType: a.operationType,
            submittedAt: a.submittedAt,
            createdAt: a.createdAt,
        }));

        return res.status(200).json({
            success: true,
            message: formatted.length === 0 ? "No agents found." : "Agents retrieved successfully!",
            results: formatted.length,
            data: formatted,
        });
    } catch (error) {
        console.error("getAllAgents error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error!",
        });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/makeUserAgent
// Body: { id } — User._id to convert
// ─────────────────────────────────────────────────────────────────────────────
const makeUserAgent = async (req, res) => {
    try {
        const { id } = req.body;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Id is required!",
            });
        }

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID format!",
            });
        }

        const user = await User.findById(id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found!",
            });
        }

        // Multi-role check: verify via roles[] array
        const userRoles = user.roles && user.roles.length > 0 ? user.roles : [user.role];
        if (userRoles.includes("agent")) {
            return res.status(400).json({
                success: false,
                message: "User is already an agent!",
            });
        }

        // Add agent role to existing user (DO NOT overwrite user.role)
        await User.findByIdAndUpdate(id, {
            $addToSet: { roles: "agent" },
            $set: { [`roleActivatedAt.agent`]: new Date() },
        });

        // Ensure Agent document exists
        let agent = await Agent.findOne({ user: user._id });
        if (!agent) {
            agent = new Agent({ user: user._id });
            await agent.save();
        }

        return res.status(200).json({
            success: true,
            message: "Agent role added to user successfully!",
            data: {
                userId: user._id,
                roles: [...userRoles, "agent"],
                agentId: agent.agentId,
                agentMongoId: agent._id,
            },
        });
    } catch (error) {
        console.error("makeUserAgent error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error!",
        });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/admin/finalizeAgentSetup
//
// Called after makeUserAgent — fills in all profile fields and, for
// OPERATOR_LINKED agents, approves immediately + sends a welcome SMS.
// ─────────────────────────────────────────────────────────────────────────────
const finalizeAgentSetup = async (req, res) => {
    try {
        const {
            id,
            agentType,
            linkedOperatorId,
            busAccessScope,
            allowedRouteIds,
            commissionRate,
            minSettlementThreshold,
            adminNotes,
            district,
            municipality,
            businessName,
            shopAddress,
            operationType,
            claimedMonthlyVolume,
            currentOperators,
            settlementMethod,
            bankName,
            bankAccountNumber,
            bankAccountName,
            esewaNumber,
            khaltiNumber,
        } = req.body;

        if (!id) {
            return res.status(400).json({ success: false, message: "id is required" });
        }

        // Resolve agent by _id or agentId string
        let agent = null;
        if (mongoose.Types.ObjectId.isValid(id)) {
            agent = await Agent.findById(id);
        }
        if (!agent) {
            agent = await Agent.findOne({ agentId: id });
        }
        if (!agent) {
            return res.status(404).json({ success: false, message: "Agent not found" });
        }

        // ── Agent type ────────────────────────────────────────────────────
        if (agentType) agent.agentType = agentType;

        // ── Operator link (OPERATOR_LINKED only) ──────────────────────────
        if (agentType === "OPERATOR_LINKED") {
            if (!linkedOperatorId || !mongoose.Types.ObjectId.isValid(linkedOperatorId)) {
                return res.status(400).json({
                    success: false,
                    message: "linkedOperatorId is required for OPERATOR_LINKED agents",
                });
            }
            agent.linkedOperatorId = linkedOperatorId;
            agent.busAccessScope = busAccessScope || "ALL_OPERATOR_BUSES";

            if (busAccessScope === "SPECIFIC_ROUTES") {
                if (!allowedRouteIds || allowedRouteIds.length === 0) {
                    return res.status(400).json({
                        success: false,
                        message: "allowedRouteIds is required when busAccessScope is SPECIFIC_ROUTES",
                    });
                }
                agent.allowedRouteIds = allowedRouteIds;
            } else {
                agent.allowedRouteIds = [];
            }

            // Auto-approve — operator vouches for this counter staff member
            agent.applicationStatus = "APPROVED";
            agent.approvedAt = new Date();
            agent.approvedBy = req.adminInfo?.id || null;
            agent.submittedAt = new Date();

            await User.findByIdAndUpdate(agent.user, {
                isVerified: true,
                status: "active",
            });
        }

        // ── Personal ──────────────────────────────────────────────────────
        if (district)     agent.district     = district;
        if (municipality) agent.municipality = municipality;

        // ── Business ──────────────────────────────────────────────────────
        if (businessName)         agent.businessName         = businessName;
        if (shopAddress)          agent.shopAddress          = shopAddress;
        if (operationType)        agent.operationType        = operationType;
        if (claimedMonthlyVolume) agent.claimedMonthlyVolume = claimedMonthlyVolume;
        if (currentOperators)     agent.currentOperators     = currentOperators;

        // ── Settlement ────────────────────────────────────────────────────
        if (settlementMethod)  agent.settlementMethod  = settlementMethod;
        if (bankName)          agent.bankName          = bankName;
        if (bankAccountNumber) agent.bankAccountNumber = bankAccountNumber;
        if (bankAccountName)   agent.bankAccountName   = bankAccountName;
        if (esewaNumber)       agent.esewaNumber       = esewaNumber;
        if (khaltiNumber)      agent.khaltiNumber      = khaltiNumber;

        // ── Admin config ──────────────────────────────────────────────────
        if (typeof commissionRate === "number")         agent.commissionRate         = commissionRate;
        if (typeof minSettlementThreshold === "number") agent.minSettlementThreshold = minSettlementThreshold;
        if (typeof adminNotes === "string")             agent.adminNotes             = adminNotes;

        await agent.save();

        // ── Welcome notification for OPERATOR_LINKED ──────────────────────
        // Counter staff may not have the app yet — send a download invitation
        // instead of the generic "application approved" message.
        if (agentType === "OPERATOR_LINKED") {
            const agentUser = await User.findById(agent.user).select("name phone");

            if (agentUser?.phone) {
                try {
                    const welcomeSms =
                        `Welcome to Shuvmarg, ${agentUser.name || "Agent"}! ` +
                        `Your agent account (${agent.agentId}) is approved. ` +
                        `Start selling tickets now at www.shuvmargagent.vercel.app/`;
                    await sendOTP(agentUser.phone, welcomeSms);
                } catch (smsErr) {
                    console.warn("[finalizeAgentSetup] SMS failed (non-fatal):", smsErr.message);
                }
            }

            try {
                await createLocalNotification(
                    agent.user,
                    "AGENT_KYC_UPDATE",
                    "Welcome to Shuvmarg!",
                    "Your agent account is ready. Download the Shuvmarg Partner App to get started.",
                    { applicationStatus: "APPROVED", agentId: agent.agentId }
                );
            } catch (notifyErr) {
                console.warn("[finalizeAgentSetup] Push failed (non-fatal):", notifyErr.message);
            }
        }

        return res.status(200).json({
            success: true,
            message: agentType === "OPERATOR_LINKED"
                ? "Operator-linked agent created and approved!"
                : "Agent profile updated.",
            data: {
                agentId: agent.agentId,
                agentMongoId: agent._id,
                applicationStatus: agent.applicationStatus,
                agentType: agent.agentType,
            },
        });
    } catch (error) {
        console.error("finalizeAgentSetup error:", error);
        return res.status(500).json({ success: false, message: "Internal Server Error!" });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/agentDashboard
// ─────────────────────────────────────────────────────────────────────────────
const getAgentDashboard = async (req, res) => {
    try {
        const [
            totalAgents,
            activeAgents,
            approvedAgents,
            pendingAgents,
            rejectedAgents,
            moreInfoAgents,
            suspendedAgents,
            draftAgents,
            defaultAgents,
            operatorLinkedAgents,
        ] = await Promise.all([
            // All Agent documents ever created (full historical count)
            Agent.countDocuments({}),
            // "Registered" = submitted and in the system (excludes DRAFT & REJECTED)
            Agent.countDocuments({ applicationStatus: { $in: ["APPROVED", "PENDING", "MORE_INFO", "SUSPENDED"] } }),
            Agent.countDocuments({ applicationStatus: "APPROVED" }),
            Agent.countDocuments({ applicationStatus: "PENDING" }),
            Agent.countDocuments({ applicationStatus: "REJECTED" }),
            Agent.countDocuments({ applicationStatus: "MORE_INFO" }),
            Agent.countDocuments({ applicationStatus: "SUSPENDED" }),
            Agent.countDocuments({ applicationStatus: "DRAFT" }),
            Agent.countDocuments({ agentType: "DEFAULT" }),
            Agent.countDocuments({ agentType: "OPERATOR_LINKED" }),
        ]);

        const approvedPercentage = activeAgents > 0
            ? ((approvedAgents / activeAgents) * 100).toFixed(0)
            : 0;

        return res.status(200).json({
            success: true,
            data: {
                // "Registered" agents = submitted (not DRAFT/REJECTED)
                totalAgents: activeAgents,
                // Full breakdown for context
                allTimeTotal: totalAgents,
                approvedAgents: `${approvedAgents} (${approvedPercentage}% of registered)`,
                pendingAgents,
                rejectedAgents,
                moreInfoAgents,
                suspendedAgents,
                draftAgents,
                byType: {
                    default: defaultAgents,
                    operatorLinked: operatorLinkedAgents,
                },
            },
        });
    } catch (error) {
        console.error("getAgentDashboard error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch agent dashboard stats",
            error: error.message,
        });
    }
};

module.exports = {
    getAgentsById,
    getAllAgents,
    makeUserAgent,
    finalizeAgentSetup,
    updateAgentKyc,
    getAgentDashboard,
};