const express = require("express");
const router = express.Router();
const ticket = require("../../controllers/ticketController/ticketController.js");

// Search Trips
router.post("/searchTrips", ticket.searchTrips);

module.exports = router;
