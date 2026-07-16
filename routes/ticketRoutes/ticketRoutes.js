const express = require("express");
const router = express.Router();
const ticket = require("../../controllers/ticketController/ticketController.js")
const paymentBooking = require("../../controllers/ticketController/paymentBookingController.js")
const role = require("../../middleware/checkRole.js")
const auth = require("../../middleware/authMiddleware.js")
const verifyRoleFromDB = require("../../middleware/verifyRoleFromDB.js");
const requireApprovedBusOwner = require("../../middleware/requireApprovedBusOwner.js");

const busOwnerGuard = [auth, verifyRoleFromDB, role.busOwnerMiddleware, requireApprovedBusOwner];

router.post("/createTicket", busOwnerGuard, ticket.createTicket);
router.post("/creatSeats", busOwnerGuard, ticket.createSeats);
router.patch("/updateTicket", busOwnerGuard, ticket.updateTicket);
router.delete("/deleteTicket", busOwnerGuard, ticket.deleteTicket);
router.post("/getTicketById", busOwnerGuard, ticket.getTicketById);

// Book Ticket (Original - for backend payment)
router.post("/bookTicket", auth, ticket.bookTicket);

// Payment Gateway Booking Flow (New - for frontend payment)
router.post("/prepareBooking", auth, paymentBooking.prepareBooking);
router.post("/confirmBooking", auth, paymentBooking.confirmBooking);
router.get("/verifyBooking/:ticketId", auth, paymentBooking.verifyBooking);

// Get Seats
router.post("/getSeats", auth, ticket.getSeatsById);
// Get My ticket History
router.get("/getMyTicketHistory", auth, ticket.getMyTicketHistory);
// Get My YatraPoints History
router.get("/getMyYatraHistory", auth, ticket.getMyYatraHistory);

// Validate YatraPoints for discount
router.post("/validateYatraPoints", auth, ticket.validateYatraPoints);
// Cancel Ticket
router.post("/cancelTicket", auth, ticket.cancelTicket);
// Cancel Estimate (preview refund breakdown)
router.post("/cancelEstimate", auth, ticket.cancelEstimate);

module.exports = router;