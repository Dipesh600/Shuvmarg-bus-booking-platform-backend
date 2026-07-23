const Ticket = require("../../models/busScheduleModel.js");
const Seat = require("../../models/seatsModel.js");
const busOwnerScheduleManagement = require("../../src/modules/bus-owner/schedule-management");
const Booking = require("../../models/bookTicketModel.js");
const Review = require("../../models/reviewModel.js");

const User = require("../../models/userModel.js");
const UserDeviceInfo = require("../../models/userDeviceInfoModel.js");

const YatraPointsHistory = require("../../models/yatraPointsHistoryModel.js");
const Route = require("../../models/googleRouteModel.js");
const {
  createLocalNotification,
  notificationManager,
} = require("../notificationController/notification_manager.js");
const Trip = require("../../models/tripModel");
const Transaction = require("../../models/transactionModel");
const Refund = require("../../models/refundModel");
const { calculateRefund } = require("../../services/refundCalculatorService");

const tripSeatAvailability = require("../../src/modules/booking/trip-seat-availability");
const SeatTemplate = require("../../models/seatTemplateModel");
const { getPresignedUrl } = require("../../services/s3Service.js");

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
const cancelTicket = async (req, res) => {
  try {
    const { ticketId, cancelReason } = req.body;
    const userId = req.userInfo.id;

    if (!ticketId) {
      return res.status(400).json({
        status: false,
        message: "ticketId is required",
      });
    }

    // Find booking by ticketId
    const booking = await Booking.findOne({ ticketId });
    if (!booking) {
      return res
        .status(404)
        .json({ status: false, message: "Booking not found" });
    }

    // Ensure the booking belongs to the requesting user
    if (booking.userId.toString() !== userId) {
      return res.status(403).json({
        status: false,
        message: "You are not authorized to cancel this booking",
      });
    }

    // Only cancel if current status is booked
    if (booking.status !== "booked") {
      return res.status(400).json({
        status: false,
        message: `Cannot cancel a booking with status '${booking.status}'`,
      });
    }

    // Fetch the trip to get departure info for refund calculation
    const trip = await Trip.findById(booking.tripId);
    if (!trip) {
      return res.status(404).json({
        status: false,
        message: "Trip details not found.",
      });
    }

    // Calculate refund using the policy engine
    const estimate = await calculateRefund({
      totalAmount: booking.totalAmount || 0,
      tripDate: trip.tripDate,
      departureTime: trip.departureTime,
    });

    if (!estimate.eligible) {
      return res.status(400).json({
        status: false,
        message: estimate.reason,
      });
    }

    // Free the seats in Seat collection
    const seatDoc = await Seat.findOne({ tripId: booking.tripId });
    if (!seatDoc) {
      return res.status(404).json({
        status: false,
        message: "Seat data not found for trip.",
      });
    }

    // Helper to free a seat from seata, seatb, or seatc
    const freeSeat = (seatNo) => {
      let seatKey = null;
      if (seatDoc.seata.some((s) => s.seatNo.toLowerCase() === seatNo.toLowerCase())) {
        seatKey = "seata";
      } else if (seatDoc.seatb.some((s) => s.seatNo.toLowerCase() === seatNo.toLowerCase())) {
        seatKey = "seatb";
      } else if (seatDoc.seatc.some((s) => s.seatNo.toLowerCase() === seatNo.toLowerCase())) {
        seatKey = "seatc";
      }
      if (seatKey) {
        const seatObj = seatDoc[seatKey]?.find((s) => s.seatNo.toLowerCase() === seatNo.toLowerCase());
        if (seatObj) {
          seatObj.booked = false;
          seatObj.bookedBy = null;
          seatObj.bookedAt = null;
        }
      }
    };

    booking.seats.forEach((s) => freeSeat(s.toLowerCase()));

    // Mark modified for nested arrays if needed
    seatDoc.markModified('seata');
    seatDoc.markModified('seatb');
    seatDoc.markModified('seatc');
    await seatDoc.save();

    // Claw back any cashback earned from this booking (Spec 2.5)
    const { clawbackCashback } = require("../../services/smLedgerService");
    try {
      const clawbackResult = await clawbackCashback(booking._id);
      if (clawbackResult.clawedBack > 0) {
        console.log(`Clawed back Rs. ${clawbackResult.clawedBack} cashback for cancelled booking ${booking._id}`);
      }
    } catch (cbErr) {
      console.error("Cashback clawback failed during cancellation:", cbErr);
      // We log but do not block the refund if clawback fails, though ideally it should be atomic.
    }

    // Create Refund record with policy-calculated amounts
    const refundMethodInput = req.body.refundMethod || "original";
    const isWalletRefund = refundMethodInput === "wallet";

    let refundStatus = "pending";
    let refundGateway = null;
    let remarks = null;
    let processedAt = null;
    let completedAt = null;

    if (isWalletRefund) {
      refundStatus = "completed";
      refundGateway = "yatra_balance";
      remarks = "Refunded instantly to Shuvmarg Money";
      processedAt = new Date();
      completedAt = new Date();

      // Process wallet credit instantly
      const { creditWallet } = require("../../services/walletService");
      try {
        await creditWallet({
          userId: userId,
          amount: estimate.refundAmount,
          purpose: "refund",
          referenceType: "refund",
          referenceId: booking._id,
          remarks: `Instant refund for cancelled ticket ${booking.ticketId}`,
        });
      } catch (walletErr) {
        console.error("Instant Yatra Balance credit failed:", walletErr);
        // Fall back to original gateway queue if wallet credit fails
        refundStatus = "pending";
        refundGateway = null;
        remarks = `Failed instant Yatra Balance refund: ${walletErr.message}. Queued for manual check.`;
        processedAt = null;
        completedAt = null;
      }
    }

    const refund = await Refund.create({
      userId: userId,
      bookingId: booking._id,
      originalAmount: estimate.refundAmount + estimate.cancellationCharge,
      cancellationCharge: estimate.cancellationCharge,
      refundAmount: estimate.refundAmount,
      status: refundStatus,
      requestedAt: new Date(),
      processedAt,
      completedAt,
      remarks,
      refundGateway,
      reason: cancelReason || "User cancelled",
    });

    // Update booking status and cancellation details
    booking.status = "cancelled";
    booking.cancellationReason = cancelReason || "User cancelled";
    booking.cancellationRequestedAt = new Date();
    booking.cancelledBy = "user";
    booking.refundId = refund._id;

    await booking.save();

    // Prepare and send notifications (local + push)
    try {
      const tripDetails = await Trip.findById(booking.tripId).populate("routeId");
      const routeInfo = tripDetails?.routeId
        ? `${tripDetails.routeId.from} to ${tripDetails.routeId.to}`
        : "Route information not available";

      await createLocalNotification(
        userId,
        "TICKET_CANCELLED",
        "Booking Cancelled",
        `Your booking (${booking.ticketId}) for ${routeInfo} has been cancelled. Refund of NPR ${estimate.refundAmount} is being processed.`,
        {
          tripId: booking.tripId,
          seats: booking.seats,
          ticketId: booking.ticketId,
          route: routeInfo,
          refundAmount: estimate.refundAmount,
        }
      );

      const userDevices = await UserDeviceInfo.find({ userId });
      const tokens = userDevices.map((device) => device.token).filter(Boolean);
      if (tokens.length > 0) {
        await notificationManager(
          tokens,
          "Booking Cancelled",
          `Your booking (${booking.ticketId}) for ${routeInfo} has been cancelled. Refund: NPR ${estimate.refundAmount}.`
        );
      }
    } catch (notifyErr) {
      console.error("Error sending cancellation notifications:", notifyErr);
    }

    return res.status(200).json({
      status: true,
      message: "Booking cancelled successfully",
      data: {
        ticketId: booking.ticketId,
        status: "cancelled",
        refundAmount: estimate.refundAmount,
        cancellationCharge: estimate.cancellationCharge,
        refundPercentage: estimate.refundPercentage,
        appliedPolicy: estimate.appliedPolicy?.name || "Default",
        seats: booking.seats,
      },
    });
  } catch (error) {
    console.error("Cancel Ticket Error:", error);
    return res
      .status(500)
      .json({ status: false, message: "Internal Server Error" });
  }
};

// Cancel Estimate — preview refund breakdown without executing cancellation
const cancelEstimate = async (req, res) => {
  try {
    const { ticketId } = req.body;
    const userId = req.userInfo.id;

    if (!ticketId) {
      return res.status(400).json({
        status: false,
        message: "ticketId is required",
      });
    }

    const booking = await Booking.findOne({ ticketId });
    if (!booking) {
      return res.status(404).json({
        status: false,
        message: "Booking not found",
      });
    }

    if (booking.userId.toString() !== userId) {
      return res.status(403).json({
        status: false,
        message: "You are not authorized to view this booking",
      });
    }

    if (booking.status !== "booked") {
      return res.status(400).json({
        status: false,
        message: `Cannot cancel a booking with status '${booking.status}'`,
      });
    }

    const trip = await Trip.findById(booking.tripId);
    if (!trip) {
      return res.status(404).json({
        status: false,
        message: "Trip details not found",
      });
    }

    const estimate = await calculateRefund({
      totalAmount: booking.totalAmount || 0,
      tripDate: trip.tripDate,
      departureTime: trip.departureTime,
    });

    return res.status(200).json({
      status: true,
      message: "Refund estimate calculated",
      data: {
        ticketId: booking.ticketId,
        ticketFare: booking.totalAmount,
        eligible: estimate.eligible,
        reason: estimate.reason,
        refundAmount: estimate.refundAmount,
        cancellationCharge: estimate.cancellationCharge,
        gatewayDeduction: estimate.gatewayDeduction,
        refundPercentage: estimate.refundPercentage,
        hoursBeforeDeparture: estimate.hoursBeforeDeparture,
        appliedPolicy: estimate.appliedPolicy,
      },
    });
  } catch (error) {
    console.error("Cancel Estimate Error:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to calculate refund estimate",
    });
  }
};

// Get My ticket history
const getMyTicketHistory = async (req, res) => {
  try {
    const userId = req.userInfo.id;

    const bookings = await Booking.find({ userId: userId })
      .populate({
        path: "tripId",
        populate: [
          {
            path: "busId",
            select:
              "busName busNumber busType vehicleType totalSeats seatLayout amenitiesId boardingPointId fleetImages",
            populate: [
              {
                path: "amenitiesId",
                select: "amenities",
              },
              {
                path: "boardingPointId",
                select: "city boardingPoints description",
              },
            ],
          },
          {
            path: "routeId",
            select: "routeName from to distance duration basePrice",
          },
        ],
      })
      .lean();

    const bookingIds = bookings.map((b) => b._id);

    const transactions = await Transaction.find({
      bookingId: { $in: bookingIds },
    })
      .select({
        bookingId: 1,
        gateway: 1,
        transactionId: 1,
        status: 1,
        totalAmount: 1,
        paidAt: 1,
      })
      .lean();
    const transactionByBookingId = new Map(
      transactions.map((t) => [String(t.bookingId), t])
    );

    const foundReviews = await Review.find({
      userId: userId,
      bookingId: { $in: bookingIds },
    })
      .select({ bookingId: 1 })
      .lean();
    const reviewedSet = new Set(foundReviews.map((r) => String(r.bookingId)));

    // Fetch refund records for all bookings (for cancelled tickets)
    const refunds = await Refund.find({
      bookingId: { $in: bookingIds },
    })
      .select({
        bookingId: 1,
        originalAmount: 1,
        cancellationCharge: 1,
        refundAmount: 1,
        status: 1,
        requestedAt: 1,
        processedAt: 1,
        completedAt: 1,
        reason: 1,
        remarks: 1,
        refundGateway: 1,
      })
      .lean();
    const refundByBookingId = new Map(
      refunds.map((r) => [String(r.bookingId), r])
    );

    const result = await Promise.all(bookings.map(async (booking) => {
      const transaction = transactionByBookingId.get(String(booking._id)) || null;
      const refund = refundByBookingId.get(String(booking._id)) || null;

      let trip = booking.tripId || null;

      if (trip && trip.busId) {
        const bus = trip.busId;
        const rawImages = bus?.fleetImages || [];
        const presignedImages = await Promise.all(
          rawImages.map((key) => getPresignedUrl(key))
        );

        trip.busId = {
          ...bus,
          fleetImages: presignedImages.filter(Boolean),
          amenitiesDetail: bus.amenitiesId || null,
          boardingPointDetail: bus.boardingPointId || null,
          amenitiesId: undefined,
          boardingPointId: undefined,
        };
      }

      if (trip) {
        // Build routeDetail — prefer populated routeId, fall back to denormalized fields
        const baseRouteDetail = trip.routeId
          ? trip.routeId
          : {
              _id: trip.variantId || null,
              routeName: trip.directionLabel || `${trip.fromStopName || "?"} → ${trip.toStopName || "?"}`,
              from: trip.fromStopName || "N/A",
              to: trip.toStopName || "N/A",
            };

        // Override with booking's actual searched route (bookedFrom/bookedTo)
        // This shows the user's actual journey (e.g., "Bardibas → Kathmandu")
        // instead of the bus's full terminal route (e.g., "Janakpur → Kathmandu")
        const routeDetail = {
          ...baseRouteDetail,
          from: booking.bookedFrom || baseRouteDetail.from,
          to:   booking.bookedTo   || baseRouteDetail.to,
        };

        trip = {
          ...trip,
          // Override times with user's stop-specific times when available
          departureTime: booking.bookedDepartureTime || trip.departureTime,
          arrivalTime:   booking.bookedArrivalTime   || trip.arrivalTime,
          routeDetail,
          routeId: undefined,
        };
      }

      return {
        booking: {
          seats: booking.seats,
          totalAmount: booking.totalAmount,
          status: booking.status,
          refundStatus: refund?.status || booking.refundStatus || "",
          refundAmount: refund?.refundAmount || booking.refundAmount || 0,
          ticketId: booking.ticketId,
          bookingId: booking._id,
          review: reviewedSet.has(String(booking._id)),
        },
        trip,
        payment: transaction
          ? {
            gateway: transaction.gateway,
            transactionId: transaction.transactionId,
            status: transaction.status,
            totalAmount: transaction.totalAmount,
            paidAt: transaction.paidAt,
          }
          : null,
        refund: refund
          ? {
            refundAmount: refund.refundAmount,
            cancellationCharge: refund.cancellationCharge,
            originalAmount: refund.originalAmount,
            status: refund.status,
            requestedAt: refund.requestedAt,
            processedAt: refund.processedAt,
            completedAt: refund.completedAt,
            reason: refund.reason,
            remarks: refund.remarks,
            refundGateway: refund.refundGateway,
          }
          : null,
      };
    }));

    return res.status(200).json({
      status: true,
      message: "Successfully fetched Booking History",
      data: result,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error",
    });
  }
};

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
