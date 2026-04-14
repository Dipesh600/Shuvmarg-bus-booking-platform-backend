const Ticket = require("../../models/busScheduleModel.js");
const Seat = require("../../models/seatsModel.js");
const Booking = require("../../models/bookTicketModel.js");
const User = require("../../models/userModel.js");
const UserDeviceInfo = require("../../models/userDeviceInfoModel.js");
const CouponHelper = require("../../handlers/couponHelper.js");
const YatraPointsHistory = require("../../models/yatraPointsHistoryModel.js");
const {
  createLocalNotification,
  notificationManager,
} = require("../notificationController/notification_manager.js");

// Step 1: Prepare booking with coupon validation (before payment)
const prepareBooking = async (req, res) => {
  try {
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ success: false, message: "your body is empty please add" });
    }
    const { scheduleId, seatNumbers, originalAmount, couponCode, yatrapointsToUse } = req.body;
    const userId = req.userInfo.id;

    // Validate required fields
    if (
      !scheduleId ||
      !seatNumbers ||
      seatNumbers.length === 0 ||
      !originalAmount
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: scheduleId, seatNumbers, originalAmount",
      });
    }

    // Check seat availability
    const normalizedSeats = seatNumbers.map((seat) => seat.toLowerCase());
    const seatDoc = await Seat.findOne({ scheduleId });

    if (!seatDoc) {
      return res.status(404).json({
        success: false,
        message: "Seat data not found for schedule.",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found!",
      });
    }

    // Validate seat availability
    const allSeats = [...seatDoc.seata, ...seatDoc.seatb];
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
        success: false,
        message: `Invalid seat(s): ${invalidSeats.join(", ")}`,
      });
    }

    if (alreadyBookedSeats.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Seat ${alreadyBookedSeats.join(", ")} is already booked!`,
      });
    }

    // Handle coupon validation if provided
    let discountAmount = 0;
    let finalAmount = originalAmount;
    let couponDetails = null;

    if (couponCode && couponCode.trim() !== "") {
      const validation = await CouponHelper.validateCoupon(
        couponCode,
        userId,
        originalAmount,
        scheduleId
      );

      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          message: validation.error,
          errorCode: validation.errorCode,
        });
      }

      discountAmount = validation.discountAmount;
      finalAmount = validation.finalAmount;
      couponDetails = {
        couponId: validation.coupon._id,
        couponCode: validation.coupon.couponCode,
        title: validation.coupon.title,
        discountType: validation.coupon.discountType,
        discountValue: validation.coupon.discountValue,
      };
    }

    // Handle YatraPoints discount if provided
    let yatraPointsUsed = 0;
    let yatraPointsDiscount = 0;

    if (yatrapointsToUse && yatrapointsToUse > 0) {
      const yatraPointsToUseInt = parseInt(yatrapointsToUse);

      // Check if user has enough points
      if (yatraPointsToUseInt <= user.yatrapoints) {
        // Calculate discount: 100 points = 1% discount
        const discountPercentage = (yatraPointsToUseInt / 100) * 1;
        yatraPointsDiscount = (finalAmount * discountPercentage) / 100;

        // Ensure discount doesn't exceed the final amount
        yatraPointsDiscount = Math.min(yatraPointsDiscount, finalAmount);
        yatraPointsDiscount = Math.round(yatraPointsDiscount * 100) / 100;

        // Update final amount
        finalAmount = finalAmount - yatraPointsDiscount;
        yatraPointsUsed = yatraPointsToUseInt;
      } else {
        return res.status(400).json({
          success: false,
          message: `Insufficient yatrapoints. You have ${user.yatrapoints} points available`,
        });
      }
    }

    // Generate a temporary booking ID for tracking
    const tempBookingId = `TEMP_${Date.now()}_${userId}`;

    // Return booking preparation details
    return res.status(200).json({
      success: true,
      message: "Booking prepared successfully. Proceed with payment.",
      data: {
        tempBookingId,
        scheduleId,
        seats: normalizedSeats,
        originalAmount,
        couponDiscount: discountAmount,
        yatraPointsDiscount: yatraPointsDiscount,
        totalDiscount: discountAmount + yatraPointsDiscount,
        finalAmount,
        couponDetails,
        yatraPointsUsed: yatraPointsUsed,
        paymentAmount: finalAmount, // Amount to charge in payment gateway
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes expiry
      },
    });
  } catch (error) {
    console.error("Error preparing booking:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};

// Step 2: Confirm booking after successful payment — ATOMIC seat lock
const confirmBooking = async (req, res) => {
  try {
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ success: false, message: "your body is empty please add" });
    }
    const {
      tempBookingId,
      paymentId,
      paymentAmount,
      gateway,
      scheduleId,       // Note: scheduleId here is tripId in the new model
      seatNumbers,
      originalAmount,
      couponCode,
      yatrapointsToUse,
      boardingPoint,    // { name, time, lat, lng } — now persisted
      droppingPoint,    // { name, time, lat, lng } — now persisted
      passengerDetails, // [{ name, age, gender, seatNo }] — DoT compliance
    } = req.body;
    const userId = req.userInfo.id;

    if (!tempBookingId || !paymentId || !paymentAmount || !gateway || !scheduleId || !seatNumbers) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields for booking confirmation",
      });
    }

    const normalizedSeats = seatNumbers.map((seat) => seat.toLowerCase());

    // ================================================================
    // 1. VERIFY TRIP STATUS — reject booking on non-scheduled trips
    // ================================================================
    const Trip = require("../../models/tripModel.js");
    const trip = await Trip.findById(scheduleId).lean();
    if (!trip) {
      return res.status(404).json({ success: false, message: "Trip not found." });
    }
    if (trip.status !== "scheduled" && trip.status !== "boarding") {
      return res.status(400).json({
        success: false,
        message: `Cannot book a seat on a trip with status: ${trip.status}`,
      });
    }

    // ================================================================
    // 2. ATOMIC SEAT LOCK — replaces the read-then-write race condition
    // Find the seat document and atomically mark all requested seats as booked
    // ONLY if they are currently NOT booked (booked: false).
    // ================================================================
    // Build arrayFilters for every requested seat
    const seatFilters = normalizedSeats.map((seatNo, i) => ({
      [`elem${i}.seatNo`]: seatNo,
      [`elem${i}.booked`]: false,  // Only match if not already booked
    }));

    // We need to update across seata, seatb, seatc arrays.
    // The safest atomic approach: try updating each array.
    // We'll iterate per-seat with individual findOneAndUpdate for atomicity.
    const seatDoc = await Seat.findOne({ tripId: scheduleId });
    if (!seatDoc) {
      return res.status(404).json({ success: false, message: "Seat data not found for this trip." });
    }

    const alreadyBookedSeats = [];
    const invalidSeats = [];

    for (const seatNo of normalizedSeats) {
      const rowPrefix = seatNo.charAt(0);
      const arrayField = `seat${rowPrefix}`;   // seata, seatb, or seatc

      // Attempt atomic update: only succeeds if the seat exists AND booked: false
      const updated = await Seat.findOneAndUpdate(
        {
          tripId: scheduleId,
          [arrayField]: { $elemMatch: { seatNo: seatNo, booked: false } }
        },
        {
          $set: {
            [`${arrayField}.$[elem].booked`]:    true,
            [`${arrayField}.$[elem].bookedBy`]:  userId,
            [`${arrayField}.$[elem].bookedAt`]:  new Date(),
          }
        },
        {
          arrayFilters: [{ "elem.seatNo": seatNo, "elem.booked": false }],
          new: true,
        }
      );

      if (!updated) {
        // Check if the seat exists at all
        const rawDoc = await Seat.findOne({ tripId: scheduleId });
        const allSeats = [...(rawDoc?.seata || []), ...(rawDoc?.seatb || []), ...(rawDoc?.seatc || [])];
        const seatExists = allSeats.some(s => s.seatNo === seatNo);

        if (!seatExists) {
          invalidSeats.push(seatNo.toUpperCase());
        } else {
          alreadyBookedSeats.push(seatNo.toUpperCase());
        }
      }
    }

    // If any seat failed to lock, ROLLBACK all successfully locked seats
    if (invalidSeats.length > 0 || alreadyBookedSeats.length > 0) {
      // Rollback: release any seats that were successfully locked
      for (const seatNo of normalizedSeats) {
        const rowPrefix = seatNo.charAt(0);
        const arrayField = `seat${rowPrefix}`;
        await Seat.findOneAndUpdate(
          { tripId: scheduleId, [arrayField]: { $elemMatch: { seatNo, bookedBy: userId } } },
          { $set: { [`${arrayField}.$[elem].booked`]: false, [`${arrayField}.$[elem].bookedBy`]: null, [`${arrayField}.$[elem].bookedAt`]: null } },
          { arrayFilters: [{ "elem.seatNo": seatNo, "elem.bookedBy": userId }] }
        );
      }

      const messages = [];
      if (invalidSeats.length > 0) messages.push(`Invalid seat(s): ${invalidSeats.join(", ")}`);
      if (alreadyBookedSeats.length > 0) messages.push(`Already booked: ${alreadyBookedSeats.join(", ")} — taken during payment.`);

      return res.status(409).json({
        success: false,
        message: messages.join(" | "),
        errorCode: "SEATS_NO_LONGER_AVAILABLE",
      });
    }

    // ================================================================
    // 3. AMOUNT VERIFICATION
    // ================================================================
    let discountAmount = 0;
    let finalAmount = originalAmount;
    let couponUsed = null;
    let appliedCouponCode = null;

    if (couponCode && couponCode.trim() !== "") {
      const validation = await CouponHelper.validateCoupon(couponCode, userId, originalAmount, scheduleId);
      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          message: `Coupon validation failed: ${validation.error}`,
          errorCode: "COUPON_INVALID_DURING_CONFIRMATION",
        });
      }
      discountAmount = validation.discountAmount;
      finalAmount = validation.finalAmount;
      couponUsed = validation.coupon._id;
      appliedCouponCode = validation.coupon.couponCode;
    }

    let yatraPointsUsed = 0;
    let yatraPointsDiscount = 0;

    if (yatrapointsToUse && yatrapointsToUse > 0) {
      const yatraPointsToUseInt = parseInt(yatrapointsToUse);

      // ATOMIC deduct — prevents double-spend race condition
      const updatedUser = await User.findOneAndUpdate(
        { _id: userId, yatrapoints: { $gte: yatraPointsToUseInt } },
        { $inc: { yatrapoints: -yatraPointsToUseInt } },
        { new: true }
      );

      if (!updatedUser) {
        return res.status(400).json({
          success: false,
          message: "Insufficient yatrapoints — balance may have changed. Please refresh.",
        });
      }

      const discountPercentage = (yatraPointsToUseInt / 100) * 1;
      yatraPointsDiscount = Math.min(Math.round((finalAmount * discountPercentage) / 100 * 100) / 100, finalAmount);
      finalAmount -= yatraPointsDiscount;
      yatraPointsUsed = yatraPointsToUseInt;

      const originalBalance = updatedUser.yatrapoints + yatraPointsUsed;
      try {
        await YatraPointsHistory.create({
          userId,
          type: "redeem",
          points: yatraPointsUsed,
          balanceBefore: originalBalance,
          balanceAfter: updatedUser.yatrapoints,
          scheduleId,
          description: `Redeemed ${yatraPointsUsed} points for discount`,
          meta: { discountAmount: yatraPointsDiscount },
        });
      } catch (histErr) {
        console.error("Failed to record YatraPoints redeem history:", histErr);
      }
    }

    if (Math.abs(paymentAmount - finalAmount) > 1) {
      return res.status(400).json({
        success: false,
        message: `Payment amount (Rs.${paymentAmount}) doesn't match expected amount (Rs.${finalAmount.toFixed(2)})`,
        errorCode: "PAYMENT_AMOUNT_MISMATCH",
      });
    }

    // ================================================================
    // 4. CREATE BOOKING RECORD
    // ================================================================
    const generateTicketId = () => {
      const dateStr = new Date().toISOString().split("T")[0].replace(/-/g, "");
      const randomNum = Math.floor(1000 + Math.random() * 90000);
      return `TKT-${dateStr}-${randomNum}`;
    };

    const ticketId = generateTicketId();

    const booking = await Booking.create({
      userId,
      tripId: scheduleId,
      seats: normalizedSeats,
      passengerDetails: passengerDetails || [],
      boardingPoint: boardingPoint || {},
      droppingPoint: droppingPoint || {},
      originalAmount,
      couponUsed,
      couponCode: appliedCouponCode,
      discountAmount: discountAmount + yatraPointsDiscount,
      totalAmount: finalAmount,
      yatraPointsUsed,
      yatraPointsDiscount,
      ticketId,
    });

    // Apply coupon usage flag
    if (couponUsed) {
      try {
        await CouponHelper.applyCoupon(appliedCouponCode, userId, booking._id, originalAmount);
      } catch (couponError) {
        console.error("Error recording coupon usage:", couponError);
      }
    }

    // Earn reward points
    const rewardPoint = Math.round(finalAmount * 0.1);
    const userAfterEarn = await User.findByIdAndUpdate(
      userId,
      { $inc: { yatrapoints: rewardPoint } },
      { new: true }
    );

    try {
      await YatraPointsHistory.create({
        userId,
        type: "earn",
        points: rewardPoint,
        balanceBefore: userAfterEarn.yatrapoints - rewardPoint,
        balanceAfter: userAfterEarn.yatrapoints,
        bookingId: booking._id,
        scheduleId,
        ticketId,
        description: `Earned ${rewardPoint} points for booking`,
        meta: { originalAmount, finalAmount, seats: normalizedSeats },
      });
    } catch (histErr) {
      console.error("Failed to record YatraPoints earn history:", histErr);
    }

    // Notifications
    await createLocalNotification(
      userId,
      "BOOKING_CONFIRMED",
      "Ticket Booked Successfully",
      `Your ticket (${ticketId}) is confirmed.`,
      { scheduleId, seats: normalizedSeats, originalAmount, discountAmount, finalAmount, couponCode: appliedCouponCode }
    );

    const userDevices = await UserDeviceInfo.find({ userId });
    const tokens = userDevices.map((d) => d.token).filter(Boolean);
    if (tokens.length > 0) {
      await notificationManager(tokens, "Ticket Booked Successfully", `Your ticket (${ticketId}) is confirmed.`);
    }

    return res.status(201).json({
      success: true,
      message: "Booking confirmed successfully!",
      data: {
        bookingId: booking._id,
        ticketId,
        originalAmount,
        discountAmount,
        finalAmount,
        couponUsed: appliedCouponCode,
        savings: discountAmount > 0 ? Math.round((discountAmount / originalAmount) * 100 * 100) / 100 : 0,
        paymentId,
        gateway,
        seats: normalizedSeats,
        yatrapointsEarned: rewardPoint,
      },
    });
  } catch (error) {
    console.error("Error confirming booking:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error during booking confirmation!" });
  }
};

// Verify booking status (for checking if booking was successful)
const verifyBooking = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const userId = req.userInfo.id;

    const booking = await Booking.findOne({
      ticketId,
      userId,
    }).populate("scheduleId");

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found!",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Booking verified successfully!",
      data: {
        bookingId: booking._id,
        ticketId: booking.ticketId,
        scheduleDetails: booking.scheduleId,
        seats: booking.seats,
        originalAmount: booking.originalAmount,
        discountAmount: booking.discountAmount,
        totalAmount: booking.totalAmount,
        couponUsed: booking.couponCode,
        gateway: booking.gateway,
        transactionId: booking.transactionId,
        status: booking.status,
        bookedAt: booking.bookedAt,
      },
    });
  } catch (error) {
    console.error("Error verifying booking:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};

module.exports = {
  prepareBooking,
  confirmBooking,
  verifyBooking,
};
