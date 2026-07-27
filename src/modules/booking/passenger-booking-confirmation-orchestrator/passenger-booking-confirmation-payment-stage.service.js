'use strict';

function createPassengerBookingConfirmationPaymentStage(deps) {
  return async function runPassengerBookingConfirmationPaymentStage({ req, state }) {
    const {
      tempBookingId, paymentId, paymentAmount, gateway, originalAmount,
      couponCode, boardingPoint, droppingPoint, bookedFrom, bookedTo,
      bookedDepartureTime, bookedArrivalTime, passengerDetails, smMoneyToUse,
    } = req.body;

    Object.assign(state, {
      tempBookingId, paymentId, paymentAmount, gateway, originalAmount,
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
    state.scheduleId = req.bookingHold.tripId;
    state.normalizedSeats = req.bookingHold.seatNumbers;
    state.lockUserId = state.userId;
    state.lockTripId = state.scheduleId;

    const confirmationQuoteResult =
      await deps.buildPassengerBookingConfirmationQuote({
      gateway, tempBookingId, paymentAmount, originalAmount, couponCode,
      smMoneyToUse, userId: state.userId, scheduleId: state.scheduleId,
      activeRole: req.userInfo.activeRole,
    });
    if (!confirmationQuoteResult.ok) return confirmationQuoteResult;

    Object.assign(state, confirmationQuoteResult.quote);

    const splitPaymentResult = await deps.debitPassengerSplitPayment({
      gateway,
      userId: state.userId,
      amount: state.smMoneyApplied,
      tempBookingId,
    });
    if (!splitPaymentResult.ok) return splitPaymentResult;
    state.splitPaymentDebitEntryId = splitPaymentResult.debitEntryId;

    const esewaVerificationResult = await deps.verifyPassengerEsewaPayment({
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
      return esewaVerificationResult;
    }

    if (gateway === 'wallet') {
      const walletPaymentResult = await deps.debitPassengerWalletPayment({
        userId: state.userId,
        amount: state.smMoneyApplied,
        tempBookingId,
      });
      if (!walletPaymentResult.ok) return walletPaymentResult;
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
        paymentId,
        originalAmount,
        paymentAmount,
        gatewayAmount: state.gatewayAmount,
        smMoneyApplied: state.smMoneyApplied,
        tempBookingId,
        internalMoneyDebitEntryId: state.internalMoneyDebitEntryId,
      });

    state.txnRecord = paymentTransactionResult.transaction;
    state.currentGatewayFeeRate = paymentTransactionResult.gatewayFeeRate;
    return null;
  };
}

module.exports = {
  createPassengerBookingConfirmationPaymentStage,
};
