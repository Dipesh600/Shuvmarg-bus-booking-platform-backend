'use strict';

function reconciliationRequired(state) {
  return {
    statusCode: 409,
    body: {
      success: false,
      message:
        'Your payment and booking were received, but final reconciliation is still required.',
      errorCode: 'BOOKING_RECONCILIATION_REQUIRED',
      caseId: state.txnRecord?._id,
    },
  };
}

function createPassengerBookingConfirmationFailureHandler(deps) {
  return async function handlePassengerBookingConfirmationFailure({
    error,
    res,
    state,
  }) {
    deps.logger.error('confirmBooking: Unexpected error in booking flow', {
      error: error.message,
      stack: error.stack,
      txnId: state.txnRecord?._id,
      walletDebitEntryId: state.walletDebitEntryId,
      splitPaymentDebitEntryId: state.splitPaymentDebitEntryId,
      bookingCreated: state.bookingCreated,
      bookingCommitted: state.bookingCommitted,
    });

    if (res.headersSent) return null;
    if (state.bookingCommitted && state.committedBookingResponse) {
      return { statusCode: 201, body: state.committedBookingResponse };
    }
    if (state.bookingCreated) return reconciliationRequired(state);

    const reason = `Unexpected crash: ${error.message}`;
    await deps._reverseInternalMoneyDebitIfNeeded(state, reason);

    if (state.txnRecord) {
      try {
        await deps.markPassengerPaymentDisputed({
          transactionId: state.txnRecord._id,
          disputeReason: reason,
          failureReason: error.message,
        });
        await deps.sendPassengerPaymentDisputeAdminAlert({
          transaction: state.txnRecord,
          reason,
        });
      } catch (updateError) {
        deps.logger.error(
          'confirmBooking: CRITICAL — failed to mark transaction DISPUTED',
          { txnId: state.txnRecord._id, error: updateError.message }
        );
      }
    }

    if (
      state.seatsLocked &&
      state.lockedSeatNumbers.length > 0 &&
      state.lockUserId &&
      state.lockTripId
    ) {
      try {
        await deps.rollbackPassengerSeatLocks({
          tripId: state.lockTripId,
          seatNumbers: state.lockedSeatNumbers,
          userId: state.lockUserId,
        });
      } catch (rollbackError) {
        deps.logger.error('confirmBooking: seat rollback failed in outer catch', {
          error: rollbackError.message,
        });
      }
    }

    if (state.txnRecord) {
      return {
        statusCode: 500,
        body: {
          success: false,
          message: `Your payment was received but an unexpected error occurred. Your case ID is ${state.txnRecord._id}. We will resolve this within 2 hours.`,
          caseId: state.txnRecord._id,
          errorCode: 'BOOKING_CREATION_FAILED_PAYMENT_RECEIVED',
        },
      };
    }
    return {
      statusCode: 500,
      body: {
        success: false,
        message: 'Internal Server Error during booking confirmation!',
      },
    };
  };
}

module.exports = {
  createPassengerBookingConfirmationFailureHandler,
};
