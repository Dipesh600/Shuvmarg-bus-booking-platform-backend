const express = require("express");
const router = express.Router();
const auth = require("../../middleware/authMiddleware.js");
const verifyRoleFromDB = require("../../middleware/verifyRoleFromDB.js");
const { agentMiddleware } = require("../../middleware/checkRole.js");
const agentcon = require('../../controllers/agentController/agentController.js')

// ── Pipeline: JWT verify → DB status check → role check ─────────────────────
router.use(auth, verifyRoleFromDB, agentMiddleware);

router.post("/submitAgentKyc", agentcon.submitAgentKyc);
router.get("/myKycStatus", agentcon.getMyKycStatus);

module.exports = router;