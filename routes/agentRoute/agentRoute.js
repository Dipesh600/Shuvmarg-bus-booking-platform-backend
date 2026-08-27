/**
 * @fileoverview Routes for Agent operations including KYC application, document handling, and agent dashboard.
 * All routes require basic authentication and agent role verification.
 */

const express = require("express");
const router = express.Router();
const auth = require("../../middleware/authMiddleware.js");
const verifyRoleFromDB = require("../../middleware/verifyRoleFromDB.js");
const { agentMiddleware } = require("../../middleware/checkRole.js");
const requireVerifiedAgent = require("../../middleware/requireVerifiedAgent.js");
const agentApplicationStatus = require('../../src/modules/agent/application-status');
const agentApplicationDraft = require('../../src/modules/agent/application-draft');
const agentApplicationSubmit = require('../../src/modules/agent/application-submit');
const agentApplicationDocumentUpload = require('../../src/modules/agent/application-document-upload');
const agentProfile = require('../../src/modules/agent/profile');
const agentDashboard = require('../../src/modules/agent/dashboard');
const agentIdentity = require('../../src/modules/agent/identity');
const agentAssignmentResponse = require("../../src/modules/agent/assignment-response");
const agentAssignmentRespondRateLimit = require("../../middleware/agentAssignmentRespondRateLimit.js");
const agentSellableInventory = require("../../src/modules/agent/sellable-inventory");
const agentSellableInventoryRateLimit = require("../../middleware/agentSellableInventoryRateLimit.js");
const registerAgentSaleRoutes = require("./agentSaleRoutes.js");
const registerAgentSalesReadRoutes = require("./agentSalesReadRoutes.js");

// ── Identity ──────────────────────────────────────────────────────────────────
// Deliberately NOT behind requireVerifiedAgent. An agent's code and KYC status
// are exactly what they need to see *before* they are cleared — gating them on
// approval would leave a new agent with a blank screen and no way to find out
// why. Nothing sellable is exposed here.

/**
 * @route   GET /api/agent/me
 * @desc    The agent's own identity: agentCode, scope, outlet, KYC status
 * @access  Private (Agent role required, any status)
 */
router.get("/me", auth, verifyRoleFromDB, agentMiddleware, agentIdentity.getIdentity);

/**
 * @route   PATCH /api/agent/me
 * @desc    Update the agent's own basic profile (allowlisted fields only)
 * @access  Private (Agent role required, any status)
 */
router.patch("/me", auth, verifyRoleFromDB, agentMiddleware, agentIdentity.updateIdentity);

/**
 * @route   GET /api/agent/me/code
 * @desc    The shareable agent code plus the canonical share text
 * @access  Private (Agent role required, any status)
 */
router.get("/me/code", auth, verifyRoleFromDB, agentMiddleware, agentIdentity.getCode);

// ── Assignment Invitations ───────────────────────────────────────────────────
// Deliberately NOT behind requireVerifiedAgent. An unfinished-KYC agent must be
// able to answer the invite that motivates them to finish onboarding; selling is
// gated later against both verification and an ACTIVE assignment.

router.post(
  "/assignments/:assignmentId/accept",
  auth,
  verifyRoleFromDB,
  agentMiddleware,
  agentAssignmentRespondRateLimit,
  agentAssignmentResponse.acceptAssignment,
);

router.post(
  "/assignments/:assignmentId/decline",
  auth,
  verifyRoleFromDB,
  agentMiddleware,
  agentAssignmentRespondRateLimit,
  agentAssignmentResponse.declineAssignment,
);

// ── Sellable Inventory ───────────────────────────────────────────────────────
// Deliberately NOT behind requireVerifiedAgent. KYC gates committing a sale, not
// reading the catalogue an agent could sell after verification; kycStatus in the
// response lets the client keep its sell action disabled until then.
router.get(
  "/sellable-inventory",
  auth,
  verifyRoleFromDB,
  agentMiddleware,
  agentSellableInventoryRateLimit,
  agentSellableInventory.listSellableInventory,
);

registerAgentSaleRoutes(router, { auth, verifyRoleFromDB, agentMiddleware });
registerAgentSalesReadRoutes(router, { auth, verifyRoleFromDB, agentMiddleware });

// ── Application Workflow ──────────────────────────────────────────────────────

/**
 * @route   POST /api/agent/application/save
 * @desc    Save the agent application as a draft
 * @access  Private (Agent role required, accessible in DRAFT or MORE_INFO status)
 */
router.post("/application/save", auth, verifyRoleFromDB, agentMiddleware, agentApplicationDraft.saveApplicationDraft);

/**
 * @route   POST /api/agent/application/document
 * @desc    Upload a KYC document for the agent application
 * @access  Private (Agent role required, accessible in DRAFT or MORE_INFO status)
 */
router.post("/application/document", auth, verifyRoleFromDB, agentMiddleware, agentApplicationDocumentUpload.uploadDocument);

/**
 * @route   POST /api/agent/application/submit
 * @desc    Submit the completed agent application for admin review
 * @access  Private (Agent role required, accessible in DRAFT or MORE_INFO status)
 */
router.post("/application/submit", auth, verifyRoleFromDB, agentMiddleware, agentApplicationSubmit.submitApplication);

/**
 * @route   GET /api/agent/application/status
 * @desc    Retrieve the current status of the agent application (e.g. APPROVED, PENDING, DRAFT)
 * @access  Private (Agent role required, accessible in any status)
 */
router.get("/application/status", auth, verifyRoleFromDB, agentMiddleware, agentApplicationStatus.getApplicationStatus);

// ── Document Proxy ─────────────────────────────────────────────────────────────

const documentProxy = require("../../src/modules/shared/document-proxy");

/**
 * @route   GET /api/agent/documents/view
 * @desc    Stream S3 KYC documents to the browser. The raw S3 URL never reaches the client.
 *          The key must be an object key stored in the agent's document record (fileKey field).
 * @access  Private (Agent role required)
 */
router.get("/documents/view", auth, verifyRoleFromDB, agentMiddleware, documentProxy.viewDocument);

// ── Profile & Dashboard ───────────────────────────────────────────────────────

/**
 * @route   GET /api/agent/profile
 * @desc    Retrieve the agent's profile details
 * @access  Private (verified agents only). Enforced by requireVerifiedAgent.
 */
router.get("/profile", auth, verifyRoleFromDB, agentMiddleware, requireVerifiedAgent, agentProfile.getProfile);

/**
 * @route   GET /api/agent/dashboard
 * @desc    Retrieve metrics and data for the agent dashboard
 * @access  Private (verified agents only). Enforced by requireVerifiedAgent.
 */
router.get("/dashboard", auth, verifyRoleFromDB, agentMiddleware, requireVerifiedAgent, agentDashboard.getDashboard);

module.exports = router;
