// busScheduleModel removed — seats are indexed by tripId in the new Trip-based model
const CouponHelper           = require("../../handlers/couponHelper.js");
// YatraPointsHistory removed — YatraPoints deprecated in favour of SM Ledger cashback
const Transaction            = require("../../models/transactionModel.js");
const {
  verifyPassengerEsewaPayment,
} = require("../../src/modules/booking/passenger-esewa-verification");
const logger                 = require("../../utils/logger.js");
const {
  createLocalNotification,
} = require("../notificationController/notification_manager.js");
const passengerSeatHold      = require("../../src/modules/booking/passenger-seat-hold");
const {
  sendBookingConfirmedNotification,
  buildCommittedBookingResponse,
} = require("../../src/modules/booking/booking-confirmation");

const {
  preparePassengerBooking,
} = require("../../src/modules/booking/passenger-booking-preparation");

const {
  validatePassengerBookingConfirmationRequest,
  buildPassengerBookingConfirmationQuote,
} = require("../../src/modules/booking/passenger-booking-confirmation-quote");

const {
  debitPassengerWalletPayment,
} = require("../../src/modules/booking/passenger-wallet-payment");

const {
  debitPassengerSplitPayment,
  reversePassengerSplitPaymentDebit,
} = require("../../src/modules/booking/passenger-split-payment");

const {
  createPassengerBookingPaymentTransaction,
} = require("../../src/modules/booking/passenger-booking-payment-transaction");

const {
  validatePassengerPostPaymentTrip,
} = require("../../src/modules/booking/passenger-post-payment-trip-validation");

const {
  commitPassengerSeats,
  rollbackPassengerSeatLocks,
} = require("../../src/modules/booking/passenger-seat-commitment");

const {
  persistPassengerBooking,
} = require("../../src/modules/booking/passenger-booking-persistence");

const {
  reconcilePassengerTransactionSuccess,
} = require("../../src/modules/booking/passenger-transaction-success-reconciliation");

// Step 1: Prepare booking with coupon validation (before payment)
const prepareBooking = preparePassengerBooking;



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

// Step 2: Confirm booking after successful payment — SPLIT PAYMENT + ATOMIC seat lock
// ================================================================
// EXECUTION ORDER (orchestrating modules with compensation safety net):
//   1. Pre-side-effect validation & build confirmation quote via module
//   2. Debit split-payment SM Money via module (if applicable)
//   3. Verify eSewa or process wallet debit via their modules
//   4. Write Transaction record (PAYMENT_RECEIVED)
//   5. Verify trip status & booking cutoff
//   6. Atomic seat lock
//   7. Create Booking
//      → On pre-booking failure: compensate internal money debits, rollback seats, mark DISPUTED
//   8. Post-commit completion & notifications
// ================================================================
const confirmBooking = async (req, res) => {
  let walletDebitEntryId = null;
  let splitPaymentDebitEntryId = null;
  let txnRecord = null;
  let seatsLocked = false;
  let lockedSeatNumbers = [];
  let lockUserId = null;
  let lockTripId = null;
  let bookingCreated = false;
  let bookingCommitted = false;
  let booking = null;
  let ticketId = null;
  // Snapshot of all response fields captured before bookingCommitted=true.
  // The outer catch reads ONLY this so a post-commit ReferenceError is impossible.
  let committedBookingResponse = null;

  // ── Helper: Reverse internal money debit if one was made ────────
  const _reverseInternalMoneyDebitIfNeeded = async (reason) => {
    if (splitPaymentDebitEntryId) {
      await reversePassengerSplitPaymentDebit({ debitEntryId: splitPaymentDebitEntryId, reason });
      splitPaymentDebitEntryId = null;
    }

    if (walletDebitEntryId) {
      try {
        const smLedgerService = require("../../services/smLedgerService.js");
        await smLedgerService.reverseDebit(walletDebitEntryId);
        logger.info("confirmBooking: SM Money debit reversed", { smDebitEntryId: walletDebitEntryId, reason });
        walletDebitEntryId = null;
      } catch (reverseErr) {
        logger.error("confirmBooking: CRITICAL — failed to reverse SM Money debit", { smDebitEntryId: walletDebitEntryId, reason, error: reverseErr.message });
      }
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
        originalAmount,
        couponCode,
        boardingPoint,    // { name, time, lat, lng } — now persisted
        droppingPoint,    // { name, time, lat, lng } — now persisted
        bookedFrom,       // User's searched origin (e.g., "Bardibas") — persisted on Booking
        bookedTo,         // User's searched destination (e.g., "Kathmandu") — persisted on Booking
        bookedDepartureTime, // Stop-specific departure time (resolved by search)
        bookedArrivalTime,   // Stop-specific arrival time (resolved by search)
        passengerDetails, // [{ name, age, gender, seatNo }] — DoT compliance
        smMoneyToUse,     // SM Money amount to debit (split payment)
      } = req.body;

      // ================================================================
      // STEP 1: PRE-SIDE-EFFECT VALIDATION & CONFIRMATION QUOTE
      // Must occur BEFORE any payment debit, verification, transaction
      // creation, or seat locking.
      // ================================================================
      const requestValidationResult = validatePassengerBookingConfirmationRequest({
        gateway,
        tempBookingId,
      });
      if (!requestValidationResult.ok) {
        return res.status(requestValidationResult.statusCode).json(requestValidationResult.body);
      }

      const userId = req.dbUser._id;
      const scheduleId = req.bookingHold.tripId;
      const seatNumbers = req.bookingHold.seatNumbers;
      const normalizedSeats = seatNumbers;

      lockUserId = userId;
      lockTripId = scheduleId;

      const confirmationQuoteResult = await buildPassengerBookingConfirmationQuote({
        gateway,
        tempBookingId,
        paymentAmount,
        originalAmount,
        couponCode,
        smMoneyToUse,
        userId,
        scheduleId,
        activeRole: req.userInfo.activeRole,
      });
      if (!confirmationQuoteResult.ok) {
        return res.status(confirmationQuoteResult.statusCode).json(confirmationQuoteResult.body);
      }
      const {
        discountAmount,
        finalAmount,
        couponUsed,
        appliedCouponCode,
        smMoneyApplied,
        gatewayAmount,
      } = confirmationQuoteResult.quote;

      const smLedgerService = require("../../services/smLedgerService.js");

      // ================================================================
      // STEP 2: DEBIT SM MONEY VIA FIFO (if applicable)
      // ================================================================
      const splitPaymentResult = await debitPassengerSplitPayment({ gateway, userId, amount: smMoneyApplied, tempBookingId });
      if (!splitPaymentResult.ok) {
        return res.status(splitPaymentResult.statusCode).json(splitPaymentResult.body);
      }
      splitPaymentDebitEntryId = splitPaymentResult.debitEntryId;

      // ================================================================
      // STEP 3: GATEWAY PAYMENT VERIFICATION
      // ================================================================
      const esewaVerificationResult = await verifyPassengerEsewaPayment({
        gateway,
        paymentId,
        gatewayAmount,
        userId,
      });

      if (!esewaVerificationResult.ok) {
        await _reverseInternalMoneyDebitIfNeeded(
          esewaVerificationResult.compensationReason
        );

        return res
          .status(esewaVerificationResult.statusCode)
          .json(esewaVerificationResult.body);
      }

      if (gateway === "wallet") {
        const walletPaymentResult = await debitPassengerWalletPayment({ userId, amount: smMoneyApplied, tempBookingId });
        if (!walletPaymentResult.ok) {
          return res.status(walletPaymentResult.statusCode).json(walletPaymentResult.body);
        }
        walletDebitEntryId = walletPaymentResult.debitEntryId;
      }

      const internalMoneyDebitEntryId = walletDebitEntryId || splitPaymentDebitEntryId || null;

      // ================================================================
      // STEP 4: WRITE TRANSACTION RECORD — PAYMENT_RECEIVED
      // ================================================================
      const paymentTransactionResult = await createPassengerBookingPaymentTransaction({
        userId,
        scheduleId,
        seatNumbers: normalizedSeats,
        gateway,
        paymentId,
        originalAmount,
        paymentAmount,
        gatewayAmount,
        smMoneyApplied,
        tempBookingId,
        internalMoneyDebitEntryId,
      });

      txnRecord = paymentTransactionResult.transaction;
      const currentGatewayFeeRate = paymentTransactionResult.gatewayFeeRate;

      // ================================================================
      // STEP 5: VERIFY TRIP STATUS & BOOKING CUTOFF
      // ================================================================
      const postPaymentTripResult = await validatePassengerPostPaymentTrip({
        scheduleId,
        transactionId: txnRecord._id,
      });

      if (!postPaymentTripResult.ok) {
        await Transaction.findByIdAndUpdate(txnRecord._id, {
          status: "DISPUTED",
          disputeReason: postPaymentTripResult.disputeReason,
        });
        await _reverseInternalMoneyDebitIfNeeded(
          postPaymentTripResult.compensationReason
        );
        await _sendDisputeAdminAlert(
          txnRecord,
          postPaymentTripResult.adminAlertReason
        );
        return res
          .status(postPaymentTripResult.statusCode)
          .json(postPaymentTripResult.body);
      }

      const trip = postPaymentTripResult.trip;

      // ================================================================
      // STEP 6: ATOMIC SEAT LOCK
      // ================================================================
      const seatCommitmentResult = await commitPassengerSeats({
        scheduleId,
        userId,
        seatNumbers: normalizedSeats,
        transactionId: txnRecord._id,
      });

      if (!seatCommitmentResult.ok) {
        if (seatCommitmentResult.rollbackRequired) {
          await rollbackPassengerSeatLocks({
            tripId: scheduleId,
            seatNumbers: normalizedSeats,
            userId,
          });
        }

        await Transaction.findByIdAndUpdate(txnRecord._id, {
          status: "DISPUTED",
          disputeReason: seatCommitmentResult.disputeReason,
        });

        await _reverseInternalMoneyDebitIfNeeded(
          seatCommitmentResult.compensationReason
        );

        await _sendDisputeAdminAlert(
          txnRecord,
          seatCommitmentResult.adminAlertReason
        );

        return res
          .status(seatCommitmentResult.statusCode)
          .json(seatCommitmentResult.body);
      }

      seatsLocked = true;
      lockedSeatNumbers = seatCommitmentResult.lockedSeatNumbers;

      // ================================================================
      // STEP 8: CREATE BOOKING RECORD
      // ================================================================
      try {
        const bookingPersistenceResult = await persistPassengerBooking({
          userId,
          scheduleId,
          trip,
          bookedFrom,
          bookedTo,
          bookedDepartureTime,
          bookedArrivalTime,
          seatNumbers: normalizedSeats,
          passengerDetails,
          boardingPoint,
          droppingPoint,
          originalAmount,
          couponUsed,
          appliedCouponCode,
          discountAmount,
          finalAmount,
          smMoneyApplied,
          gatewayAmount,
          gatewayFeeRate: currentGatewayFeeRate,
          internalMoneyDebitEntryId,
          gateway,
          paymentId,
        });

        booking = bookingPersistenceResult.booking;
        ticketId = bookingPersistenceResult.ticketId;
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

        await rollbackPassengerSeatLocks({
          tripId: scheduleId,
          seatNumbers: normalizedSeats,
          userId,
        });
        await _reverseInternalMoneyDebitIfNeeded(failReason);
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
        const reconciliationResult =
          await reconcilePassengerTransactionSuccess({
            transactionId: txnRecord._id,
            bookingId: booking._id,
            ticketId,
          });

        if (!reconciliationResult.ok) {
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
      committedBookingResponse = buildCommittedBookingResponse(booking, ticketId, {
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

      if (internalMoneyDebitEntryId) {
        try {
          const SMLedger = require("../../models/smLedgerModel");
          await SMLedger.updateOne(
            { _id: internalMoneyDebitEntryId },
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
        await sendBookingConfirmedNotification({
          userId,
          ticketId,
          metadata: {
            scheduleId,
            seats: normalizedSeats,
            originalAmount,
            discountAmount,
            finalAmount,
            smMoneyUsed: smMoneyApplied,
            gatewayAmount,
            couponCode: appliedCouponCode,
          },
        });
      } catch (notifErr) {
        logger.warn('confirmBooking: Notification failed post-commit', { error: notifErr.message });
      }

      return res.status(201).json(committedBookingResponse);
  } catch (error) {
    logger.error("confirmBooking: Unexpected error in booking flow", {
      error: error.message,
      stack: error.stack,
      txnId: txnRecord?._id,
      walletDebitEntryId,
      splitPaymentDebitEntryId,
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
    await _reverseInternalMoneyDebitIfNeeded(`Unexpected crash: ${error.message}`);

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
        await rollbackPassengerSeatLocks({
          tripId: lockTripId,
          seatNumbers: lockedSeatNumbers,
          userId: lockUserId,
        });
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

module.exports = {
  prepareBooking,
  confirmBooking,
};
