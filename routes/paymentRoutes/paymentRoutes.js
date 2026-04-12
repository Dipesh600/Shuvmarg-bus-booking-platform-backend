const express = require("express");
const router = express.Router();
const auth = require("../../middleware/authMiddleware.js");
const esewaPaymentVerification = require("../../controllers/esewaPaymentVerification/esewaPaymentVerification.js");

router.post("/verifyEsewa", auth, esewaPaymentVerification.verifyEsewa);

module.exports = router;
