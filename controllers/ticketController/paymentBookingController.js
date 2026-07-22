// busScheduleModel removed — seats are indexed by tripId in the new Trip-based model
const Seat                   = require("../../models/seatsModel.js");
const Booking                = require("../../models/bookTicketModel.js");
const User                   = require("../../models/userModel.js");
const UserDeviceInfo         = require("../../models/userDeviceInfoModel.js");
const CouponHelper           = require("../../handlers/couponHelper.js");
// YatraPointsHistory removed — YatraPoints deprecated in favour of SM Ledger cashback
const Transaction            = require("../../models/transactionModel.js");
const { verifyEsewaPayment } = require("../../services/esewaVerificationService.js");
const logger                 = require("../../utils/logger.js");
const {
  createLocalNotification,
  notificationManager,
} = require("../notificationController/notification_manager.js");
const SeatHold               = require("../../models/seatHoldModel.js");
const passengerSeatHold      = require("../../src/modules/booking/passenger-seat-hold");

// Step 1: Prepare booking with coupon validation (before payment)
const prepareBooking = async (req, res, next) => {
  try {
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ success: false, message: "your body is empty please add" });
    }
    const { scheduleId, seatNumbers, originalAmount, couponCode, smMoneyToUse } = req.body;
    const userId = req.dbUser._id;

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

    // P2.1: Booking cutoff gate — reject early before any seat or payment logic
    const Trip = require("../../models/tripModel.js");
    const trip = await Trip.findById(scheduleId).select("status bookingClosesAt").lean();
    if (!trip) {
      return res.status(404).json({ success: false, message: "Trip not found." });
    }
    if (trip.bookingClosesAt && new Date(trip.bookingClosesAt) < new Date()) {
      return res.status(400).json({
        success: false,
        message: "Online booking has closed for this trip. Bookings can no longer be accepted.",
        errorCode: "BOOKING_WINDOW_CLOSED",
      });
    }
    if (trip.status !== "scheduled" && trip.status !== "boarding") {
      return res.status(400).json({
        success: false,
        message: `Bookings are not available for trips with status: ${trip.status}`,
        errorCode: "TRIP_NOT_BOOKABLE",
      });
    }

    // Check seat availability with domain policy normalization
    let normalizedSeats;
    try {
      normalizedSeats = passengerSeatHold.normalizeSeatNumbers(seatNumbers);
    } catch (err) {
      if (err.statusCode) {
        return res.status(err.statusCode).json(err.responseBody);
      }
      return res.status(400).json({
        success: false,
        message: "Invalid seat selection.",
        errorCode: "INVALID_SEAT_SELECTION",
      });
    }

    // Find seats using tripId (the new Trip model is authoritative)
    const seatDoc = await Seat.findOne({ tripId: scheduleId });

    if (!seatDoc) {
      return res.status(404).json({
        success: false,
        message: "Seat data not found for schedule.",
      });
    }

    // Validate seat availability
    const allSeats = [...seatDoc.seata, ...seatDoc.seatb, ...seatDoc.seatc];
    const alreadyBookedSeats = [];
    const invalidSeats = [];

    normalizedSeats.forEach((seatNo) => {
      const seat = allSeats.find((s) => s.seatNo.toLowerCase() === seatNo);
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
        scheduleId,
        req.userInfo.activeRole
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

    // ════════════════════════════════════════════════════════════════════
    // SM MONEY PREVIEW — Compute split-payment breakdown (spec §1.2, §4.3)
    // ════════════════════════════════════════════════════════════════════
    const smLedgerService = require("../../services/smLedgerService.js");
    const PlatformConfig = require("../../models/platformConfigModel.js");

    // Fetch live balance and config
    const [balanceResult, smConfig] = await Promise.all([
      smLedgerService.computeSpendableBalance(userId),
      PlatformConfig.getConfig("sm_money_config"),
    ]);

    const spendableBalance = balanceResult.display; // already Math.max(0, ...)
    const maxDiscountPercent = (smConfig && smConfig.maxDiscountPercent) || 80;

    // 80% combined cap: offer + SM Money together cannot exceed this
    const maxTotalDiscount = Math.floor(originalAmount * (maxDiscountPercent / 100));
    const maxSmMoneyAllowed = Math.max(0, maxTotalDiscount - discountAmount);

    // Clamp SM Money to: min(requested, available balance, cap)
    let requestedSmMoney = Number(smMoneyToUse) || 0;
    requestedSmMoney = Math.max(0, Math.floor(requestedSmMoney)); // No negatives, integer only
    const smMoneyApplied = Math.min(requestedSmMoney, spendableBalance, maxSmMoneyAllowed);

    // Compute final split
    const afterCouponAmount = originalAmount - discountAmount;
    const gatewayAmount = afterCouponAmount - smMoneyApplied;

    // Create or reuse atomic seat hold
    const hold = await passengerSeatHold.createOrReusePassengerSeatHold({
      userId,
      tripId: scheduleId,
      seatNumbers: normalizedSeats,
      now: new Date(),
    });

    // Return booking preparation details with full split breakdown and data.seats
    return res.status(200).json({
      success: true,
      message: "Booking prepared successfully. Proceed with payment.",
      data: {
        tempBookingId: hold.tempBookingId,
        scheduleId,
        seats: hold.seatNumbers,
        originalAmount,
        // Coupon breakdown
        couponDiscount: discountAmount,
        couponDetails,
        afterCouponAmount,
        // SM Money breakdown
        smMoneyBalance: spendableBalance,
        smMoneyApplied,
        maxSmMoneyAllowed,
        // Final amounts
        totalDiscount: discountAmount + smMoneyApplied,
        gatewayAmount,        // Amount to charge at payment gateway
        paymentAmount: gatewayAmount, // Backward compat — same as gatewayAmount
        expiresAt: hold.expiresAt,
      },
    });
  } catch (error) {
    if (error.statusCode) return next(error);
    console.error("Error preparing booking:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};

// ================================================================
// HELPER: Release atomically-locked seats (rollback on failure)
// ================================================================
const _rollbackSeatLocks = async (tripId, seatNumbers, userId) => {
  const seatDoc = await Seat.findOne({ tripId });
  if (!seatDoc) return;
  const allSeats = [...seatDoc.seata, ...seatDoc.seatb, ...seatDoc.seatc];

  for (const reqSeat of seatNumbers) {
    try {
      const exactSeat = allSeats.find((s) => s.seatNo.toLowerCase() === reqSeat.toLowerCase());
      if (!exactSeat) continue;
      const seatNo = exactSeat.seatNo;

      let arrayField = null;
      if (seatDoc.seata.some((s) => s.seatNo === seatNo)) {
        arrayField = "seata";
      } else if (seatDoc.seatb.some((s) => s.seatNo === seatNo)) {
        arrayField = "seatb";
      } else if (seatDoc.seatc.some((s) => s.seatNo === seatNo)) {
        arrayField = "seatc";
      }

      if (!arrayField) continue;

      await Seat.findOneAndUpdate(
        { tripId, [arrayField]: { $elemMatch: { seatNo, bookedBy: userId } } },
        {
          $set: {
            [`${arrayField}.$[elem].booked`]:    false,
            [`${arrayField}.$[elem].bookedBy`]:  null,
            [`${arrayField}.$[elem].bookedAt`]:  null,
          },
        },
        { arrayFilters: [{ "elem.seatNo": seatNo, "elem.bookedBy": userId }] }
      );
    } catch (rollbackErr) {
      logger.error("confirmBooking: seat rollback failed for individual seat", {
        tripId, seatNo: reqSeat, userId, error: rollbackErr.message,
      });
    }
  }
};

// ================================================================
// HELPER: Send admin alert for disputed payment
// ================================================================
const _sendDisputeAdminAlert = async (transaction, reason) => {
  try {
    // Log prominently — this is a money-stuck situation
    logger.error("🚨 DISPUTED PAYMENT — Manual refund required", {
      transactionId: transaction._id,
      esewaPaymentId: transaction.transactionId,
      userId: transaction.userId,
      amount: transaction.totalAmount,
      tripId: transaction.tripId,
      seats: transaction.seats,
      reason,
    });

    // In-app notification for admin review (uses admin userId from env, or falls back to log-only)
    const adminUserId = process.env.ADMIN_ALERT_USER_ID;
    if (adminUserId) {
      await createLocalNotification(
        adminUserId,
        "DISPUTED_PAYMENT",
        "⚠️ Disputed Payment — Action Required",
        `Payment of Rs.${transaction.totalAmount} received (eSewa: ${transaction.transactionId}) but booking creation failed. Case ID: ${transaction._id}. Reason: ${reason}`,
        {
          transactionId: transaction._id,
          esewaPaymentId: transaction.transactionId,
          userId: transaction.userId,
          amount: transaction.totalAmount,
          tripId: transaction.tripId,
          seats: transaction.seats,
        }
      );
    }
  } catch (alertErr) {
    logger.error("confirmBooking: failed to send admin dispute alert", { error: alertErr.message });
  }
};
// ── Module-level helpers (keep confirmBooking readable) ─────────────────────
const _generateTicketId = () => {
  const d = new Date().toISOString().split('T')[0].replace(/-/g, '');
  return `TKT-${d}-${Math.floor(1000 + Math.random() * 90000)}`;
};

const _buildCommittedResponse = (booking, ticketId, f) => ({
  success: true, message: 'Booking confirmed successfully!',
  data: {
    bookingId: booking._id, ticketId,
    originalAmount: f.originalAmount, discountAmount: f.discountAmount,
    smMoneyUsed: f.smMoneyApplied, gatewayAmount: f.gatewayAmount, totalAmount: f.finalAmount,
    couponUsed: f.appliedCouponCode || null,
    savings: f.discountAmount > 0 ? Math.round((f.discountAmount / f.originalAmount) * 10000) / 100 : 0,
    paymentId: f.paymentId || `sm_wallet_${Date.now()}`,
    gateway: f.gateway, seats: f.normalizedSeats, scratchCardId: f.scratchCardId || null,
  },
});

const _sendBookingConfirmedNotification = async (userId, ticketId, meta) => {
  const { createLocalNotification, notificationManager } = require('../notificationController/notification_manager.js');
  const UserDeviceInfo = require('../../models/userDeviceInfoModel.js');
  await createLocalNotification(userId, 'BOOKING_CONFIRMED', 'Ticket Booked Successfully', `Your ticket (${ticketId}) is confirmed.`, meta);
  const tokens = (await UserDeviceInfo.find({ userId })).map((d) => d.token).filter(Boolean);
  if (tokens.length > 0) await notificationManager(tokens, 'Ticket Booked Successfully', `Your ticket (${ticketId}) is confirmed.`);
};

// Step 2: Confirm booking after successful payment — SPLIT PAYMENT + ATOMIC seat lock
// ================================================================
// EXECUTION ORDER (split-payment with reverseDebit safety net):
//   1. Validate inputs (accept smMoneyToUse)
//   2. Re-validate SM Money balance (live) + enforce 80% cap
//   3. Debit SM Money via FIFO (if smMoneyToUse > 0)
//   4. Verify gateway payment (if gatewayAmount > 0)
//      → On failure: reverseDebit, return error
//   5. Write Transaction record (PAYMENT_RECEIVED)
//   6. Verify trip status & booking cutoff
//      → On failure: reverseDebit, mark DISPUTED
//   7. Atomic seat lock
//      → On failure: reverseDebit, mark DISPUTED
//   8. Re-validate coupon + amount verification (updated for split)
//   9. Create Booking (with smMoneyUsed, gatewayAmount, gatewayFeeRate)
//      → On failure: reverseDebit, rollback seats, mark DISPUTED
//  10. Post-booking: cashback, notifications
// ================================================================
const confirmBooking = async (req, res) => {
  let smDebitEntryId = null;
  let txnRecord = null;
  let seatsLocked = false;
  let lockedSeatNumbers = [];
  let lockUserId = null;
  let lockTripId = null;
  let bookingCreated = false;
  let bookingCommitted = false;
  let booking = null;
  // Snapshot of all response fields captured before bookingCommitted=true.
  // The outer catch reads ONLY this so a post-commit ReferenceError is impossible.
  let committedBookingResponse = null;

  // ── Helper: Reverse SM Money debit if one was made ──────────────
  const _reverseSmDebitIfNeeded = async (reason) => {
    if (!smDebitEntryId) return;
    try {
      const smLedgerService = require("../../services/smLedgerService.js");
      await smLedgerService.reverseDebit(smDebitEntryId);
      logger.info("confirmBooking: SM Money debit reversed", {
        smDebitEntryId, reason,
      });
      smDebitEntryId = null; // Clear so we don't double-reverse
    } catch (reverseErr) {
      logger.error("confirmBooking: CRITICAL — failed to reverse SM Money debit", {
        smDebitEntryId, reason, error: reverseErr.message,
      });
      // This is a money-stuck situation — admin must intervene
    }
  };

    try {
      if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({ success: false, message: "your body is empty please add" });
      }
      const {
        tempBookingId,
        paymentId,
        paymentAmount,
        gateway,
        scheduleId: clientScheduleId,
        seatNumbers: clientSeats,
        originalAmount,
        couponCode,
        boardingPoint,    // { name, time, lat, lng } — now persisted
        droppingPoint,    // { name, time, lat, lng } — now persisted
        bookedFrom,       // User's searched origin (e.g., "Bardibas") — persisted on Booking
        bookedTo,         // User's searched destination (e.g., "Kathmandu") — persisted on Booking
        bookedDepartureTime, // Stop-specific departure time (resolved by search)
        bookedArrivalTime,   // Stop-specific arrival time (resolved by search)
        passengerDetails, // [{ name, age, gender, seatNo }] — DoT compliance
        walletPin,        // Required when gateway === "wallet" — server-side PIN verification
        smMoneyToUse,     // SM Money amount to debit (split payment)
      } = req.body;

      const SUPPORTED_BOOKING_GATEWAYS = new Set(["esewa", "wallet"]);
      if (!gateway || typeof gateway !== "string" || !SUPPORTED_BOOKING_GATEWAYS.has(gateway)) {
        return res.status(400).json({
          success: false,
          message: "The selected payment gateway is not supported.",
          errorCode: "UNSUPPORTED_PAYMENT_GATEWAY",
        });
      }

      if (!tempBookingId) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields for booking confirmation",
        });
      }

      const userId = req.dbUser._id;
      const scheduleId = req.bookingHold.tripId;
      const seatNumbers = req.bookingHold.seatNumbers;
      const normalizedSeats = seatNumbers;

      lockUserId = userId;
      lockTripId = scheduleId;

      // ================================================================
      // STEP 1: PRE-SIDE-EFFECT VALIDATION & CONFIRMATION QUOTE
      // Must occur BEFORE any payment debit, verification, transaction
      // creation, or seat locking.
      // ================================================================
      let discountAmount = 0;
      let finalAmount = originalAmount;
      let couponUsed = null;
      let appliedCouponCode = null;

      if (couponCode && couponCode.trim() !== "") {
        const validation = await CouponHelper.validateCoupon(
          couponCode,
          userId,
          originalAmount,
          scheduleId,
          req.userInfo.activeRole
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

      const smLedgerService = require("../../services/smLedgerService.js");
      const PlatformConfig = require("../../models/platformConfigModel.js");

      let smMoneyApplied = 0;
      let gatewayAmount = paymentAmount || 0;

      const requestedSmMoney = Math.max(0, Math.floor(Number(smMoneyToUse) || 0));

      if (requestedSmMoney > 0) {
        const [balanceResult, smConfig] = await Promise.all([
          smLedgerService.computeSpendableBalance(userId),
          PlatformConfig.getConfig("sm_money_config"),
        ]);

        const spendableBalance = balanceResult.display;
        const maxDiscountPercent = (smConfig && smConfig.maxDiscountPercent) || 80;

        const maxTotalDiscount = Math.floor(originalAmount * (maxDiscountPercent / 100));
        const maxSmMoneyAllowed = Math.max(0, maxTotalDiscount - discountAmount);

        smMoneyApplied = Math.min(requestedSmMoney, spendableBalance, maxSmMoneyAllowed);
        if (smMoneyApplied <= 0) {
          smMoneyApplied = 0;
        }
      }

      if (gateway === "wallet") {
        smMoneyApplied = paymentAmount;
        gatewayAmount = 0;
      } else {
        const afterCoupon = originalAmount - discountAmount;
        gatewayAmount = afterCoupon - smMoneyApplied;
      }

      // Amount consistency check
      const expectedTotal = gatewayAmount + smMoneyApplied;
      if (Math.abs(finalAmount - expectedTotal) > 1) {
        logger.warn("confirmBooking: Amount mismatch in confirmation quote", {
          finalAmount, gatewayAmount, smMoneyApplied, expectedTotal,
        });
        return res.status(400).json({
          success: false,
          message: "Amount mismatch between coupon, wallet, and gateway calculations.",
          errorCode: "AMOUNT_MISMATCH",
        });
      }

      // ================================================================
      // STEP 2: DEBIT SM MONEY VIA FIFO (if applicable)
      // ================================================================
      if (smMoneyApplied > 0 && gateway !== "wallet") {
        try {
          const debitEntry = await smLedgerService.debitLedgerFIFO({
            userId,
            amount: smMoneyApplied,
            bookingId: null,
            note: `SM Money spent at checkout: Rs. ${smMoneyApplied} (temp: ${tempBookingId})`,
          });
          smDebitEntryId = debitEntry._id;
          logger.info("confirmBooking: SM Money debited (split payment)", {
            userId, amount: smMoneyApplied, debitEntryId: smDebitEntryId,
          });
        } catch (smDebitErr) {
          logger.warn("confirmBooking: SM Money FIFO debit failed", {
            userId, amount: smMoneyApplied, error: smDebitErr.message,
          });
          return res.status(402).json({
            success: false,
            message: smDebitErr.message || "Failed to debit Shuvmarg Money",
            errorCode: "SM_MONEY_DEBIT_FAILED",
          });
        }
      }

      // ================================================================
      // STEP 3: GATEWAY PAYMENT VERIFICATION
      // ================================================================
      if (gateway === "esewa") {
        if (!paymentId || !gatewayAmount) {
          await _reverseSmDebitIfNeeded("Missing paymentId or gatewayAmount for eSewa");
          return res.status(400).json({
            success: false,
            message: "Missing paymentId or paymentAmount for eSewa confirmation",
            errorCode: "ESEWA_PARAMS_MISSING",
          });
        }
        const esewaCheck = await verifyEsewaPayment(paymentId, gatewayAmount);
        if (!esewaCheck.verified) {
          logger.warn("confirmBooking: eSewa verification failed", {
            paymentId, gatewayAmount, userId, reason: esewaCheck.error,
          });
          await _reverseSmDebitIfNeeded(`eSewa verification failed: ${esewaCheck.error}`);
          return res.status(402).json({
            success: false,
            message: `Payment verification failed: ${esewaCheck.error}`,
            errorCode: "ESEWA_VERIFICATION_FAILED",
          });
        }
        logger.info("confirmBooking: eSewa payment verified", { paymentId, userId, gatewayAmount });
      }

      let walletDebitResult = null;
      if (gateway === "wallet") {
        if (!walletPin || !/^\d{4}$/.test(walletPin)) {
          return res.status(401).json({
            success: false,
            message: "Wallet PIN is required for wallet payments.",
            errorCode: "WALLET_PIN_REQUIRED",
          });
        }

        const Wallet  = require("../../models/walletModel");
        const bcrypt  = require("bcryptjs");
        const userWallet = await Wallet.findOne({ userId });

        if (!userWallet || !userWallet.isPinSet) {
          return res.status(400).json({
            success: false,
            message: "Wallet PIN is not set. Please set up your wallet first.",
            errorCode: "WALLET_PIN_NOT_SET",
          });
        }

        if (userWallet.status !== "active") {
          return res.status(403).json({
            success: false,
            message: "Wallet is frozen. Please contact support.",
            errorCode: "WALLET_FROZEN",
          });
        }

        const pinMatch = await bcrypt.compare(walletPin, userWallet.pin);
        if (!pinMatch) {
          logger.warn("confirmBooking: Wallet PIN mismatch", { userId });
          return res.status(401).json({
            success: false,
            message: "Incorrect wallet PIN.",
            errorCode: "WALLET_PIN_INVALID",
          });
        }

        logger.info("confirmBooking: Wallet PIN verified server-side", { userId });

        try {
          const debitEntry = await smLedgerService.debitLedgerFIFO({
            userId,
            amount: smMoneyApplied,
            bookingId: null,
            note: `SM Wallet full payment: Rs. ${smMoneyApplied} (temp: ${tempBookingId})`,
          });
          smDebitEntryId = debitEntry._id;
          logger.info("confirmBooking: SM Wallet debited successfully (full payment)", {
            userId, amount: smMoneyApplied, debitEntryId: smDebitEntryId,
          });
        } catch (walletErr) {
          logger.warn("confirmBooking: SM Wallet debit failed", {
            userId, amount: smMoneyApplied, error: walletErr.message,
          });
          return res.status(402).json({
            success: false,
            message: walletErr.message || "Failed to debit SM Wallet",
            errorCode: "WALLET_DEBIT_FAILED",
          });
        }
      }

      // ================================================================
      // STEP 4: WRITE TRANSACTION RECORD — PAYMENT_RECEIVED
      // ================================================================
      const gatewayFeeConfig = await PlatformConfig.getConfig("gateway_fees");
      const currentGatewayFeeRate = (gatewayFeeConfig && gatewayFeeConfig[gateway])
        ? gatewayFeeConfig[gateway].feePercent || 0
        : 0;

      txnRecord = await Transaction.create({
        userId,
        tripId:          scheduleId,
        seats:           normalizedSeats,
        transactionType: "BOOKING",
        gateway:         gateway === "wallet" ? "sm_wallet" : gateway,
        transactionId:   paymentId || `sm_wallet_${Date.now()}`,
        originalAmount:  originalAmount || paymentAmount,
        totalAmount:     (gatewayAmount || 0) + (smMoneyApplied || 0),
        status:          "PAYMENT_RECEIVED",
        paidAt:          new Date(),
        meta: {
          tempBookingId,
          paymentMethod: gateway === "wallet" ? "SM_WALLET" : gateway.toUpperCase(),
          bookedVia:     "APP",
          smMoneyUsed:   smMoneyApplied,
          gatewayAmount: gatewayAmount,
          smDebitEntryId: smDebitEntryId,
          gatewayFeeRate: currentGatewayFeeRate,
        },
      });

      logger.info("confirmBooking: Transaction record created (PAYMENT_RECEIVED)", {
        txnId: txnRecord._id,
        paymentId,
        userId,
        gatewayAmount,
        smMoneyApplied,
      });

      // ================================================================
      // STEP 5: VERIFY TRIP STATUS & BOOKING CUTOFF
      // ================================================================
      const Trip = require("../../models/tripModel.js");
      const trip = await Trip.findById(scheduleId).lean();
      if (!trip) {
        await Transaction.findByIdAndUpdate(txnRecord._id, {
          status: "DISPUTED",
          disputeReason: "Trip not found after payment verification",
        });
        await _reverseSmDebitIfNeeded("Trip not found after payment");
        await _sendDisputeAdminAlert(txnRecord, "Trip not found after payment verification");
        return res.status(404).json({
          success: false,
          message: `Your payment was received but the trip was not found. Your case ID is ${txnRecord._id}. We will resolve this within 2 hours.`,
          caseId: txnRecord._id,
          errorCode: "BOOKING_CREATION_FAILED_PAYMENT_RECEIVED",
        });
      }

      if (trip.bookingClosesAt && new Date(trip.bookingClosesAt) < new Date()) {
        await Transaction.findByIdAndUpdate(txnRecord._id, {
          status: "DISPUTED",
          disputeReason: "Booking window closed after payment was processed",
        });
        await _reverseSmDebitIfNeeded("Booking window closed after payment");
        await _sendDisputeAdminAlert(txnRecord, "Booking window closed after payment was processed");
        return res.status(400).json({
          success: false,
          message: `Your payment was received but booking has closed for this trip. Your case ID is ${txnRecord._id}. We will resolve this within 2 hours.`,
          caseId: txnRecord._id,
          errorCode: "BOOKING_CREATION_FAILED_PAYMENT_RECEIVED",
        });
      }

      if (trip.status !== "scheduled" && trip.status !== "boarding") {
        await Transaction.findByIdAndUpdate(txnRecord._id, {
          status: "DISPUTED",
          disputeReason: `Trip status is "${trip.status}" — not bookable after payment`,
        });
        await _reverseSmDebitIfNeeded(`Trip status "${trip.status}" not bookable`);
        await _sendDisputeAdminAlert(txnRecord, `Trip status is "${trip.status}" — not bookable`);
        return res.status(400).json({
          success: false,
          message: `Your payment was received but the trip is no longer available (status: ${trip.status}). Your case ID is ${txnRecord._id}. We will resolve this within 2 hours.`,
          caseId: txnRecord._id,
          errorCode: "BOOKING_CREATION_FAILED_PAYMENT_RECEIVED",
        });
      }

      // ================================================================
      // STEP 6: ATOMIC SEAT LOCK
      // ================================================================
      const seatDoc = await Seat.findOne({ tripId: scheduleId });
      if (!seatDoc) {
        await Transaction.findByIdAndUpdate(txnRecord._id, {
          status: "DISPUTED",
          disputeReason: "Seat data not found for trip after payment",
        });
        await _reverseSmDebitIfNeeded("Seat data not found after payment");
        await _sendDisputeAdminAlert(txnRecord, "Seat data not found for trip after payment");
        return res.status(404).json({
          success: false,
          message: `Your payment was received but seat data is missing. Your case ID is ${txnRecord._id}. We will resolve this within 2 hours.`,
          caseId: txnRecord._id,
          errorCode: "BOOKING_CREATION_FAILED_PAYMENT_RECEIVED",
        });
      }

      const allSeats = [...seatDoc.seata, ...seatDoc.seatb, ...seatDoc.seatc];

      const exactSeatsToLock = [];
      for (const reqSeat of normalizedSeats) {
        const exactSeat = allSeats.find((s) => s.seatNo.toLowerCase() === reqSeat);
        if (exactSeat) {
          exactSeatsToLock.push(exactSeat.seatNo);
        } else {
          exactSeatsToLock.push(reqSeat.toUpperCase());
        }
      }

      const alreadyBookedSeats = [];
      const invalidSeats = [];

      for (const seatNo of exactSeatsToLock) {
        let arrayField = null;
        if (seatDoc.seata.some((s) => s.seatNo.toLowerCase() === seatNo.toLowerCase())) {
          arrayField = "seata";
        } else if (seatDoc.seatb.some((s) => s.seatNo.toLowerCase() === seatNo.toLowerCase())) {
          arrayField = "seatb";
        } else if (seatDoc.seatc.some((s) => s.seatNo.toLowerCase() === seatNo.toLowerCase())) {
          arrayField = "seatc";
        }

        if (!arrayField) {
          invalidSeats.push(seatNo.toUpperCase());
          continue;
        }

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
          alreadyBookedSeats.push(seatNo.toUpperCase());
        }
      }

      if (invalidSeats.length > 0 || alreadyBookedSeats.length > 0) {
        await _rollbackSeatLocks(scheduleId, normalizedSeats, userId);

        const reasons = [];
        if (invalidSeats.length > 0) reasons.push(`Invalid seat(s): ${invalidSeats.join(", ")}`);
        if (alreadyBookedSeats.length > 0) reasons.push(`Already booked: ${alreadyBookedSeats.join(", ")} — taken during payment`);
        const fullReason = reasons.join(" | ");

        await Transaction.findByIdAndUpdate(txnRecord._id, {
          status: "DISPUTED",
          disputeReason: `Seat lock failed after payment: ${fullReason}`,
        });
        await _reverseSmDebitIfNeeded(`Seat lock failed: ${fullReason}`);
        await _sendDisputeAdminAlert(txnRecord, `Seat lock failed: ${fullReason}`);

        return res.status(409).json({
          success: false,
          message: `Your payment was received but the requested seats are no longer available. Your case ID is ${txnRecord._id}. We will resolve this within 2 hours. (${fullReason})`,
          caseId: txnRecord._id,
          errorCode: "BOOKING_CREATION_FAILED_PAYMENT_RECEIVED",
        });
      }

      seatsLocked = true;
      lockedSeatNumbers = normalizedSeats;

      // ================================================================
      // STEP 8: CREATE BOOKING RECORD
      // ================================================================
      const ticketId = _generateTicketId();

      const formattedPassengers = (passengerDetails || []).map(p => ({
        name: p.name || "Passenger",
        age: p.age || 0,
        gender: p.gender || "other",
        seatNo: (Array.isArray(p.seatNo) ? p.seatNo[0] : p.seatNo) || normalizedSeats[0] || "N/A"
      }));

      let paymentMethodLabel;
      if (gateway === "wallet") {
        paymentMethodLabel = "SM_WALLET";
      } else if (smMoneyApplied > 0) {
        paymentMethodLabel = "SM_WALLET_SPLIT";
      } else {
        paymentMethodLabel = gateway.toUpperCase();
      }

      try {
        booking = await Booking.create({
          userId,
          tripId: scheduleId,
          brandId: trip.brandId || null,
          busId:   trip.busId   || null,
          bookedFrom: bookedFrom || null,
          bookedTo:   bookedTo   || null,
          bookedDepartureTime: bookedDepartureTime || null,
          bookedArrivalTime:   bookedArrivalTime   || null,
          seats: normalizedSeats,
          passengerDetails: formattedPassengers,
          boardingPoint: boardingPoint || {},
          droppingPoint: droppingPoint || {},
          originalAmount,
          couponUsed,
          couponCode: appliedCouponCode,
          discountAmount,
          totalAmount: finalAmount,
          smMoneyUsed: smMoneyApplied,
          gatewayAmount: gatewayAmount,
          gatewayFeeRate: currentGatewayFeeRate,
          smDebitEntryId: smDebitEntryId,
          paymentMethod: paymentMethodLabel,
          transactionId: paymentId || `sm_wallet_${Date.now()}`,
          bookedVia: "APP",
          ticketId,
        });
        bookingCreated = true;
      } catch (bookingError) {
        const failReason = `Booking.create() failed: ${bookingError.message}`;
        logger.error("🚨 confirmBooking: BOOKING CREATION FAILED after payment", {
          txnId: txnRecord._id,
          paymentId,
          userId,
          scheduleId,
          seats: normalizedSeats,
          error: bookingError.message,
          stack: bookingError.stack,
        });

        await Transaction.findByIdAndUpdate(txnRecord._id, {
          status:        "DISPUTED",
          disputeReason: failReason,
          failureReason: bookingError.message,
        });

        await _rollbackSeatLocks(scheduleId, normalizedSeats, userId);
        await _reverseSmDebitIfNeeded(failReason);
        await _sendDisputeAdminAlert(txnRecord, failReason);

        try {
          await createLocalNotification(
            userId,
            "PAYMENT_DISPUTE",
            "Payment Received — Ticket Issue",
            `Your payment of Rs.${(gatewayAmount || 0) + (smMoneyApplied || 0)} was received but ticket creation encountered an issue. Case ID: ${txnRecord._id}. Our team will resolve this within 2 hours.`,
            {
              transactionId: txnRecord._id,
              esewaPaymentId: paymentId,
              amount: (gatewayAmount || 0) + (smMoneyApplied || 0),
            }
          );
        } catch (notifErr) {
          logger.error("confirmBooking: failed to notify user about dispute", { error: notifErr.message });
        }

        return res.status(500).json({
          success:   false,
          message:   `Your payment was received but ticket creation failed. Your case ID is ${txnRecord._id}. We will resolve this within 2 hours.`,
          caseId:    txnRecord._id,
          errorCode: "BOOKING_CREATION_FAILED_PAYMENT_RECEIVED",
        });
      }

      // ================================================================
      // STEP 9: TRANSITION TRANSACTION TO SUCCESS WITH VERIFICATION
      // ================================================================
      try {
        const successfulTransaction = await Transaction.findOneAndUpdate(
          {
            _id: txnRecord._id,
            status: "PAYMENT_RECEIVED",
          },
          {
            $set: {
              status: "SUCCESS",
              bookingId: booking._id,
              ticketId,
            },
          },
          {
            new: true,
            runValidators: true,
          }
        );

        if (!successfulTransaction) {
          logger.error("🚨 confirmBooking: Transaction SUCCESS transition failed (returned null)", {
            txnId: txnRecord._id,
            bookingId: booking._id,
            ticketId,
          });
          return res.status(409).json({
            success: false,
            message: "Your payment and booking were received, but final reconciliation is still required.",
            errorCode: "BOOKING_RECONCILIATION_REQUIRED",
            caseId: txnRecord._id,
          });
        }
      } catch (txnError) {
        logger.error("🚨 confirmBooking: Transaction SUCCESS transition threw exception", {
          txnId: txnRecord._id,
          bookingId: booking._id,
          ticketId,
          error: txnError.message,
        });
        return res.status(409).json({
          success: false,
          message: "Your payment and booking were received, but final reconciliation is still required.",
          errorCode: "BOOKING_RECONCILIATION_REQUIRED",
          caseId: txnRecord._id,
        });
      }

      // Capture all response fields BEFORE marking committed so the outer
      // catch can always build a safe success response without block-scope refs.
      committedBookingResponse = _buildCommittedResponse(booking, ticketId, {
        originalAmount, discountAmount, smMoneyApplied, gatewayAmount,
        finalAmount, appliedCouponCode, paymentId, gateway, normalizedSeats,
        scratchCardId: null,
      });
      bookingCommitted = true;

      // ================================================================
      // STEP 10: POST-BOOKING NON-CRITICAL WORK (ISOLATED)
      // ================================================================
      try {
        await passengerSeatHold.completePassengerHold({
          holdId: req.bookingHold._id,
          userId: req.dbUser._id,
          now: new Date(),
        });
      } catch (holdErr) {
        logger.warn("confirmBooking: Hold completion failed post-commit", { error: holdErr.message });
      }

      if (smDebitEntryId) {
        try {
          const SMLedger = require("../../models/smLedgerModel");
          await SMLedger.updateOne(
            { _id: smDebitEntryId },
            { $set: { bookingId: booking._id } }
          );
        } catch (linkErr) {
          logger.warn("confirmBooking: failed to link SM debit to booking", { error: linkErr.message });
        }
      }

      if (couponUsed) {
        try {
          await CouponHelper.applyCoupon(
            appliedCouponCode,
            userId,
            booking._id,
            originalAmount,
            req.userInfo.activeRole
          );
        } catch (couponError) {
          logger.error("Error recording coupon usage:", couponError);
        }
      }

      let scratchCardId = null;
      try {
        const cashbackResult = await smLedgerService.generateCashback({
          userId,
          bookingId: booking._id,
          baseTicketPrice: originalAmount,
        });
        if (cashbackResult && cashbackResult.scratchCard) {
          scratchCardId = cashbackResult.scratchCard._id;
          // Update the snapshot so the response includes the scratch card.
          committedBookingResponse.data.scratchCardId = scratchCardId;
        }
      } catch (cashbackErr) {
        logger.error("confirmBooking: Failed to generate cashback", { error: cashbackErr.message });
      }

      try {
        await _sendBookingConfirmedNotification(userId, ticketId,
          { scheduleId, seats: normalizedSeats, originalAmount, discountAmount,
            finalAmount, smMoneyUsed: smMoneyApplied, gatewayAmount, couponCode: appliedCouponCode });
      } catch (notifErr) {
        logger.warn('confirmBooking: Notification failed post-commit', { error: notifErr.message });
      }

      return res.status(201).json(committedBookingResponse);
  } catch (error) {
    logger.error("confirmBooking: Unexpected error in booking flow", {
      error: error.message,
      stack: error.stack,
      txnId: txnRecord?._id,
      smDebitEntryId,
      bookingCreated,
      bookingCommitted,
    });

    if (res.headersSent) {
      return;
    }

    if (bookingCommitted && committedBookingResponse) {
      // Safe: committedBookingResponse was fully captured before bookingCommitted=true.
      // No block-scoped variables are referenced here.
      return res.status(201).json(committedBookingResponse);
    }

    if (bookingCreated) {
      return res.status(409).json({
        success: false,
        message: "Your payment and booking were received, but final reconciliation is still required.",
        errorCode: "BOOKING_RECONCILIATION_REQUIRED",
        caseId: txnRecord?._id,
      });
    }

    // PRE_BOOKING: Perform compensation
    await _reverseSmDebitIfNeeded(`Unexpected crash: ${error.message}`);

    if (txnRecord) {
      try {
        await Transaction.findByIdAndUpdate(txnRecord._id, {
          status:        "DISPUTED",
          disputeReason: `Unexpected crash: ${error.message}`,
          failureReason: error.message,
        });
        await _sendDisputeAdminAlert(txnRecord, `Unexpected crash: ${error.message}`);
      } catch (txnUpdateErr) {
        logger.error("confirmBooking: CRITICAL — failed to mark transaction DISPUTED", {
          txnId: txnRecord._id,
          error: txnUpdateErr.message,
        });
      }
    }

    if (seatsLocked && lockedSeatNumbers.length > 0 && lockUserId && lockTripId) {
      try {
        await _rollbackSeatLocks(lockTripId, lockedSeatNumbers, lockUserId);
      } catch (rollbackErr) {
        logger.error("confirmBooking: seat rollback failed in outer catch", { error: rollbackErr.message });
      }
    }

    if (txnRecord) {
      return res.status(500).json({
        success:   false,
        message:   `Your payment was received but an unexpected error occurred. Your case ID is ${txnRecord._id}. We will resolve this within 2 hours.`,
        caseId:    txnRecord._id,
        errorCode: "BOOKING_CREATION_FAILED_PAYMENT_RECEIVED",
      });
    }

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
    }).populate("tripId");  // tripId is the correct field (not scheduleId)

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
