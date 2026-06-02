const express = require("express");
const router = express.Router();
const ticket = require("../../controllers/ticketController/ticketController.js");
const fareRuleCon = require("../../controllers/busOwnerController/fareRuleController.js");
const { searchStops } = require("../../controllers/public/stopSearchController.js");

// ── Stop Autocomplete (powers the From/To search bar in the app) ──────────────
// GET /api/public/stops/search?q=Kath&limit=8
router.get("/stops/search", searchStops);

// Search Trips (core public API)
router.post("/searchTrips", ticket.searchTrips);

// Compute effective fare before checkout (applies surge/advance discounts)
router.post("/computeFare", fareRuleCon.computeEffectiveFare);

module.exports = router;

