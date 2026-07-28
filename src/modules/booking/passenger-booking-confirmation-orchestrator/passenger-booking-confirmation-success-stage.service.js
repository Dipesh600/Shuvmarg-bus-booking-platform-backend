'use strict';

const reconciliationRequired = (transactionId) => ({
  ok: false,
  statusCode: 409,
  body: {
    success: false,
    message:
      'Your payment and booking were received, but final reconciliation is still required.',
    errorCode: 'BOOKING_RECONCILIATION_REQUIRED',
    caseId: transactionId,
  },
});

function createPassengerBookingConfirmationSuccessStage(deps) {
  return async function runPassengerBookingConfirmationSuccessStage({
    req,
    state,
  }) {
    try {
      const reconciliationResult =
        await deps.reconcilePassengerTransactionSuccess({
        transactionId: state.txnRecord._id,
        bookingId: state.booking._id,
        ticketId: state.ticketId,
      });
      if (!reconciliationResult.ok) {
        deps.logger.error(
          '🚨 confirmBooking: Transaction SUCCESS transition failed (returned null)',
          {
            txnId: state.txnRecord._id,
            bookingId: state.booking._id,
            ticketId: state.ticketId,
          }
        );
        return reconciliationRequired(state.txnRecord._id);
      }
    } catch (error) {
      deps.logger.error(
        '🚨 confirmBooking: Transaction SUCCESS transition threw exception',
        {
          txnId: state.txnRecord._id,
          bookingId: state.booking._id,
          ticketId: state.ticketId,
          error: error.message,
        }
      );
      return reconciliationRequired(state.txnRecord._id);
    }

    state.committedBookingResponse =
      deps.buildPassengerCommittedBookingResponse({
        booking: state.booking,
        ticketId: state.ticketId,
        originalAmount: state.originalAmount,
        discountAmount: state.discountAmount,
        smMoneyApplied: state.smMoneyApplied,
        gatewayAmount: state.gatewayAmount,
        finalAmount: state.finalAmount,
        appliedCouponCode: state.appliedCouponCode,
        paymentId: state.paymentId,
        gateway: state.gateway,
        normalizedSeats: state.normalizedSeats,
      });
    state.bookingCommitted = true;

    await deps.completePassengerBookingPostCommit({
      booking: state.booking,
      ticketId: state.ticketId,
      holdId: req.bookingHold._id,
      userId: state.userId,
      activeRole: req.userInfo.activeRole,
      scheduleId: state.scheduleId,
      originalAmount: state.originalAmount,
      discountAmount: state.discountAmount,
      smMoneyApplied: state.smMoneyApplied,
      gatewayAmount: state.gatewayAmount,
      finalAmount: state.finalAmount,
      appliedCouponCode: state.appliedCouponCode,
      paymentId: state.paymentId,
      gateway: state.gateway,
      normalizedSeats: state.normalizedSeats,
      couponUsed: state.couponUsed,
      internalMoneyDebitEntryId: state.internalMoneyDebitEntryId,
      committedBookingResponse: state.committedBookingResponse,
    });

    return {
      ok: true,
      statusCode: 201,
      body: state.committedBookingResponse,
    };
  };
}

module.exports = {
  createPassengerBookingConfirmationSuccessStage,
};
