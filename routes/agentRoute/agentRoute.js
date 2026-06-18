const express = require("express");
const router = express.Router();
const auth = require("../../middleware/authMiddleware.js");
const verifyRoleFromDB = require("../../middleware/verifyRoleFromDB.js");
const { agentMiddleware } = require("../../middleware/checkRole.js");
const agentcon = require("../../controllers/agentController/agentController.js");

// ── Application Workflow ──────────────────────────────────────────────────────
// These routes are accessible to ANY authenticated user (passenger or agent)
// because an agent starts as a passenger and must be able to submit an application
// before receiving the "agent" role.
router.post("/application/save",     auth, verifyRoleFromDB, agentcon.saveApplicationDraft);
router.post("/application/document", auth, verifyRoleFromDB, agentcon.uploadDocument);
router.post("/application/submit",   auth, verifyRoleFromDB, agentcon.submitApplication);
router.get("/application/status",    auth, verifyRoleFromDB, agentcon.getApplicationStatus);

// ── Profile & Dashboard (post-approval ONLY — requires agent role) ────────────
router.get("/profile",    auth, verifyRoleFromDB, agentMiddleware, agentcon.getProfile);
router.get("/dashboard",  auth, verifyRoleFromDB, agentMiddleware, agentcon.getDashboard);

module.exports = router;