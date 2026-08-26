const express = require("express");
const router = express.Router();
const role = require("../../middleware/checkRole.js");
const auth = require("../../middleware/authMiddleware.js");
const optionalAuth = require("../../middleware/optionalAuthMiddleware.js");
const verifyRoleFromDB = require("../../middleware/verifyRoleFromDB.js");
const requireApprovedBusOwner = require("../../middleware/requireApprovedBusOwner.js");
const passengerSeatHold = require("../../src/modules/booking/passenger-seat-hold");
const bookingVerification = require("../../src/modules/booking/booking-verification");
const busOwnerScheduleManagement = require("../../src/modules/bus-owner/schedule-management");
const tripSeatAvailability = require("../../src/modules/booking/trip-seat-availability");
const passengerBookingHistory = require("../../src/modules/booking/passenger-booking-history");
const passengerEsewaCheckout = require(
  "../../src/modules/booking/passenger-esewa-checkout"
);
const {
  preparePassengerBooking,
} = require("../../src/modules/booking/passenger-booking-preparation");
const {
  confirmPassengerBooking,
} = require("../../src/modules/booking/passenger-booking-confirmation-orchestrator");

const busOwnerGuard = [auth, verifyRoleFromDB, role.busOwnerMiddleware, requireApprovedBusOwner];
const passengerBookingGuard = [auth, verifyRoleFromDB, role.requireRole("passenger")];



/*
 * Bus-owner schedule management.
 *
 * The four "*Ticket" paths are misnamed: every one of them handles a Schedule,
 * not a ticket. They are kept because clients call them, but the "*Schedule"
 * aliases below are the names to use — same guards, same handlers.
 *
 * These belong under /api/busowner rather than /api/ticket. Moving them is a
 * client-visible contract change, so it is a decision of its own, not a
 * drive-by rename.
 */
router.post("/createSchedule", busOwnerGuard, busOwnerScheduleManagement.createSchedule);
router.patch("/updateSchedule", busOwnerGuard, busOwnerScheduleManagement.updateSchedule);
router.delete("/deleteSchedule", busOwnerGuard, busOwnerScheduleManagement.deleteSchedule);
router.post("/getScheduleById", busOwnerGuard, busOwnerScheduleManagement.getScheduleById);

// Deprecated aliases — prefer the "*Schedule" paths above.
router.post("/createTicket", busOwnerGuard, busOwnerScheduleManagement.createSchedule);
router.patch("/updateTicket", busOwnerGuard, busOwnerScheduleManagement.updateSchedule);
router.delete("/deleteTicket", busOwnerGuard, busOwnerScheduleManagement.deleteSchedule);
router.post("/getTicketById", busOwnerGuard, busOwnerScheduleManagement.getScheduleById);

// Payment Gateway Booking Flow
router.post("/prepareBooking", ...passengerBookingGuard, preparePassengerBooking);
router.post(
  "/esewa/initiate",
  ...passengerBookingGuard,
  passengerSeatHold.requireOwnedActivePassengerSeatHold,
  passengerEsewaCheckout.initiatePassengerEsewaCheckout
);
router.post(
  "/esewa/finalize",
  ...passengerBookingGuard,
  passengerEsewaCheckout.finalizePassengerEsewaCheckout
);
router.post(
  "/releaseBookingHold",
  ...passengerBookingGuard,
  passengerSeatHold.releasePassengerSeatHold
);
router.post(
  "/confirmBooking",
  ...passengerBookingGuard,
  passengerEsewaCheckout.requireServerOwnedEsewaCheckout,
  passengerSeatHold.requireOwnedActivePassengerSeatHold,
  confirmPassengerBooking
);
router.get("/verifyBooking/:ticketId", ...passengerBookingGuard, bookingVerification.verifyBooking);

// Get Seats
router.post("/getSeats", optionalAuth, tripSeatAvailability.getTripSeatAvailability);
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
