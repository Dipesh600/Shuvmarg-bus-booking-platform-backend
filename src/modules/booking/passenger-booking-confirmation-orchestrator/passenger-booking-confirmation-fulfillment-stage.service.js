'use strict';

function createPassengerBookingConfirmationFulfillmentStage(deps) {
  return async function runPassengerBookingConfirmationFulfillmentStage(state) {
    const postPaymentTripResult = await deps.validatePassengerPostPaymentTrip({
      scheduleId: state.scheduleId,
      transactionId: state.txnRecord._id,
    });

    if (!postPaymentTripResult.ok) {
      await deps.markPassengerPaymentDisputed({
        transactionId: state.txnRecord._id,
        disputeReason: postPaymentTripResult.disputeReason,
      });
      await deps._reverseInternalMoneyDebitIfNeeded(
        state,
        postPaymentTripResult.compensationReason
      );
      await deps.sendPassengerPaymentDisputeAdminAlert({
        transaction: state.txnRecord,
        reason: postPaymentTripResult.adminAlertReason,
      });
      return postPaymentTripResult;
    }
    state.trip = postPaymentTripResult.trip;

    const seatCommitmentResult = await deps.commitPassengerSeats({
      scheduleId: state.scheduleId,
      userId: state.userId,
      seatNumbers: state.normalizedSeats,
      transactionId: state.txnRecord._id,
    });

    if (!seatCommitmentResult.ok) {
      if (seatCommitmentResult.rollbackRequired) {
        await deps.rollbackPassengerSeatLocks({
          tripId: state.scheduleId,
          seatNumbers: state.normalizedSeats,
          userId: state.userId,
        });
      }
      await deps.markPassengerPaymentDisputed({
        transactionId: state.txnRecord._id,
        disputeReason: seatCommitmentResult.disputeReason,
      });
      await deps._reverseInternalMoneyDebitIfNeeded(
        state,
        seatCommitmentResult.compensationReason
      );
      await deps.sendPassengerPaymentDisputeAdminAlert({
        transaction: state.txnRecord,
        reason: seatCommitmentResult.adminAlertReason,
      });
      return seatCommitmentResult;
    }

    state.seatsLocked = true;
    state.lockedSeatNumbers = seatCommitmentResult.lockedSeatNumbers;

    try {
      const bookingPersistenceResult = await deps.persistPassengerBooking({
        userId: state.userId,
        scheduleId: state.scheduleId,
        trip: state.trip,
        bookedFrom: state.bookedFrom,
        bookedTo: state.bookedTo,
        bookedDepartureTime: state.bookedDepartureTime,
        bookedArrivalTime: state.bookedArrivalTime,
        seatNumbers: state.normalizedSeats,
        passengerDetails: state.passengerDetails,
        boardingPoint: state.boardingPoint,
        droppingPoint: state.droppingPoint,
        originalAmount: state.originalAmount,
        couponUsed: state.couponUsed,
        appliedCouponCode: state.appliedCouponCode,
        discountAmount: state.discountAmount,
        finalAmount: state.finalAmount,
        smMoneyApplied: state.smMoneyApplied,
        gatewayAmount: state.gatewayAmount,
        gatewayFeeRate: state.currentGatewayFeeRate,
        internalMoneyDebitEntryId: state.internalMoneyDebitEntryId,
        gateway: state.gateway,
        paymentId: state.paymentId,
      });
      state.booking = bookingPersistenceResult.booking;
      state.ticketId = bookingPersistenceResult.ticketId;
      state.bookingCreated = true;
      return null;
    } catch (error) {
      const reason = `Booking.create() failed: ${error.message}`;
      deps.logger.error(
        '🚨 confirmBooking: BOOKING CREATION FAILED after payment',
        {
          txnId: state.txnRecord._id, paymentId: state.paymentId,
          userId: state.userId, scheduleId: state.scheduleId,
          seats: state.normalizedSeats, error: error.message, stack: error.stack,
        }
      );
      await deps.markPassengerPaymentDisputed({
        transactionId: state.txnRecord._id,
        disputeReason: reason,
        failureReason: error.message,
      });
      await deps.rollbackPassengerSeatLocks({
        tripId: state.scheduleId,
        seatNumbers: state.normalizedSeats,
        userId: state.userId,
      });
      await deps._reverseInternalMoneyDebitIfNeeded(state, reason);
      await deps.sendPassengerPaymentDisputeAdminAlert({
        transaction: state.txnRecord,
        reason,
      });
      await deps.notifyPassengerPaymentDispute({
        userId: state.userId,
        transaction: state.txnRecord,
        paymentId: state.paymentId,
        amount: (state.gatewayAmount || 0) + (state.smMoneyApplied || 0),
      });
      return {
        ok: false,
        statusCode: 500,
        body: {
          success: false,
          message: `Your payment was received but ticket creation failed. Your case ID is ${state.txnRecord._id}. We will resolve this within 2 hours.`,
          caseId: state.txnRecord._id,
          errorCode: 'BOOKING_CREATION_FAILED_PAYMENT_RECEIVED',
        },
      };
    }
  };
}

module.exports = {
  createPassengerBookingConfirmationFulfillmentStage,
};
