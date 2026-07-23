const Ticket = require("../../models/busScheduleModel.js");
const Seat = require("../../models/seatsModel.js");
const busOwnerScheduleManagement = require("../../src/modules/bus-owner/schedule-management");
const Booking = require("../../models/bookTicketModel.js");
const Review = require("../../models/reviewModel.js");
const { v4: uuidv4 } = require("uuid");
const User = require("../../models/userModel.js");
const UserDeviceInfo = require("../../models/userDeviceInfoModel.js");
const Coupon = require("../../models/couponModel.js");
const UserCouponUsage = require("../../models/userCouponUsageModel.js");
const sendSMS = require("../../handlers/sparro-otp.js");
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

const SeatHold = require("../../models/seatHoldModel.js");
const SeatTemplate = require("../../models/seatTemplateModel");
const { getPresignedUrl } = require("../../services/s3Service.js");

const tripDiscovery = require("../../src/modules/trip-discovery");



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
const getSeatsById = async (req, res) => {
  try {
    const { tripId } = req.body;

    if (!tripId) {
      return res.status(400).json({
        status: false,
        message: "Please Provide Trip Id!",
      });
    }

    const seats = await Seat.findOne({ tripId: tripId }).lean();
    if (!seats) {
      return res.status(404).json({
        status: false,
        message: "Seats Not Found!",
      });
    }

    let seatConfig = null;
    const trip = await Trip.findById(tripId).populate("seatTemplateId busId");
    if (trip) {
      if (trip.seatTemplateId && trip.seatTemplateId.seatConfig) {
        seatConfig = trip.seatTemplateId.seatConfig;
      } else if (trip.busId && trip.busId.seatConfig) {
        seatConfig = trip.busId.seatConfig;
      }
    }

    // [NEW] Soft Locking: Mask actively held seats as booked
    const currentUserId = req.userInfo ? req.userInfo.id : null;
    const activeHolds = await SeatHold.find({
      tripId: tripId,
      expiresAt: { $gt: new Date() },
      ...(currentUserId ? { userId: { $ne: currentUserId } } : {}) // Don't mask holds belonging to the requesting user
    });

    if (activeHolds.length > 0) {
      let heldSeatsSet = new Set();
      activeHolds.forEach(hold => hold.seatNumbers.forEach(s => heldSeatsSet.add(s.toLowerCase())));

      // Override booked status for held seats
      const maskSeats = (seatArray) => {
        if (!seatArray) return;
        seatArray.forEach(seat => {
          if (!seat.booked && heldSeatsSet.has(seat.seatNo.toLowerCase())) {
            seat.booked = true; // Mask as booked for the UI
            seat.blockedFor = "reserved"; // Optional flag so UI could style it differently if needed
          }
        });
      };

      maskSeats(seats.seata);
      maskSeats(seats.seatb);
      maskSeats(seats.seatc);
    }

    return res.status(200).json({
      status: true,
      message: "Successfully fetched seats!",
      data: {
        ...seats,
        seatConfig: seatConfig
      },
    });
  } catch (e) {
    return res.status(500).json({
      status: true,
      message: "Internal Server Error!",
    });
  }
};

// Book Ticket
const bookTicket = async (req, res) => {
  try {
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ status: false, message: "your body is empty please add" });
    }
    const {
      tripId,
      seatNumbers,
      gateway,
      transactionId,
      fromStopId,  // optional — sent by app when user searched via stop registry
      toStopId,    // optional — sent by app when user searched via stop registry
    } = req.body;
    const effectiveTripId = tripId;
    const userId = req.userInfo.id;

    if (
      !effectiveTripId ||
      !seatNumbers ||
      seatNumbers.length === 0 ||
      !gateway ||
      !transactionId
    ) {
      return res
        .status(400)
        .json({ status: false, message: "Missing required fields." });
    }

    const normalizedSeats = seatNumbers.map((seat) => seat.toLowerCase());

    // Fetch Trip details
    const trip = await Trip.findById(effectiveTripId)
      .populate("routeId")
      .populate({
        path: "scheduleId",
        select: "operatorRouteConfigId",
        populate: {
          path: "operatorRouteConfigId",
          select: "timingConfig returnTimingConfig minimumJourneyMinutes",
        }
      });
    if (!trip) {
      return res.status(404).json({ status: false, message: "Trip not found!" });
    }

    // ── Defense-in-depth: Minimum Journey Validation ─────────────────────────
    // This is the SECOND enforcement layer (search-level gates are first).
    // Runs only when the client supplies fromStopId and toStopId.
    // Protects against direct API calls that skip the search UI.
    if (fromStopId && toStopId) {
      const operatorCfg    = trip.scheduleId?.operatorRouteConfigId;
      const isReturn        = trip.variantId?.direction === "RETURN";
      const bookingTimingArr = operatorCfg
        ? (isReturn ? (operatorCfg.returnTimingConfig || operatorCfg.timingConfig) : operatorCfg.timingConfig)
        : [];

      if (bookingTimingArr.length > 0) {
        const fromTc = bookingTimingArr.find(tc => tc.stopId?.toString() === fromStopId);
        const toTc   = bookingTimingArr.find(tc => tc.stopId?.toString() === toStopId);

        // Gate 3-B: stopBehavior
        if (fromTc && !["BOARDING_ONLY", "BOTH"].includes(fromTc.stopBehavior)) {
          return res.status(400).json({ status: false, message: "Boarding is not permitted at the selected origin stop." });
        }
        if (toTc && !["DROPPING_ONLY", "BOTH"].includes(toTc.stopBehavior)) {
          return res.status(400).json({ status: false, message: "Dropping is not permitted at the selected destination stop." });
        }

        // Gate 2-B: Minimum journey minutes
        const minMins = operatorCfg?.minimumJourneyMinutes ?? 60;
        if (minMins > 0 && fromTc?.estimatedDeparture && toTc?.estimatedArrival) {
          const depM   = _timeToMins(fromTc.estimatedDeparture);
          const arrM   = _timeToMins(toTc.estimatedArrival);
          const fDay   = fromTc.dayOffset || 0;
          const tDay   = toTc.dayOffset   || 0;
          const travelMins = (arrM + tDay * 1440) - (depM + fDay * 1440);
          if (travelMins < minMins) {
            return res.status(400).json({
              status: false,
              message: `This service requires a minimum journey of ${minMins} minutes. Please select stops that are further apart.`,
            });
          }
        }
      }
    }

    // Determine price: Use tripFare if not null, otherwise use route basePrice
    const tripPrice = trip.tripFare !== null ? trip.tripFare : trip.routeId?.basePrice ?? 0;
    const totalAmount = tripPrice * seatNumbers.length;
    const baseFare = tripPrice;


    const seatDoc = await Seat.findOne({ tripId: effectiveTripId });

    if (!seatDoc) {
      return res
        .status(404)
        .json({ status: false, message: "Seat data not found for trip." });
    }

    if (!userId) {
      return res
        .status(400)
        .json({ status: false, message: "User Id is required!" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ status: false, message: "User not found!" });
    }

    const allSeats = [...seatDoc.seata, ...seatDoc.seatb, ...seatDoc.seatc];

    const alreadyBookedSeats = [];
    const invalidSeats = [];

    normalizedSeats.forEach((seatNo) => {
      const seat = allSeats.find((s) => s.seatNo === seatNo);
      if (!seat) {
        invalidSeats.push(seatNo.toUpperCase());
      } else if (seat.booked) {
        alreadyBookedSeats.push(seatNo.toUpperCase());
      }
    });

    if (invalidSeats.length > 0) {
      return res.status(400).json({
        status: false,
        message: `Invalid seat(s): ${invalidSeats.join(", ")}`,
      });
    }

    if (alreadyBookedSeats.length > 0) {
      return res.status(400).json({
        status: false,
        message: `Seat ${alreadyBookedSeats.join(", ")} is already booked!`,
      });
    }

    normalizedSeats.forEach((seat) => {
      let seatKey = null;
      if (seatDoc.seata.some((s) => s.seatNo.toLowerCase() === seat.toLowerCase())) {
        seatKey = "seata";
      } else if (seatDoc.seatb.some((s) => s.seatNo.toLowerCase() === seat.toLowerCase())) {
        seatKey = "seatb";
      } else if (seatDoc.seatc.some((s) => s.seatNo.toLowerCase() === seat.toLowerCase())) {
        seatKey = "seatc";
      }
      if (seatKey) {
        const seatObj = seatDoc[seatKey].find((s) => s.seatNo.toLowerCase() === seat.toLowerCase());
        if (seatObj) {
          seatObj.booked = true;
          seatObj.bookedBy = userId;
          seatObj.bookedAt = new Date();
        }
      }
    });

    await seatDoc.save();

    const generateTicketId = () => {
      const date = new Date();
      const dateStr = date.toISOString().split("T")[0].replace(/-/g, "");
      const randomNum = Math.floor(1000 + Math.random() * 90000);
      return `TKT-${dateStr}-${randomNum}`;
    };

    const ticketId = generateTicketId();

    // Check if a coupon code was provided
    let couponData = null;
    let originalAmount = totalAmount;
    let finalAmount = totalAmount;
    let discountAmount = 0;

    // If coupon code was provided in the request
    if (req.body.couponCode && req.body.couponCode.trim() !== "") {
      try {
        const code = req.body.couponCode.trim().toUpperCase();
        const coupon = await Coupon.findOne({ couponCode: code });
        if (!coupon) {
          return res.status(400).json({
            status: false,
            errorCode: "COUPON_NOT_FOUND",
            message: "Invalid coupon code",
          });
        }
        if (!coupon.isActive) {
          return res.status(400).json({
            status: false,
            errorCode: "COUPON_INACTIVE",
            message: "Coupon is disabled",
          });
        }
        const now = new Date();
        if (now < coupon.validFrom) {
          return res.status(400).json({
            status: false,
            errorCode: "COUPON_NOT_ACTIVE_YET",
            message: `Coupon isn't active yet. Starts on ${coupon.validFrom.toISOString().slice(0, 10)}`,
          });
        }
        if (now > coupon.validTo) {
          return res.status(400).json({
            status: false,
            errorCode: "COUPON_EXPIRED",
            message: "Coupon expired. You can't use it.",
          });
        }
        if (
          coupon.totalUsageLimit !== null &&
          typeof coupon.totalUsageLimit === "number" &&
          coupon.usedCount >= coupon.totalUsageLimit
        ) {
          return res.status(400).json({
            status: false,
            errorCode: "COUPON_USAGE_LIMIT_REACHED",
            message: "Coupon usage limit reached",
          });
        }
        // Multi-role coupon eligibility: check user's roles array (not just primary role)
        const userRoles = req.dbUser?.roles || [req.userInfo.role];
        const isCouponEligible = coupon.applicableUserTypes.some(
          (type) => userRoles.includes(type)
        );
        if (
          Array.isArray(coupon.applicableUserTypes) &&
          coupon.applicableUserTypes.length > 0 &&
          !isCouponEligible
        ) {
          return res.status(400).json({
            status: false,
            errorCode: "COUPON_NOT_APPLICABLE_FOR_USER",
            message: "Coupon is not applicable for your user type",
          });
        }
        if (
          Array.isArray(coupon.applicableRoutes) &&
          coupon.applicableRoutes.length > 0 &&
          !coupon.applicableRoutes.some((r) => String(r) === String(effectiveTripId))
        ) {
          return res.status(400).json({
            status: false,
            errorCode: "COUPON_NOT_APPLICABLE_FOR_ROUTE",
            message: "Coupon is not applicable for this route",
          });
        }
        if (
          Array.isArray(coupon.excludedRoutes) &&
          coupon.excludedRoutes.some((r) => String(r) === String(effectiveTripId))
        ) {
          return res.status(400).json({
            status: false,
            errorCode: "COUPON_EXCLUDED_FOR_ROUTE",
            message: "Coupon cannot be used for this route",
          });
        }
        if (
          typeof coupon.minOrderAmount === "number" &&
          totalAmount < coupon.minOrderAmount
        ) {
          return res.status(400).json({
            status: false,
            errorCode: "COUPON_MIN_ORDER_NOT_MET",
            message: `Order must be at least ₹${coupon.minOrderAmount} to use this coupon`,
          });
        }

        const userUsageCount = await UserCouponUsage.getUserCouponUsageCount(
          userId,
          coupon._id
        );
        if (userUsageCount >= coupon.perUserLimit) {
          return res.status(400).json({
            status: false,
            errorCode: "COUPON_PER_USER_LIMIT_REACHED",
            message: "You have already used this coupon",
          });
        }

        discountAmount = coupon.calculateDiscount(totalAmount);
        discountAmount = Math.round(discountAmount * 100) / 100;
        finalAmount = totalAmount - discountAmount;

        couponData = {
          couponId: coupon._id,
          couponCode: coupon.couponCode,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
        };
      } catch (error) {
        console.error("Error processing coupon:", error);
        return res.status(500).json({
          status: false,
          message: "Error validating coupon",
        });
      }
    }

    // Handle YatraPoints discount if provided
    let yatraPointsUsed = 0;
    let yatraPointsDiscount = 0;

    if (req.body.yatrapointsToUse && req.body.yatrapointsToUse > 0) {
      try {
        const yatraPointsToUse = parseInt(req.body.yatrapointsToUse);

        // Check if user has enough points
        if (yatraPointsToUse <= user.yatrapoints) {
          // Calculate discount: 100 points = 1% discount
          const discountPercentage = (yatraPointsToUse / 100) * 1;
          yatraPointsDiscount = (finalAmount * discountPercentage) / 100;

          // Ensure discount doesn't exceed the final amount
          yatraPointsDiscount = Math.min(yatraPointsDiscount, finalAmount);
          yatraPointsDiscount = Math.round(yatraPointsDiscount * 100) / 100;

          // Update final amount
          finalAmount = finalAmount - yatraPointsDiscount;
          yatraPointsUsed = yatraPointsToUse;

          // Deduct points from user's account
          console.log(
            `Before deduction - User ${userId} has ${user.yatrapoints} points`
          );

          const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $inc: { yatrapoints: -yatraPointsUsed } },
            { new: true }
          );

          // Record YatraPoints redeem history
          try {
            await YatraPointsHistory.create({
              userId,
              type: "redeem",
              points: yatraPointsUsed,
              balanceBefore: user.yatrapoints,
              balanceAfter: updatedUser.yatrapoints,
              tripId: effectiveTripId,
              description: `Redeemed ${yatraPointsUsed} points for discount`,
              meta: { discountAmount: yatraPointsDiscount },
            });
          } catch (histErr) {
            console.error(
              "Failed to record YatraPoints redeem history:",
              histErr
            );
          }

          console.log(
            `User ${userId} used ${yatraPointsUsed} yatrapoints for ₹${yatraPointsDiscount} discount. Remaining points: ${updatedUser.yatrapoints}`
          );
        } else {
          return res.status(400).json({
            status: false,
            message: `Insufficient yatrapoints. You have ${user.yatrapoints} points available`,
          });
        }
      } catch (error) {
        console.error("Error processing yatrapoints:", error);
        return res.status(500).json({
          status: false,
          message: "Error processing yatrapoints. Please try again.",
        });
      }
    }

    // Create the booking with coupon and yatrapoints information
    const booking = await Booking.create({
      userId,
      tripId: effectiveTripId,
      seats: normalizedSeats,
      originalAmount: originalAmount,
      discountAmount: discountAmount + yatraPointsDiscount, // Total discount from both coupon and yatrapoints
      totalAmount: finalAmount,
      couponCode: couponData ? couponData.couponCode : null,
      couponUsed: couponData ? couponData.couponId : null,
      yatraPointsUsed: yatraPointsUsed,
      yatraPointsDiscount: yatraPointsDiscount,
      ticketId,
    });

    // Create a transaction record
    try {
      await Transaction.create({
        userId,
        bookingId: booking._id,
        ticketId,
        transactionType: "BOOKING",
        gateway,
        transactionId,
        originalAmount: baseFare,
        totalAmount: finalAmount,
        status: "SUCCESS",
        paidAt: new Date(),
      });
    } catch (transErr) {
      console.error("Failed to create transaction record:", transErr);
      // We don't fail the booking if transaction logging fails, but it's important to log it.
    }

    // Link the latest redeem history (if any) to this booking
    if (yatraPointsUsed > 0) {
      try {
        await YatraPointsHistory.findOneAndUpdate(
          { userId, type: "redeem", tripId: effectiveTripId, bookingId: null },
          { $set: { bookingId: booking._id, ticketId } },
          { sort: { createdAt: -1 } }
        );
      } catch (linkErr) {
        console.error("Failed to link redeem history to booking:", linkErr);
      }
    }

    // Record coupon usage if a coupon was used
    if (couponData) {
      try {
        // Create usage record
        await UserCouponUsage.create({
          userId,
          couponId: couponData.couponId,
          couponCode: couponData.couponCode,
          bookingId: booking._id,
          ticketId,
          originalAmount,
          discountAmount,
          finalAmount,
          status: "active",
        });

        // Increment coupon's usage count
        await Coupon.findByIdAndUpdate(couponData.couponId, {
          $inc: { usedCount: 1 },
        });

        console.log(
          `Coupon ${couponData.couponCode} usage recorded for booking ${booking._id}`
        );
      } catch (error) {
        console.error("Error recording coupon usage:", error);
        // Don't fail the booking if coupon recording fails
      }
    }

    const rewardPoint = finalAmount * 0.1; // Calculate reward points on final amount after discount

    const userAfterEarn = await User.findByIdAndUpdate(
      userId,
      { $inc: { yatrapoints: rewardPoint } },
      { new: true }
    );
    // Record YatraPoints earn history
    try {
      await YatraPointsHistory.create({
        userId,
        type: "earn",
        points: rewardPoint,
        balanceBefore: userAfterEarn.yatrapoints - rewardPoint,
        balanceAfter: userAfterEarn.yatrapoints,
        bookingId: booking._id,
        tripId: effectiveTripId,
        ticketId,
        description: `Earned ${rewardPoint} points for booking`,
        meta: {
          originalAmount,
          finalAmount,
          seats: normalizedSeats,
        },
      });
    } catch (histErr) {
      console.error("Failed to record YatraPoints earn history:", histErr);
    }

    // Fetch trip details for notifications and SMS
    const tripDetails = await Trip.findById(effectiveTripId).populate("routeId");

    // Create route information for notifications
    const routeInfo = tripDetails && tripDetails.routeId
      ? `${tripDetails.routeId.from} to ${tripDetails.routeId.to}`
      : "Route information not available";

    await createLocalNotification(
      userId,
      "BOOKING_CONFIRMED",
      "Ticket Booked Successfully",
      `Your ticket (${ticketId}) for ${routeInfo} has been booked.`,
      { effectiveTripId, seats: normalizedSeats, totalAmount, route: routeInfo }
    );

    const userDevices = await UserDeviceInfo.find({ userId });
    const tokens = userDevices.map((device) => device.token).filter(Boolean);
    // Send push notification if tokens exist
    if (tokens.length > 0) {
      await notificationManager(
        tokens,
        "Ticket Booked Successfully",
        `Your ticket (${ticketId}) for ${routeInfo} has been booked.`
      );
    }

    // Format seats for better readability
    const formattedSeats = normalizedSeats
      .map((seat) => seat.toUpperCase())
      .join(", ");

    // Send SMS notification with ticket details
    if (req.userInfo.phone) {
      try {
        // Format the SMS message with all required details
        const smsMessage = `
Hello ${req.userInfo.name},

Your ticket has been booked successfully!
Ticket ID: ${ticketId}
Route: ${tripDetails.routeId.from} to ${tripDetails.routeId.to}
Date: ${tripDetails.tripDate}
Time: ${tripDetails.departureTime}
Seats: ${formattedSeats}
${discountAmount > 0 ? `Discount: ₹${discountAmount}` : ""}
Amount: ₹${finalAmount}

Thank you for booking with us!
        `.trim();

        // Send the SMS
        await sendSMS(req.userInfo.phone, smsMessage);
        console.log(
          `SMS notification sent to ${req.userInfo.phone} for ticket ${ticketId}`
        );
      } catch (smsError) {
        console.error("Error sending SMS notification:", smsError);
        // Don't fail the booking if SMS sending fails
      }
    }

    res.status(201).json({
      status: true,
      message: "Ticket booked successfully!",
      ticketId,
      data: {
        originalAmount,
        couponDiscount: discountAmount,
        yatraPointsDiscount: yatraPointsDiscount,
        totalDiscount: discountAmount + yatraPointsDiscount,
        finalAmount,
        couponUsed: couponData ? couponData.couponCode : null,
        yatraPointsUsed: yatraPointsUsed,
        yatrapointsEarned: Math.round(rewardPoint),
        currentYatraPoints: userAfterEarn?.yatrapoints,
        seats: normalizedSeats,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: false, message: "Internal Server Error" });
  }
};

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

/**
 * Convert a time string to total minutes since midnight.
 * Handles BOTH formats found in the DB:
 *   "05:20 PM"  → 1040 mins  (12-hour AM/PM — written by admin portal)
 *   "17:20"     → 1040 mins  (24-hour — standard HH:MM)
 * Returns 0 for null/invalid inputs.
 */
function _timeToMins(time) {
  if (!time || typeof time !== "string") return 0;
  const t = time.trim().toUpperCase();

  // 12-hour format: "05:20 PM" / "12:00 AM"
  const match12 = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (match12) {
    let h = parseInt(match12[1], 10);
    const m = parseInt(match12[2], 10);
    const period = match12[3];
    if (period === "AM") {
      if (h === 12) h = 0;       // 12:xx AM → 00:xx
    } else {
      if (h !== 12) h += 12;    // x:xx PM → (x+12):xx, but 12:xx PM stays 12
    }
    return h * 60 + m;
  }

  // 24-hour format: "17:20"
  const match24 = t.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    return parseInt(match24[1], 10) * 60 + parseInt(match24[2], 10);
  }

  return 0; // unparseable — treated as midnight
}

// Compatibility aliases — implementation now lives in the schedule-management module.
// Any existing import of these names from this file continues to resolve correctly.
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
