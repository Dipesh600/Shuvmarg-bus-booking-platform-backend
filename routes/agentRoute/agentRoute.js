/**
 * @fileoverview Routes for Agent operations including KYC application, document handling, and agent dashboard.
 * All routes require basic authentication and agent role verification.
 */

const express = require("express");
const router = express.Router();
const auth = require("../../middleware/authMiddleware.js");
const verifyRoleFromDB = require("../../middleware/verifyRoleFromDB.js");
const { agentMiddleware } = require("../../middleware/checkRole.js");
const requireApprovedAgent = require("../../middleware/requireApprovedAgent.js");
const agentApplicationStatus = require('../../src/modules/agent/application-status');
const agentApplicationDraft = require('../../src/modules/agent/application-draft');
const agentApplicationSubmit = require('../../src/modules/agent/application-submit');
const agentApplicationDocumentUpload = require('../../src/modules/agent/application-document-upload');
const agentProfile = require('../../src/modules/agent/profile');
const agentDashboard = require('../../src/modules/agent/dashboard');

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
 * @access  Private (APPROVED agents only). Enforced by requireApprovedAgent.
 */
router.get("/profile", auth, verifyRoleFromDB, agentMiddleware, requireApprovedAgent, agentProfile.getProfile);

/**
 * @route   GET /api/agent/dashboard
 * @desc    Retrieve metrics and data for the agent dashboard
 * @access  Private (APPROVED agents only). Enforced by requireApprovedAgent.
 */
router.get("/dashboard", auth, verifyRoleFromDB, agentMiddleware, requireApprovedAgent, agentDashboard.getDashboard);

module.exports = router;
