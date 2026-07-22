const express = require("express");
const router = express.Router();
const ticket = require("../../controllers/ticketController/ticketController.js");
const paymentBooking = require("../../controllers/ticketController/paymentBookingController.js");
const role = require("../../middleware/checkRole.js");
const auth = require("../../middleware/authMiddleware.js");
const verifyRoleFromDB = require("../../middleware/verifyRoleFromDB.js");
const requireApprovedBusOwner = require("../../middleware/requireApprovedBusOwner.js");
const passengerSeatHold = require("../../src/modules/booking/passenger-seat-hold");
const bookingVerification = require("../../src/modules/booking/booking-verification");

const busOwnerGuard = [auth, verifyRoleFromDB, role.busOwnerMiddleware, requireApprovedBusOwner];
const passengerBookingGuard = [auth, verifyRoleFromDB, role.requireRole("passenger")];

const retireLegacyBookingFlow = (req, res) =>
  res.status(410).json({
    success: false,
    message: "This booking endpoint has been retired. Use the prepare and confirm booking flow.",
    errorCode: "LEGACY_BOOKING_FLOW_RETIRED",
  });

router.post("/createTicket", busOwnerGuard, ticket.createTicket);
router.post("/creatSeats", busOwnerGuard, ticket.createSeats);
router.patch("/updateTicket", busOwnerGuard, ticket.updateTicket);
router.delete("/deleteTicket", busOwnerGuard, ticket.deleteTicket);
router.post("/getTicketById", busOwnerGuard, ticket.getTicketById);

// Book Ticket (Retired - 410 Gone)
router.post("/bookTicket", ...passengerBookingGuard, retireLegacyBookingFlow);

// Payment Gateway Booking Flow
router.post("/prepareBooking", ...passengerBookingGuard, paymentBooking.prepareBooking);
router.post(
  "/confirmBooking",
  ...passengerBookingGuard,
  passengerSeatHold.requireOwnedActivePassengerSeatHold,
  paymentBooking.confirmBooking
);
router.get("/verifyBooking/:ticketId", ...passengerBookingGuard, bookingVerification.verifyBooking);

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