const express = require("express");
const router = express.Router();
const auth = require("../../middleware/authMiddleware.js");
const { agentMiddleware } = require("../../middleware/checkRole.js");
const agentcon = require('../../controllers/agentController/agentController.js')

router.post("/submitAgentKyc", auth, agentMiddleware, agentcon.submitAgentKyc);
router.get("/myKycStatus", auth, agentMiddleware, agentcon.getMyKycStatus);

module.exports = router;    