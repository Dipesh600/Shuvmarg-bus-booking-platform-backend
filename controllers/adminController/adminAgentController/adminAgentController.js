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

// Get agen by Id. api/admin/getAgentDetails
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

        // If id is a valid ObjectId, treat it as user _id
        if (mongoose.Types.ObjectId.isValid(id)) {
            user = await User.findById(id).select("-password -__v -otp -otpExpiry");
            agent = await Agent.findOne({ user: id });
        }

        // If not found by user id, try treating id as agentId string
        if (!agent) {
            agent = await Agent.findOne({ agentId: id });
            if (agent && !user) {
                user = await User.findById(agent.user).select(
                    "-password -__v -otp -otpExpiry"
                );
            }
        }

        if (!user && !agent) {
            return res.status(404).json({
                success: false,
                message: "Agent not found!",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Agent details retrieved successfully!",
            data: {
                profile: user,
                agentDetails: agent,
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

const updateAgentKyc = async (req, res) => {
    try {
        const { id, citizenshipCertificate, addressProof, bankAccount, agentAgreement, verificationStatus, rejectionReason } = req.body;

        let agent = null;

        if (id && mongoose.Types.ObjectId.isValid(id)) {
            agent = await Agent.findOne({ user: id });
        }

        if (!agent && agentId) {
            agent = await Agent.findOne({ agentId });
        }

        if (!agent) {
            return res.status(404).json({
                success: false,
                message: "Agent not found!",
            });
        }

        if (citizenshipCertificate) {
            if (!agent.citizenshipCertificate) agent.citizenshipCertificate = {};
            if (typeof citizenshipCertificate.verified === "boolean") {
                agent.citizenshipCertificate.verified = citizenshipCertificate.verified;
            }
            if (typeof citizenshipCertificate.rejectionReason === "string") {
                agent.citizenshipCertificate.rejectionReason = citizenshipCertificate.rejectionReason;
            }
        }

        if (addressProof) {
            if (!agent.addressProof) agent.addressProof = {};
            if (typeof addressProof.verified === "boolean") {
                agent.addressProof.verified = addressProof.verified;
            }
            if (typeof addressProof.rejectionReason === "string") {
                agent.addressProof.rejectionReason = addressProof.rejectionReason;
            }
        }

        if (bankAccount) {
            if (!agent.bankAccount) agent.bankAccount = {};
            if (typeof bankAccount.verified === "boolean") {
                agent.bankAccount.verified = bankAccount.verified;
            }
            if (typeof bankAccount.rejectionReason === "string") {
                agent.bankAccount.rejectionReason = bankAccount.rejectionReason;
            }
        }

        if (agentAgreement) {
            if (!agent.agentAgreement) agent.agentAgreement = {};
            if (typeof agentAgreement.verified === "boolean") {
                agent.agentAgreement.verified = agentAgreement.verified;
            }
            if (typeof agentAgreement.rejectionReason === "string") {
                agent.agentAgreement.rejectionReason = agentAgreement.rejectionReason;
            }
        }

        if (verificationStatus) {
            agent.verificationStatus = verificationStatus;
        }

        if (typeof rejectionReason === "string") {
            agent.rejectionReason = rejectionReason;
        }

        await agent.save();

        // Fetch user details for notifications
        const user = await User.findById(agent.user).select("name email phone");

        // Build list of invalid / rejected documents based on saved agent state
        const invalidDocs = [];

        if (agent.citizenshipCertificate && (agent.citizenshipCertificate.verified === false || agent.citizenshipCertificate.rejectionReason)) {
            invalidDocs.push({
                label: "Citizenship Certificate",
                reason: agent.citizenshipCertificate.rejectionReason || null,
            });
        }

        if (agent.addressProof && (agent.addressProof.verified === false || agent.addressProof.rejectionReason)) {
            invalidDocs.push({
                label: "Address Proof",
                reason: agent.addressProof.rejectionReason || null,
            });
        }

        if (agent.bankAccount && (agent.bankAccount.verified === false || agent.bankAccount.rejectionReason)) {
            invalidDocs.push({
                label: "Bank Account",
                reason: agent.bankAccount.rejectionReason || null,
            });
        }

        if (agent.agentAgreement && (agent.agentAgreement.verified === false || agent.agentAgreement.rejectionReason)) {
            invalidDocs.push({
                label: "Agent Agreement",
                reason: agent.agentAgreement.rejectionReason || null,
            });
        }

        const statusText = agent.verificationStatus || "pending";

        // Email notification
        if (user && user.email) {
            const invalidListHtml =
                invalidDocs.length > 0
                    ? invalidDocs
                        .map(
                            (d) =>
                                `<li><strong>${d.label}</strong>${d.reason ? ` - ${d.reason}` : ""
                                }</li>`
                        )
                        .join("")
                    : "<li>All submitted documents are verified.</li>`";

            if (user && user.email) {
                const emailHtml = generateAgentStatusEmail(
                    user.name,
                    statusText,
                    invalidDocs
                );
                await emailManager(user.email, "Agent KYC Update", emailHtml);
            };

        }

        // SMS notification
        if (user && user.phone) {
            let smsText = `Dear ${user.name || "Agent"}, your KYC status is ${statusText}.`;
            if (invalidDocs.length > 0) {
                const docNames = invalidDocs.map((d) => d.label).join(", ");
                smsText += ` Invalid documents: ${docNames}.`;
            }
            await sendOTP(user.phone, smsText);
        }

        // Push notification (FCM + local notification)
        try {
            const title = "Agent KYC Updated";
            const body =
                invalidDocs.length > 0
                    ? `Status: ${statusText}. Some documents need attention.`
                    : `Status: ${statusText}.`;

            // Local notification record for this user
            if (agent.user) {
                await createLocalNotification(agent.user, "AGENT_KYC_UPDATE", title, body, {
                    verificationStatus: statusText,
                });
            }

            // Send FCM only to this user's devices
            if (agent.user) {
                const devices = await UserDeviceInfo.find({ userId: agent.user });
                const tokens = devices.map((d) => d.token).filter(Boolean);
                if (tokens.length > 0) {
                    await notificationManager(tokens, title, body);
                }
            }
        } catch (notifyError) {
            console.error("KYC notification error:", notifyError);
        }

        return res.status(200).json({
            success: true,
            message: "Agent KYC updated successfully!",
        });
    } catch (error) {
        console.error("updateAgentKyc error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error!",
        });
    }
};

// Get all agents api/admin/getAllAgents
const getAllAgents = async (req, res) => {
    try {
        const agents = await User.find({ role: "agent" }).select(
            "-password -__v -otp -otpExpiry"
        );

        if (!agents || agents.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No agents found!",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Agents retrieved successfully!",
            data: agents,
        });
    } catch (error) {
        console.error("getAllAgents error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error!",
        });
    }
};

// Make a user an agent 
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

        // If already an agent, do not proceed
        if (user.role === "agent") {
            return res.status(400).json({
                success: false,
                message: "User is already an agent!",
            });
        }

        // Update user role to agent
        user.role = "agent";
        await user.save();

        // Ensure Agent document exists
        let agent = await Agent.findOne({ user: user._id });
        if (!agent) {
            agent = new Agent({ user: user._id });
            await agent.save();
        }

        return res.status(200).json({
            success: true,
            message: "User converted to agent successfully!",
            data: {
                userId: user._id,
                role: user.role,
                agentId: agent.agentId,
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

// Get Agent Dashboard Stats
const getAgentDashboard = async (req, res) => {
    try {
        const [
            totalAgents,
            verifiedAgents,
            pendingAgents,
            rejectedAgents,
        ] = await Promise.all([
            Agent.countDocuments({}),
            Agent.countDocuments({ verificationStatus: "verified" }),
            Agent.countDocuments({ verificationStatus: "pending" }),
            Agent.countDocuments({ verificationStatus: "rejected" }),
        ]);

        const verifiedPercentage = totalAgents > 0 
            ? ((verifiedAgents / totalAgents) * 100).toFixed(0) 
            : 0;

        return res.status(200).json({
            success: true,
            data: {
                totalAgents,
                verifiedAgents: `${verifiedAgents} (${verifiedPercentage}% of total)`,
                pendingAgents,
                rejectedAgents,
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
    updateAgentKyc,
    getAgentDashboard,
};