const express = require("express");
const router = express.Router();
const ticket = require("../../controllers/ticketController/ticketController.js");
const fareRuleCon = require("../../controllers/busOwnerController/fareRuleController.js");

// Search Trips (core public API)
router.post("/searchTrips", ticket.searchTrips);

// Compute effective fare before checkout (applies surge/advance discounts)
router.post("/computeFare", fareRuleCon.computeEffectiveFare);

module.exports = router;
