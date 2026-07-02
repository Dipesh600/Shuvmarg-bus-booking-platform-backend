const express = require("express");
const router = express.Router();
const ticket = require("../../controllers/ticketController/ticketController.js");
const fareRuleCon = require("../../controllers/busOwnerController/fareRuleController.js");
const {
  searchStops,
  getPopularStops,
  recordStopSelection,
} = require("../../controllers/public/stopSearchController.js");

// ── Stop Autocomplete ─────────────────────────────────────────────────────────
// GET /api/public/stops/search?q=Kath&limit=8
router.get("/stops/search", searchStops);

// GET /api/public/stops/popular?limit=8
// Returns trend-ranked stops. Cached by frontend for 24 h.
router.get("/stops/popular", getPopularStops);

// POST /api/public/stops/select  { stopId }
// Fire-and-forget popularity counter. Returns 204.
router.post("/stops/select", recordStopSelection);

// Search Trips (core public API)
router.post("/searchTrips", ticket.searchTrips);

// Compute effective fare before checkout (applies surge/advance discounts)
router.post("/computeFare", fareRuleCon.computeEffectiveFare);

module.exports = router;
