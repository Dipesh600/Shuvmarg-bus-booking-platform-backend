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
const { processFile } = require("../../services/fileProcessor.js");
const { uploadFileToS3, getPresignedUrl, deleteFromS3, buildS3Path } = require("../../services/s3Service.js");
const logger = require("../../utils/logger.js");

// ─── HELPER: Generate presigned URLs for documents ──────────────────────────
const resolveDocumentUrls = async (documents) => {
    if (!documents || documents.length === 0) return [];

    return Promise.all(
        documents.map(async (doc) => {
            const docObj = doc.toObject ? doc.toObject() : { ...doc };
            // Always expose fileKey so the frontend can build a server-proxy URL
            // (the presigned URL is kept for legacy/fallback but should not be used directly)
            if (docObj.fileKey && !docObj.fileKey.startsWith("http")) {
                docObj.previewUrl = await getPresignedUrl(docObj.fileKey);
            }
            // fileKey is already on docObj — no need to add it again
            return docObj;
        })
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/agent/application/save
//
// Save partial application data (draft). The agent can save progress at any
// step and come back later. Only updates fields that are present in the body.
// ─────────────────────────────────────────────────────────────────────────────
const saveApplicationDraft = async (req, res) => {
    try {
        const userId = req.userInfo?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized." });
        }

        let agent = await Agent.findOne({ user: userId });
        if (!agent) {
            agent = new Agent({ user: userId });
        }

        // Cannot edit after submission (unless MORE_INFO from admin)
        if (!["DRAFT", "MORE_INFO"].includes(agent.applicationStatus)) {
            return res.status(400).json({
                success: false,
                message: `Application cannot be edited in "${agent.applicationStatus}" status.`,
            });
        }

        const {
            // Step 1 — Location
            district, municipality, placeName,
            // Step 2 — Business
            businessName, shopAddress, operationType,
            claimedMonthlyVolume, currentOperators, referralSource,
            // Step 3 — Identification numbers
            citizenshipNumber, nationalIdNumber, panNumber,
            // Step 3 — Consents (saved on submit, but can be pre-saved)
            whatsappConsent,
            // Step 4 — Settlement
            settlementMethod, bankName, bankAccountNumber, bankAccountName,
            esewaNumber, khaltiNumber,
        } = req.body;

        // Step 1 — Location
        if (district !== undefined)      agent.district      = district;
        if (municipality !== undefined)  agent.municipality  = municipality;
        if (placeName !== undefined)     agent.placeName     = placeName;

        // Step 2 — Business
        if (businessName !== undefined)         agent.businessName         = businessName;
        if (shopAddress !== undefined)          agent.shopAddress          = shopAddress;
        if (operationType !== undefined)        agent.operationType        = operationType;
        if (claimedMonthlyVolume !== undefined) agent.claimedMonthlyVolume = claimedMonthlyVolume;
        if (currentOperators !== undefined)     agent.currentOperators     = currentOperators;
        if (referralSource !== undefined)       agent.referralSource       = referralSource;

        // Step 3 — Identification
        if (citizenshipNumber !== undefined) agent.citizenshipNumber = citizenshipNumber;
        if (nationalIdNumber !== undefined)  agent.nationalIdNumber  = nationalIdNumber;
        if (panNumber !== undefined)         agent.panNumber         = panNumber;

        // Consents
        if (whatsappConsent !== undefined)   agent.whatsappConsent   = !!whatsappConsent;

        // Step 4 — Settlement
        if (settlementMethod !== undefined)    agent.settlementMethod    = settlementMethod;
        if (bankName !== undefined)            agent.bankName            = bankName;
        if (bankAccountNumber !== undefined)   agent.bankAccountNumber   = bankAccountNumber;
        if (bankAccountName !== undefined)     agent.bankAccountName     = bankAccountName;
        if (esewaNumber !== undefined)         agent.esewaNumber         = esewaNumber;
        if (khaltiNumber !== undefined)        agent.khaltiNumber        = khaltiNumber;

        await agent.save();

        logger.info("agent: draft saved", { userId, agentId: agent.agentId });

        return res.status(200).json({
            success: true,
            message: "Application draft saved.",
            data: { agentId: agent.agentId, applicationStatus: agent.applicationStatus },
        });
    } catch (error) {
        logger.error("agent: saveApplicationDraft error", { error: error.message });
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/agent/application/document
//
// Upload a single document. Uses S3 + sharp compression pipeline.
//
// Body (multipart): { documentType: "citizenship_front" | "citizenship_back" | ... }
// File field: "file"
// ─────────────────────────────────────────────────────────────────────────────
const uploadDocument = async (req, res) => {
    try {
        const userId = req.userInfo?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized." });
        }

        const agent = await Agent.findOne({ user: userId });
        if (!agent) {
            return res.status(404).json({
                success: false,
                message: "Start your application first before uploading documents.",
            });
        }

        // Cannot upload after submission (unless MORE_INFO from admin)
        if (!["DRAFT", "MORE_INFO"].includes(agent.applicationStatus)) {
            return res.status(400).json({
                success: false,
                message: `Cannot upload documents in "${agent.applicationStatus}" status.`,
            });
        }

        const { documentType } = req.body;
        const validTypes = [
            "citizenship_front", "citizenship_back",
            "national_id_front", "national_id_back",
            "shop_photo", "pan_card", "business_registration",
        ];

        if (!documentType || !validTypes.includes(documentType)) {
            return res.status(400).json({
                success: false,
                message: `Invalid document type. Must be one of: ${validTypes.join(", ")}`,
            });
        }

        const file = req.files?.file;
        if (!file) {
            return res.status(400).json({
                success: false,
                message: "No file provided. Send file in 'file' field.",
            });
        }

        // ── Compress + Upload to S3 ────────────────────────────────────────
        const processed = await processFile(file, { preset: "document" });

        const s3Path = buildS3Path({
            type: "agent_kyc",
            agentId: agent._id.toString(),
            documentType: documentType.replace(/_/g, "-"),
        });

        const fileKey = await uploadFileToS3(processed, s3Path);

        // ── Update documents array ─────────────────────────────────────────
        // If this document type already exists, replace it (and clean up old S3 object)
        const existingIndex = agent.documents.findIndex(
            (d) => d.type === documentType
        );

        if (existingIndex !== -1) {
            const oldKey = agent.documents[existingIndex].fileKey;
            agent.documents[existingIndex] = {
                type: documentType,
                fileKey,
                uploadedAt: new Date(),
                verified: false,
                verifiedBy: null,
                verifiedAt: null,
                rejectionReason: null,
            };
            // Best-effort cleanup of old S3 object
            deleteFromS3(oldKey).catch(() => {});
        } else {
            agent.documents.push({
                type: documentType,
                fileKey,
                uploadedAt: new Date(),
            });
        }

        await agent.save();

        // Generate preview URL for immediate display in the app
        const previewUrl = await getPresignedUrl(fileKey);

        logger.info("agent: document uploaded", {
            userId,
            agentId: agent.agentId,
            documentType,
            wasCompressed: processed.wasCompressed,
            originalSize: processed.originalSize,
            compressedSize: processed.size,
        });

        return res.status(200).json({
            success: true,
            message: `${documentType} uploaded successfully.`,
            data: {
                documentType,
                previewUrl,
                wasCompressed: processed.wasCompressed,
                originalSize: processed.originalSize,
                compressedSize: processed.size,
            },
        });
    } catch (error) {
        // Surface file validation errors (wrong type, too large) as 400
        if (error.message.includes("Invalid file type") || error.message.includes("File too large")) {
            return res.status(400).json({ success: false, message: error.message });
        }
        logger.error("agent: uploadDocument error", { error: error.message });
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/agent/application/status
//
// Returns the agent's complete application state — status, all steps of data,
// document previews, and any admin feedback.
// Used by both the application form (to restore draft) and the status screen.
// ─────────────────────────────────────────────────────────────────────────────
const getApplicationStatus = async (req, res) => {
    try {
        const userId = req.userInfo?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized." });
        }

        const agent = await Agent.findOne({ user: userId }).populate("user", "name").lean();

        if (!agent) {
            return res.status(200).json({
                success: true,
                message: "No application started yet.",
                data: { applicationStatus: "DRAFT", hasApplication: false, userName: req.userInfo?.name || null },
            });
        }

        // Resolve document presigned URLs for display in the app
        const documentsWithUrls = await resolveDocumentUrls(agent.documents || []);

        // Compute reapply eligibility for REJECTED agents
        let canReapply = false;
        let reapplyAvailableAt = null;
        if (agent.applicationStatus === "REJECTED" && !agent.isPermanentlyRejected) {
            const REAPPLY_WINDOW_MS = 24 * 60 * 60 * 1000;
            const elapsed = agent.rejectedAt ? Date.now() - new Date(agent.rejectedAt).getTime() : Infinity;
            canReapply = elapsed >= REAPPLY_WINDOW_MS;
            if (!canReapply && agent.rejectedAt) {
                reapplyAvailableAt = new Date(new Date(agent.rejectedAt).getTime() + REAPPLY_WINDOW_MS);
            }
        }

        return res.status(200).json({
            success: true,
            message: "Application status retrieved.",
            data: {
                hasApplication: true,
                agentId: agent.agentId,
                applicationStatus: agent.applicationStatus,
                agentType: agent.agentType,
                submittedAt: agent.submittedAt,
                approvedAt: agent.approvedAt,
                userName: agent.user?.name ?? null,

                // Step 1 — Location
                personal: {
                    district: agent.district,
                    municipality: agent.municipality,
                    placeName: agent.placeName,
                },

                // Step 2 — Business
                business: {
                    businessName: agent.businessName,
                    shopAddress: agent.shopAddress,
                    operationType: agent.operationType,
                    claimedMonthlyVolume: agent.claimedMonthlyVolume,
                    currentOperators: agent.currentOperators,
                    referralSource: agent.referralSource,
                },

                // Step 3 — Identification
                identification: {
                    citizenshipNumber: agent.citizenshipNumber,
                    nationalIdNumber: agent.nationalIdNumber,
                    panNumber: agent.panNumber,
                },

                // Step 3 — Documents
                documents: documentsWithUrls,

                // Consents
                consents: {
                    termsAcceptedAt: agent.termsAcceptedAt,
                    whatsappConsent: agent.whatsappConsent,
                },

                // Admin feedback
                rejectionReason: agent.rejectionReason,
                moreInfoRequest: agent.moreInfoRequest,
                moreInfoRequestedAt: agent.moreInfoRequestedAt,
                isPermanentlyRejected: agent.isPermanentlyRejected,

                // Reapply eligibility (only meaningful when REJECTED)
                canReapply,
                reapplyAvailableAt,

                createdAt: agent.createdAt,
                updatedAt: agent.updatedAt,
            },
        });
    } catch (error) {
        logger.error("agent: getApplicationStatus error", { error: error.message });
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/agent/profile
//
// Returns the agent's profile data for the dashboard. Only accessible
// when application is approved.
// ─────────────────────────────────────────────────────────────────────────────
const getProfile = async (req, res) => {
    try {
        const userId = req.userInfo?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized." });
        }

        const agent = await Agent.findOne({ user: userId })
            .populate("linkedOperatorId", "brandName logo brandCode")
            .lean();

        if (!agent) {
            return res.status(404).json({
                success: false,
                message: "Agent profile not found.",
            });
        }

        if (agent.applicationStatus !== "APPROVED") {
            return res.status(403).json({
                success: false,
                message: `Your application is "${agent.applicationStatus}". Profile is available after approval.`,
                data: { applicationStatus: agent.applicationStatus },
            });
        }

        return res.status(200).json({
            success: true,
            message: "Agent profile retrieved.",
            data: {
                agentId: agent.agentId,
                agentType: agent.agentType,
                applicationStatus: agent.applicationStatus,
                linkedOperator: agent.linkedOperatorId || null,

                // Business
                businessName: agent.businessName,
                shopAddress: agent.shopAddress,
                operationType: agent.operationType,
                district: agent.district,
                municipality: agent.municipality,

                // Commission
                commissionRate: agent.commissionRate,
                commissionBalance: agent.commissionBalance,
                minSettlementThreshold: agent.minSettlementThreshold,

                // Stats
                totalOnlineBookings: agent.totalOnlineBookings,
                totalCashBookings: agent.totalCashBookings,
                totalCommissionEarned: agent.totalCommissionEarned,
                totalCommissionSettled: agent.totalCommissionSettled,
                lastBookingAt: agent.lastBookingAt,

                // Settlement
                settlementMethod: agent.settlementMethod,

                // Marketing
                referralCode: agent.referralCode,
                qrCodeUrl: agent.qrCodeUrl,

                approvedAt: agent.approvedAt,
                createdAt: agent.createdAt,
            },
        });
    } catch (error) {
        logger.error("agent: getProfile error", { error: error.message });
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/agent/dashboard
//
// Quick dashboard stats for the home screen.
// ─────────────────────────────────────────────────────────────────────────────
const getDashboard = async (req, res) => {
    try {
        const userId = req.userInfo?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized." });
        }

        const agent = await Agent.findOne({ user: userId }).lean();
        if (!agent || agent.applicationStatus !== "APPROVED") {
            return res.status(403).json({
                success: false,
                message: "Dashboard available after application approval.",
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                commissionBalance: agent.commissionBalance,
                totalOnlineBookings: agent.totalOnlineBookings,
                totalCashBookings: agent.totalCashBookings,
                totalCommissionEarned: agent.totalCommissionEarned,
                totalCommissionSettled: agent.totalCommissionSettled,
                lastBookingAt: agent.lastBookingAt,
                commissionRate: agent.commissionRate,
                agentType: agent.agentType,
            },
        });
    } catch (error) {
        logger.error("agent: getDashboard error", { error: error.message });
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

module.exports = {
    saveApplicationDraft,
    uploadDocument,
    submitApplication,
    getApplicationStatus,
    getProfile,
    getDashboard,
};