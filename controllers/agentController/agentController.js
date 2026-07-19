/**
 * controllers/agentController/agentController.js
 *
 * Agent-facing API endpoints for the partner app.
 *
 * Application workflow (4-step form):
 *   POST /api/agent/application/save     — Save draft (any step, partial data)
 *   POST /api/agent/application/submit   — Submit for review (requires all 4 steps complete)
 *   GET  /api/agent/application/status   — Get current application status + data
 *   POST /api/agent/application/document — Upload a single document
 *
 * Profile:
 *   GET  /api/agent/profile              — Get agent profile (post-approval)
 *   GET  /api/agent/dashboard            — Get dashboard stats
 */

const mongoose = require("mongoose");
const Agent = require("../../models/agentModel.js");

// POST /api/agent/application/submit
//
// Submit the application for admin review. Validates all required fields.
// Transitions: DRAFT → PENDING, MORE_INFO → PENDING
//
// Reapply (REJECTED → PENDING): allowed after 24 hours from rejection.
// ─────────────────────────────────────────────────────────────────────────────
const submitApplication = async (req, res) => {
    try {
        const userId = req.userInfo?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized." });
        }

        const agent = await Agent.findOne({ user: userId });
        if (!agent) {
            return res.status(404).json({
                success: false,
                message: "No application found. Please start your application first.",
            });
        }

        const { termsAccepted } = req.body;

        // ── Status gate ────────────────────────────────────────────────────
        if (agent.applicationStatus === "REJECTED") {
            if (agent.isPermanentlyRejected) {
                return res.status(403).json({
                    success: false,
                    message: "Your application has been permanently rejected. Please contact support.",
                    errorCode: "PERMANENTLY_REJECTED",
                });
            }
            // 24-hour reapply window
            const REAPPLY_WINDOW_MS = 24 * 60 * 60 * 1000;
            if (agent.rejectedAt && (Date.now() - new Date(agent.rejectedAt).getTime()) < REAPPLY_WINDOW_MS) {
                const hoursLeft = Math.ceil(
                    (REAPPLY_WINDOW_MS - (Date.now() - new Date(agent.rejectedAt).getTime())) / 3600000
                );
                return res.status(429).json({
                    success: false,
                    message: `You can reapply after ${hoursLeft} hour(s).`,
                    errorCode: "REAPPLY_TOO_SOON",
                    hoursLeft,
                });
            }
            // Reset to DRAFT so they can edit and resubmit
            agent.applicationStatus = "DRAFT";
        }

        if (!["DRAFT", "MORE_INFO"].includes(agent.applicationStatus)) {
            return res.status(400).json({
                success: false,
                message: `Application is in "${agent.applicationStatus}" status and cannot be submitted.`,
            });
        }

        // ── Terms acceptance ───────────────────────────────────────────────
        if (!termsAccepted) {
            return res.status(400).json({
                success: false,
                message: "You must accept the Terms and Conditions to submit your application.",
            });
        }

        // ── Validate completeness ──────────────────────────────────────────
        const errors = [];

        // Step 1 — Location
        if (!agent.district)      errors.push("District is required.");
        if (!agent.municipality)  errors.push("Municipality is required.");
        if (!agent.placeName)     errors.push("Place name is required.");

        // Step 2 — Business
        if (!agent.operationType) errors.push("Agent type is required.");
        if (!agent.shopAddress)   errors.push("Shop / Office address is required.");
        // businessName is required for all types except individual
        if (agent.operationType !== "individual" && !agent.businessName) {
            errors.push("Business name is required for your agent type.");
        }

        // Step 3 — Identification numbers
        if (!agent.citizenshipNumber) errors.push("Citizenship number is required.");
        if (!agent.panNumber)         errors.push("PAN number is required.");
        // nationalIdNumber is optional — no validation

        // Step 3 — Documents
        const uploadedTypes = agent.documents.map((d) => d.type);
        const requiredDocs = ["citizenship_front", "citizenship_back", "pan_card"];
        for (const required of requiredDocs) {
            if (!uploadedTypes.includes(required)) {
                errors.push(`${required.replace(/_/g, " ")} document is required.`);
            }
        }

        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Application is incomplete. Please fix the following:",
                errors,
            });
        }

        // ── Submit ─────────────────────────────────────────────────────────
        agent.applicationStatus = "PENDING";
        agent.submittedAt       = new Date();
        agent.termsAcceptedAt   = new Date();
        agent.rejectionReason   = null;
        agent.moreInfoRequest   = null;
        agent.moreInfoRequestedAt = null;

        await agent.save();

        logger.info("agent: application submitted", { userId, agentId: agent.agentId });

        return res.status(200).json({
            success: true,
            message: "Application submitted successfully! We'll review it within 2–3 business days.",
            data: {
                agentId: agent.agentId,
                applicationStatus: agent.applicationStatus,
                submittedAt: agent.submittedAt,
            },
        });
    } catch (error) {
        logger.error("agent: submitApplication error", { error: error.message });
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

module.exports = {
    submitApplication,
};
