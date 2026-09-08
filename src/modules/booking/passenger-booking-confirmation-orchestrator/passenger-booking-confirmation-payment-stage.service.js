'use strict';
const purchaseAuthorization = require('../../wallet/payment-authorization/purchase-authorization.service');
function createPassengerBookingConfirmationPaymentStage(deps) {
  return async function runPassengerBookingConfirmationPaymentStage({ req, state }) {
    const restoreClaim = async () => {
      if (!state.holdClaimed) return;
      await deps.restorePassengerHoldAfterFailedConfirmation({
        holdId: state.holdId,
        userId: state.userId,
        heldExpiresAt: state.holdExpiresAt,
      });
      state.holdClaimed = false;
    };
    const {
      tempBookingId, paymentId, paymentAmount, gateway,
      couponCode, boardingPoint, droppingPoint, bookedFrom, bookedTo,
      bookedDepartureTime, bookedArrivalTime, passengerDetails, smMoneyToUse,
    } = req.body;
    Object.assign(state, {
      tempBookingId, paymentId, paymentAmount, gateway,
      couponCode, boardingPoint, droppingPoint, bookedFrom, bookedTo,
      bookedDepartureTime, bookedArrivalTime, passengerDetails,
    });
    const requestValidationResult =
      deps.validatePassengerBookingConfirmationRequest({
      gateway,
      tempBookingId,
    });
    if (!requestValidationResult.ok) return requestValidationResult;
    state.userId = req.dbUser._id;
    // A client-supplied wallet reference is not a unique payment identity.
    if (gateway === 'wallet') state.paymentId = `sm_wallet_${state.userId}_${tempBookingId}`;
    state.scheduleId = req.bookingHold.tripId;
    state.holdId = req.bookingHold._id;
    state.holdExpiresAt = req.bookingHold.expiresAt;
    state.normalizedSeats = req.bookingHold.seatNumbers;
    state.originalAmount = req.bookingHold.originalAmount;
    state.lockUserId = state.userId;
    state.lockTripId = state.scheduleId;
    const confirmationQuoteResult = req.paymentAttemptQuote
      ? { ok: true, quote: req.paymentAttemptQuote }
      : await deps.buildPassengerBookingConfirmationQuote({
        gateway, tempBookingId, paymentAmount,
        originalAmount: state.originalAmount, couponCode,
        smMoneyToUse, userId: state.userId, scheduleId: state.scheduleId,
        activeRole: req.userInfo.activeRole,
      });
    if (!confirmationQuoteResult.ok) return confirmationQuoteResult;
    Object.assign(state, confirmationQuoteResult.quote);
    state.paymentAttemptId = req.paymentAttemptId;
    state.paymentProcessingToken = req.paymentProcessingToken;
    state.refundPolicySnapshot = req.refundPolicySnapshot;
    if (state.smMoneyApplied > 0) {
      const authorization = req.paymentAttemptId
        ? await deps.authorizeReservedPayment({ attemptId: req.paymentAttemptId, processingToken: req.paymentProcessingToken,
          userId: state.userId, amount: state.smMoneyApplied })
        : await purchaseAuthorization.authorizeCheckout({ user: req.dbUser, hold: req.bookingHold,
          body: req.body, quote: state });
      if (!authorization.ok) return authorization;
      if (req.paymentAttemptId) state.splitPaymentDebitEntryId = authorization.debitEntryId;
    }
    state.holdClaimed = await deps.claimPassengerHoldForConfirmation({
      holdId: state.holdId,
      userId: state.userId,
      heldExpiresAt: state.holdExpiresAt,
    });
    if (!state.holdClaimed) {
      return {
        ok: false,
        statusCode: 409,
        body: {
          success: false,
          message:
            'The booking hold is already being confirmed or has expired.',
          errorCode: 'BOOKING_HOLD_UNAVAILABLE',
        },
      };
    }
    const splitPaymentResult = state.splitPaymentDebitEntryId
      ? { ok: true, debitEntryId: state.splitPaymentDebitEntryId }
      : await deps.debitPassengerSplitPayment({
      gateway, userId: state.userId, amount: state.smMoneyApplied,
      refundMoneyApplied: state.refundMoneyApplied,
      restrictedMoneyApplied: state.restrictedMoneyApplied,
      tempBookingId,
    });
    if (!splitPaymentResult.ok) {
      await restoreClaim();
      return splitPaymentResult;
    }
    state.splitPaymentDebitEntryId = splitPaymentResult.debitEntryId;
    const esewaVerificationResult = req.paymentAttemptId && req.providerPaymentVerified === true
      ? { ok: true }
      : await deps.verifyPassengerEsewaPayment({
      gateway,
      paymentId,
      gatewayAmount: state.gatewayAmount,
      userId: state.userId,
    });
    if (!esewaVerificationResult.ok) {
      await deps._reverseInternalMoneyDebitIfNeeded(
        state,
        esewaVerificationResult.compensationReason
      );
      await restoreClaim();
      return esewaVerificationResult;
    }

    if (gateway === 'wallet') {
      const walletPaymentResult = await deps.debitPassengerWalletPayment({
        userId: state.userId, amount: state.smMoneyApplied,
        refundMoneyApplied: state.refundMoneyApplied,
        restrictedMoneyApplied: state.restrictedMoneyApplied,
        tempBookingId,
      });
      if (!walletPaymentResult.ok) {
        await restoreClaim();
        return walletPaymentResult;
      }
      state.walletDebitEntryId = walletPaymentResult.debitEntryId;
    }

    state.internalMoneyDebitEntryId =
      state.walletDebitEntryId || state.splitPaymentDebitEntryId || null;

    const paymentTransactionResult =
      await deps.createPassengerBookingPaymentTransaction({
        userId: state.userId,
        scheduleId: state.scheduleId,
        seatNumbers: state.normalizedSeats,
        gateway,
        paymentId: state.paymentId,
        originalAmount: state.originalAmount,
        paymentAmount,
        gatewayAmount: state.gatewayAmount,
        smMoneyApplied: state.smMoneyApplied,
        tempBookingId,
        internalMoneyDebitEntryId: state.internalMoneyDebitEntryId,
        ...(state.paymentAttemptId ? { paymentAttemptId: state.paymentAttemptId, paymentProcessingToken: state.paymentProcessingToken } : {}),
      });

    state.txnRecord = paymentTransactionResult.transaction;
    state.currentGatewayFeeRate = paymentTransactionResult.gatewayFeeRate;
    return null;
  };
}

module.exports = {
  createPassengerBookingConfirmationPaymentStage,
};
