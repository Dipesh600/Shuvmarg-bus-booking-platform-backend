'use strict';

/**
 * Service for passenger booking persistence.
 */
function createPassengerBookingPersistenceService({
  repository,
  mapper,
  generateTicketId,
  createTimestamp = () => Date.now(),
}) {
  if (!repository || typeof repository.createBooking !== 'function') {
    throw new TypeError('passengerBookingPersistenceService requires repository with createBooking method');
  }
  if (
    !mapper ||
    typeof mapper.formatPassengerBookingPassengers !== 'function' ||
    typeof mapper.mapPassengerBookingPaymentMethod !== 'function' ||
    typeof mapper.mapPassengerBookingPersistencePayload !== 'function'
  ) {
    throw new TypeError('passengerBookingPersistenceService requires valid mapper functions');
  }
  if (typeof generateTicketId !== 'function') {
    throw new TypeError('passengerBookingPersistenceService requires generateTicketId function');
  }
  if (typeof createTimestamp !== 'function') {
    throw new TypeError('passengerBookingPersistenceService requires createTimestamp function');
  }

  return {
    async persistPassengerBooking(params) {
      const ticketId = generateTicketId();

      const formattedPassengers = mapper.formatPassengerBookingPassengers({
        passengerDetails: params.passengerDetails,
        seatNumbers: params.seatNumbers,
      });

      const paymentMethod = mapper.mapPassengerBookingPaymentMethod({
        gateway: params.gateway,
        smMoneyApplied: params.smMoneyApplied,
      });

      const transactionId =
        params.paymentId || `sm_wallet_${createTimestamp()}`;

      const payload = mapper.mapPassengerBookingPersistencePayload({
        userId: params.userId,
        scheduleId: params.scheduleId,
        trip: params.trip,
        bookedFrom: params.bookedFrom,
        bookedTo: params.bookedTo,
        bookedDepartureTime: params.bookedDepartureTime,
        bookedArrivalTime: params.bookedArrivalTime,
        seatNumbers: params.seatNumbers,
        formattedPassengers,
        boardingPoint: params.boardingPoint,
        droppingPoint: params.droppingPoint,
        originalAmount: params.originalAmount,
        couponUsed: params.couponUsed,
        appliedCouponCode: params.appliedCouponCode,
        discountAmount: params.discountAmount,
        finalAmount: params.finalAmount,
        smMoneyApplied: params.smMoneyApplied,
        gatewayAmount: params.gatewayAmount,
        gatewayFeeRate: params.gatewayFeeRate,
        internalMoneyDebitEntryId: params.internalMoneyDebitEntryId,
        paymentMethod,
        transactionId,
        ticketId,
      });

      const booking = await repository.createBooking(payload, { attemptId: params.paymentAttemptId,
        processingToken: params.paymentProcessingToken, refundPolicySnapshot: params.refundPolicySnapshot });

      return {
        booking,
        ticketId,
      };
    },
  };
}

module.exports = {
  createPassengerBookingPersistenceService,
};
