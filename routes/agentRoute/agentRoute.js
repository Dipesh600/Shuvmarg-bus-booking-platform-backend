const express = require("express");
const router = express.Router();
const auth = require("../../middleware/authMiddleware.js");
const verifyRoleFromDB = require("../../middleware/verifyRoleFromDB.js");
const { agentMiddleware } = require("../../middleware/checkRole.js");
const requireApprovedAgent = require("../../middleware/requireApprovedAgent.js");
const agentcon = require("../../controllers/agentController/agentController.js");

// ── Application Workflow ──────────────────────────────────────────────────────
// Accessible to any authenticated user with the agent role.
// These routes work in DRAFT / MORE_INFO status — no requireApprovedAgent here.
router.post("/application/save",     auth, verifyRoleFromDB, agentMiddleware, agentcon.saveApplicationDraft);
router.post("/application/document", auth, verifyRoleFromDB, agentMiddleware, agentcon.uploadDocument);
router.post("/application/submit",   auth, verifyRoleFromDB, agentMiddleware, agentcon.submitApplication);
router.get("/application/status",    auth, verifyRoleFromDB, agentMiddleware, agentcon.getApplicationStatus);

// ── Profile & Dashboard ───────────────────────────────────────────────────────
// APPROVED agents only — requireApprovedAgent enforces this at DB level.
// agentMiddleware checks JWT role; requireApprovedAgent checks applicationStatus.
router.get("/profile",   auth, verifyRoleFromDB, agentMiddleware, requireApprovedAgent, agentcon.getProfile);
router.get("/dashboard", auth, verifyRoleFromDB, agentMiddleware, requireApprovedAgent, agentcon.getDashboard);

module.exports = router;