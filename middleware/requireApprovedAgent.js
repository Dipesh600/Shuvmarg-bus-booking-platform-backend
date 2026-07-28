/**
 * middleware/requireApprovedAgent.js
 *
 * DB-level authorization middleware for agent-only routes that require
 * a FULLY APPROVED application before access is granted.
 *
 * Sits after `auth` and `agentMiddleware` (role check).
 * These checks run in sequence:
 *   1. auth              — valid JWT, user exists
 *   2. agentMiddleware   — JWT activeRole === "agent"
 *   3. requireApprovedAgent — Agent.applicationStatus === "APPROVED"
 *
 * Applied to: /profile, /dashboard, /bookings (anything post-approval)
 * NOT applied to: /application/* routes (accessible while DRAFT/MORE_INFO)
 *
 * Returns the current applicationStatus in the 403 response so the frontend
 * can display the correct status screen without an extra API call.
 */

"use strict";

const Agent = require("../models/agentModel.js");

const requireApprovedAgent = async (req, res, next) => {
    try {
        const userId = req.userInfo?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized.",
            });
        }

        const agent = await Agent.findOne({ user: userId })
            .select("applicationStatus isPermanentlyRejected rejectedAt")
            .lean();

        if (!agent) {
            return res.status(403).json({
                success: false,
                message: "No agent application found. Please complete your setup.",
                errorCode: "NO_APPLICATION",
                applicationStatus: null,
            });
        }

        if (agent.applicationStatus !== "APPROVED") {
            const messageMap = {
                DRAFT:     "Your application is incomplete. Please complete your setup to access this feature.",
                PENDING:   "Your application is under review. You will be notified once it is approved.",
                MORE_INFO: "Admin has requested additional information. Please update your application.",
                REJECTED:  "Your application was not approved. Please check your status for details.",
                SUSPENDED: "Your agent account has been suspended. Please contact support.",
            };

            return res.status(403).json({
                success: false,
                message: messageMap[agent.applicationStatus] || "Access denied.",
                errorCode: "APPLICATION_NOT_APPROVED",
                applicationStatus: agent.applicationStatus,
            });
        }

        // ✅ Approved — allow through
        next();
    } catch (error) {
        console.error("[requireApprovedAgent] Error:", error.message);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

module.exports = requireApprovedAgent;
