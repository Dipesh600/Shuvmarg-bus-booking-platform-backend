const express = require("express");
const router = express.Router();
const role = require("../../middleware/checkRole.js");
const auth = require("../../middleware/authMiddleware.js");
const verifyRoleFromDB = require("../../middleware/verifyRoleFromDB.js");
const requireApprovedBusOwner = require("../../middleware/requireApprovedBusOwner.js");
const passengerSeatHold = require("../../src/modules/booking/passenger-seat-hold");
const bookingVerification = require("../../src/modules/booking/booking-verification");
const busOwnerScheduleManagement = require("../../src/modules/bus-owner/schedule-management");
const tripSeatAvailability = require("../../src/modules/booking/trip-seat-availability");
const passengerBookingHistory = require("../../src/modules/booking/passenger-booking-history");
const {
  preparePassengerBooking,
} = require("../../src/modules/booking/passenger-booking-preparation");
const {
  confirmPassengerBooking,
} = require("../../src/modules/booking/passenger-booking-confirmation-orchestrator");

const busOwnerGuard = [auth, verifyRoleFromDB, role.busOwnerMiddleware, requireApprovedBusOwner];
const passengerBookingGuard = [auth, verifyRoleFromDB, role.requireRole("passenger")];



router.post("/createTicket", busOwnerGuard, busOwnerScheduleManagement.createSchedule);
router.patch("/updateTicket", busOwnerGuard, busOwnerScheduleManagement.updateSchedule);
router.delete("/deleteTicket", busOwnerGuard, busOwnerScheduleManagement.deleteSchedule);
router.post("/getTicketById", busOwnerGuard, busOwnerScheduleManagement.getScheduleById);

// Payment Gateway Booking Flow
router.post("/prepareBooking", ...passengerBookingGuard, preparePassengerBooking);
router.post(
  "/confirmBooking",
  ...passengerBookingGuard,
  passengerSeatHold.requireOwnedActivePassengerSeatHold,
  confirmPassengerBooking
);
router.get("/verifyBooking/:ticketId", ...passengerBookingGuard, bookingVerification.verifyBooking);

// Get Seats
router.post("/getSeats", auth, tripSeatAvailability.getTripSeatAvailability);
// Get My ticket History
router.get(
  "/getMyTicketHistory",
  auth,
  passengerBookingHistory.getPassengerBookingHistory
);
const passengerBookingCancellation = require("../../src/modules/booking/passenger-booking-cancellation");

// Cancel Ticket
router.post("/cancelTicket", auth, passengerBookingCancellation.cancelPassengerBooking);
// Cancel Estimate (preview refund breakdown)
router.post("/cancelEstimate", auth, passengerBookingCancellation.estimatePassengerBookingCancellation);

module.exports = router;
