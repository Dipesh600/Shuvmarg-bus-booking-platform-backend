const Ticket = require("../../models/busScheduleModel.js");
const busOwnerScheduleManagement = require("../../src/modules/bus-owner/schedule-management");
const passengerBookingHistory = require("../../src/modules/booking/passenger-booking-history");
const passengerBookingCancellation = require("../../src/modules/booking/passenger-booking-cancellation");
const User = require("../../models/userModel.js");
const YatraPointsHistory = require("../../models/yatraPointsHistoryModel.js");
const Route = require("../../models/googleRouteModel.js");
const tripSeatAvailability = require("../../src/modules/booking/trip-seat-availability");
const SeatTemplate = require("../../models/seatTemplateModel");

const tripDiscovery = require("../../src/modules/trip-discovery");
const legacyBookingRetirement = require("../../src/modules/booking/legacy-booking-retirement");



// Get My YatraPoints History
const getMyYatraHistory = async (req, res) => {
  try {
    const userId = req.userInfo.id;

    const history = await YatraPointsHistory.find({ userId })
      .sort({ createdAt: -1 })
      .limit(200);

    return res.status(200).json({
      status: true,
      message: "Successfully fetched YatraPoints history",
      data: history,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error",
    });
  }
};



// search ticket
const searchTickets = async (req, res) => {
  return res.status(410).json({
    status: false,
    message: "Bus Schedule APIs are deprecated. Please use the Fleet Trip APIs (/api/public/searchTrips).",
  });
};


const searchTrips = tripDiscovery.searchTrips;

const createSeats = async (req, res) => {
  return res.status(410).json({
    status: false,
    message: "Manual seat creation is deprecated. Seats are now automatically created from templates when a Trip is generated.",
  });
};

// Get Seats by id
const getSeatsById = tripSeatAvailability.getTripSeatAvailability;

const bookTicket = legacyBookingRetirement.retireLegacyBookingFlow;

// Cancel Ticket
const cancelTicket = passengerBookingCancellation.cancelPassengerBooking;

// Cancel Estimate — preview refund breakdown without executing cancellation
const cancelEstimate = passengerBookingCancellation.estimatePassengerBookingCancellation;

const getMyTicketHistory = passengerBookingHistory.getPassengerBookingHistory;

// Validate YatraPoints for discount
const validateYatraPoints = async (req, res) => {
  try {
    const { yatrapointsToUse, scheduleId, seatNumbers } = req.body;
    const userId = req.userInfo.id;

    if (
      !yatrapointsToUse ||
      !scheduleId ||
      !seatNumbers ||
      seatNumbers.length === 0
    ) {
      return res.status(400).json({
        status: false,
        message: "yatrapointsToUse, scheduleId, and seatNumbers are required",
      });
    }

    // Validate input
    if (yatrapointsToUse < 0) {
      return res.status(400).json({
        status: false,
        message: "Invalid yatrapoints amount",
      });
    }

    // Get schedule details and validate
    const schedule = await Ticket.findById(scheduleId);
    if (!schedule) {
      return res.status(404).json({
        status: false,
        message: "Schedule not found",
      });
    }

    // Calculate total amount from schedule price and number of seats
    const totalAmount = schedule.price * seatNumbers.length;

    // Get user's current yatrapoints
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    const userYatraPoints = user.yatrapoints || 0;

    // Check if user has enough points
    if (yatrapointsToUse > userYatraPoints) {
      return res.status(400).json({
        status: false,
        message: `Insufficient yatrapoints! You only have ${userYatraPoints} points available, but trying to use ${yatrapointsToUse} points.`,
        errorCode: "INSUFFICIENT_YATRAPOINTS",
        data: {
          requestedPoints: yatrapointsToUse,
          availablePoints: userYatraPoints,
          shortfall: yatrapointsToUse - userYatraPoints,
          maxDiscountPossible:
            Math.round((userYatraPoints / 100) * 1 * 100) / 100, // Max % discount possible
          suggestion:
            userYatraPoints > 0
              ? `You can use up to ${userYatraPoints} points for ${Math.round((userYatraPoints / 100) * 1 * 100) / 100
              }% discount`
              : "You need to earn more yatrapoints to get discounts",
        },
      });
    }

    // Calculate discount: 100 points = 1% discount
    const discountPercentage = (yatrapointsToUse / 100) * 1; // 1% per 100 points
    const discountAmount = (totalAmount * discountPercentage) / 100;

    // Ensure discount doesn't exceed the total amount
    const finalDiscountAmount = Math.min(discountAmount, totalAmount);
    const finalAmount = totalAmount - finalDiscountAmount;

    // Round to 2 decimal places
    const roundedDiscountAmount = Math.round(finalDiscountAmount * 100) / 100;
    const roundedFinalAmount = Math.round(finalAmount * 100) / 100;

    return res.status(200).json({
      status: true,
      message: "YatraPoints validation successful",
      data: {
        // originalAmount: totalAmount,
        finalAmount: roundedFinalAmount,

        // scheduleId,
        // scheduleDetails: {
        //   from: schedule.route.from,
        //   to: schedule.route.to,
        //   date: schedule.date,
        //   departureTime: schedule.departureTime,
        //   busName: schedule.bussName,
        //   operatorName: schedule.operatorName,
        // },
        // seatNumbers: seatNumbers,
        // pricePerSeat: schedule.price,
        // totalSeats: seatNumbers.length,
        // yatrapointsUsed: yatrapointsToUse,
        // discountPercentage: Math.round(discountPercentage * 100) / 100,
        // discountAmount: roundedDiscountAmount,
        // finalAmount: roundedFinalAmount,
        // userYatraPoints: userYatraPoints,
        // remainingPoints: userYatraPoints - yatrapointsToUse,
      },
    });
  } catch (error) {
    console.error("Validate YatraPoints Error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

/**
 * Escape special regex characters in user-supplied strings.
 * Never pass raw user input directly into RegExp — this prevents ReDoS attacks.
 */
function _esc(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Add `offsetMins` minutes to a base "HH:MM" time string.
 * Handles midnight roll-over (e.g., 23:00 + 90 mins = 00:30).
 *
 * @param {string} baseTime  - "HH:MM" trip departure time
 * @param {number|undefined} offsetMins - minutes from origin to this stop
 * @returns {string} - adjusted "HH:MM" time, or baseTime if offset is null/undefined
 */
function _resolveStopTime(baseTime, offsetMins) {
  // No offset data → fall back to the raw trip time (legacy routes, terminal stops)
  if (offsetMins === null || offsetMins === undefined || !baseTime) return baseTime;
  if (offsetMins === 0) return baseTime;

  const [hours, minutes] = baseTime.split(":").map(Number);
  const totalMins = hours * 60 + minutes + offsetMins;
  const h = Math.floor(totalMins / 60) % 24;
  const m = totalMins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const createTicket = busOwnerScheduleManagement.createSchedule;
const updateTicket = busOwnerScheduleManagement.updateSchedule;
const deleteTicket = busOwnerScheduleManagement.deleteSchedule;
const getTicketById = busOwnerScheduleManagement.getScheduleById;

module.exports = {
  createTicket,
  createSeats,
  updateTicket,
  deleteTicket,
  getTicketById,
  searchTickets,
  bookTicket,
  getSeatsById,
  getMyTicketHistory,
  validateYatraPoints,
  getMyYatraHistory,
  cancelTicket,
  cancelEstimate,
  searchTrips
};
