const {
  verifyPassengerEsewaPayment,
} = require("../../src/modules/booking/passenger-esewa-verification");
const logger                 = require("../../utils/logger.js");

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
} = require("../../src/modules/booking/passenger-split-payment");

const {
  reversePassengerInternalMoneyDebits,
} = require("../../src/modules/booking/passenger-internal-money-compensation");

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

const {
  markPassengerPaymentDisputed,
  sendPassengerPaymentDisputeAdminAlert,
  notifyPassengerPaymentDispute,
} = require("../../src/modules/booking/passenger-payment-dispute");

const {
  buildPassengerCommittedBookingResponse,
  completePassengerBookingPostCommit,
} = require("../../src/modules/booking/passenger-booking-post-commit");

// Step 1: Prepare booking with coupon validation (before payment)
const prepareBooking = preparePassengerBooking;

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
    const result = await reversePassengerInternalMoneyDebits({
      splitPaymentDebitEntryId,
      walletDebitEntryId,
      reason,
    });

    splitPaymentDebitEntryId = result.splitPaymentDebitEntryId;
    walletDebitEntryId = result.walletDebitEntryId;
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
        await markPassengerPaymentDisputed({
          transactionId: txnRecord._id,
          disputeReason: postPaymentTripResult.disputeReason,
        });
        await _reverseInternalMoneyDebitIfNeeded(
          postPaymentTripResult.compensationReason
        );
        await sendPassengerPaymentDisputeAdminAlert({
          transaction: txnRecord,
          reason: postPaymentTripResult.adminAlertReason,
        });
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

        await markPassengerPaymentDisputed({
          transactionId: txnRecord._id,
          disputeReason: seatCommitmentResult.disputeReason,
        });

        await _reverseInternalMoneyDebitIfNeeded(
          seatCommitmentResult.compensationReason
        );

        await sendPassengerPaymentDisputeAdminAlert({
          transaction: txnRecord,
          reason: seatCommitmentResult.adminAlertReason,
        });

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

        await markPassengerPaymentDisputed({
          transactionId: txnRecord._id,
          disputeReason: failReason,
          failureReason: bookingError.message,
        });

        await rollbackPassengerSeatLocks({
          tripId: scheduleId,
          seatNumbers: normalizedSeats,
          userId,
        });
        await _reverseInternalMoneyDebitIfNeeded(failReason);
        await sendPassengerPaymentDisputeAdminAlert({
          transaction: txnRecord,
          reason: failReason,
        });
        await notifyPassengerPaymentDispute({
          userId,
          transaction: txnRecord,
          paymentId,
          amount: (gatewayAmount || 0) + (smMoneyApplied || 0),
        });

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
      committedBookingResponse = buildPassengerCommittedBookingResponse({
        booking,
        ticketId,
        originalAmount, discountAmount, smMoneyApplied, gatewayAmount,
        finalAmount, appliedCouponCode, paymentId, gateway, normalizedSeats,
      });
      bookingCommitted = true;

      // ================================================================
      // STEP 10: POST-BOOKING NON-CRITICAL WORK (ISOLATED)
      // ================================================================
      await completePassengerBookingPostCommit({
        booking,
        ticketId,
        holdId: req.bookingHold._id,
        userId,
        activeRole: req.userInfo.activeRole,
        scheduleId,
        originalAmount,
        discountAmount,
        smMoneyApplied,
        gatewayAmount,
        finalAmount,
        appliedCouponCode,
        paymentId,
        gateway,
        normalizedSeats,
        couponUsed,
        internalMoneyDebitEntryId,
        committedBookingResponse,
      });

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
        await markPassengerPaymentDisputed({
          transactionId: txnRecord._id,
          disputeReason: `Unexpected crash: ${error.message}`,
          failureReason: error.message,
        });
        await sendPassengerPaymentDisputeAdminAlert({
          transaction: txnRecord,
          reason: `Unexpected crash: ${error.message}`,
        });
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
