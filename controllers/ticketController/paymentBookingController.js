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

// Step 2: Confirm booking after successful payment
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
      scheduleId,
      seatNumbers,
      originalAmount,
      couponCode,
      yatrapointsToUse,
    } = req.body;
    const userId = req.userInfo.id;

    // Validate required fields
    if (
      !tempBookingId ||
      !paymentId ||
      !paymentAmount ||
      !gateway ||
      !scheduleId ||
      !seatNumbers
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields for booking confirmation",
      });
    }

    // Re-validate seat availability (seats might have been booked while user was paying)
    const normalizedSeats = seatNumbers.map((seat) => seat.toLowerCase());
    const seatDoc = await Seat.findOne({ scheduleId });

    if (!seatDoc) {
      return res.status(404).json({
        success: false,
        message: "Seat data not found for schedule.",
      });
    }

    const allSeats = [...seatDoc.seata, ...seatDoc.seatb];
    const alreadyBookedSeats = [];

    normalizedSeats.forEach((seatNo) => {
      const seat = allSeats.find((s) => s.seatNo === seatNo);
      if (seat && seat.booked) {
        alreadyBookedSeats.push(seatNo.toUpperCase());
      }
    });

    if (alreadyBookedSeats.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Seat ${alreadyBookedSeats.join(
          ", "
        )} was booked by someone else during payment. Please select different seats.`,
        errorCode: "SEATS_NO_LONGER_AVAILABLE",
      });
    }

    // Re-validate coupon and amount
    let discountAmount = 0;
    let finalAmount = originalAmount;
    let couponUsed = null;
    let appliedCouponCode = null;

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
          message: `Coupon validation failed: ${validation.error}`,
          errorCode: "COUPON_INVALID_DURING_CONFIRMATION",
        });
      }

      discountAmount = validation.discountAmount;
      finalAmount = validation.finalAmount;
      couponUsed = validation.coupon._id;
      appliedCouponCode = validation.coupon.couponCode;
    }

    // Handle YatraPoints discount if provided
    let yatraPointsUsed = 0;
    let yatraPointsDiscount = 0;

    if (yatrapointsToUse && yatrapointsToUse > 0) {
      const user = await User.findById(userId);
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

        // Deduct points from user's account
        console.log(`Before deduction - User ${userId} has ${user.yatrapoints} points`);

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
            scheduleId,
            description: `Redeemed ${yatraPointsUsed} points for discount`,
            meta: { discountAmount: yatraPointsDiscount },
          });
        } catch (histErr) {
          console.error("Failed to record YatraPoints redeem history:", histErr);
        }

        console.log(`User ${userId} used ${yatraPointsUsed} yatrapoints for ₹${yatraPointsDiscount} discount. Remaining points: ${updatedUser.yatrapoints}`);
      } else {
        return res.status(400).json({
          success: false,
          message: `Insufficient yatrapoints. You have ${user.yatrapoints} points available`,
        });
      }
    }

    // Verify payment amount matches expected amount
    if (Math.abs(paymentAmount - finalAmount) > 0.01) {
      // Allow for small rounding differences
      return res.status(400).json({
        success: false,
        message: `Payment amount (₹${paymentAmount}) doesn't match expected amount (₹${finalAmount})`,
        errorCode: "PAYMENT_AMOUNT_MISMATCH",
      });
    }

    // Mark seats as booked
    normalizedSeats.forEach((seat) => {
      const rowPrefix = seat.charAt(0);
      const seatKey = `seat${rowPrefix}`;
      const seatObj = seatDoc[seatKey].find((s) => s.seatNo === seat);
      if (seatObj) {
        seatObj.booked = true;
        seatObj.bookedBy = userId;
        seatObj.bookedAt = new Date();
      }
    });

    await seatDoc.save();

    // Generate ticket ID
    const generateTicketId = () => {
      const date = new Date();
      const dateStr = date.toISOString().split("T")[0].replace(/-/g, "");
      const randomNum = Math.floor(1000 + Math.random() * 90000);
      return `TKT-${dateStr}-${randomNum}`;
    };

    const ticketId = generateTicketId();

    // Create booking record
    const booking = await Booking.create({
      userId,
      scheduleId,
      seats: normalizedSeats,
      originalAmount,
      couponUsed,
      couponCode: appliedCouponCode,
      discountAmount: discountAmount + yatraPointsDiscount, // Total discount
      totalAmount: finalAmount,
      yatraPointsUsed: yatraPointsUsed,
      yatraPointsDiscount: yatraPointsDiscount,
      gateway,
      transactionId: paymentId,
      ticketId,
    });

    // Apply coupon usage if coupon was used
    if (couponUsed) {
      try {
        await CouponHelper.applyCoupon(
          appliedCouponCode,
          userId,
          booking._id,
          originalAmount
        );
      } catch (couponError) {
        console.error("Error recording coupon usage:", couponError);
        // Don't fail the booking if coupon usage recording fails
      }
    }

    // Calculate and update reward points
    const rewardPoint = finalAmount * 0.1;
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
        scheduleId,
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

    // Send notifications
    await createLocalNotification(
      userId,
      "BOOKING_CONFIRMED",
      "Ticket Booked Successfully",
      `Your ticket (${ticketId}) has been booked${discountAmount > 0
        ? ` with ${appliedCouponCode} coupon (₹${discountAmount} saved)`
        : ""
      }.`,
      {
        scheduleId,
        seats: normalizedSeats,
        originalAmount,
        discountAmount,
        finalAmount,
        couponCode: appliedCouponCode,
      }
    );

    const userDevices = await UserDeviceInfo.find({ userId });
    const tokens = userDevices.map((device) => device.token).filter(Boolean);

    if (tokens.length > 0) {
      await notificationManager(
        tokens,
        "Ticket Booked Successfully",
        `Your ticket (${ticketId}) has been booked${discountAmount > 0
          ? ` with ${appliedCouponCode} coupon (₹${discountAmount} saved)`
          : ""
        }.`
      );
    }

    // Return success response
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
        savings:
          discountAmount > 0
            ? Math.round((discountAmount / originalAmount) * 100 * 100) / 100
            : 0,
        paymentId,
        gateway,
        seats: normalizedSeats,
        yatrapointsEarned: Math.round(rewardPoint),
      },
    });
  } catch (error) {
    console.error("Error confirming booking:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error during booking confirmation!",
    });
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
