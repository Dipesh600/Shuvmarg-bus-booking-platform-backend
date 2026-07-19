/**
 * controllers/adminController/adminAgentController/adminAgentController.js
 *
 * Admin-facing agent management endpoints.
 *
 * Routes (registered in adminRoutes.js):
 *   POST  /api/admin/makeUserAgent       — Convert passenger user to agent
 */

const mongoose = require("mongoose");
const User = require("../../../models/userModel.js");
const Agent = require("../../../models/agentModel.js");
const sendOTP = require("../../../handlers/sparro-otp.js");
const { createLocalNotification } = require("../../notificationController/notification_manager.js");

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

module.exports = {
    makeUserAgent,
    finalizeAgentSetup,
};
