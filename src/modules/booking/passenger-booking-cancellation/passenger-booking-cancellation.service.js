const refundCalculatorService = require("../../../../services/refundCalculatorService");
const { PassengerBookingCancellationValidationError } = require("./passenger-booking-cancellation-validation.error");

const createPassengerBookingCancellationService = (
  repository,
  seatService,
  refundService,
  notificationService
) => {
  const cancelPassengerBooking = async (ticketId, userId, cancelReason, requestBody) => {
    if (!ticketId) {
      throw new PassengerBookingCancellationValidationError(400, "ticketId is required");
    }
    if (requestBody?.seats !== undefined || requestBody?.seatNumbers !== undefined) {
      throw new PassengerBookingCancellationValidationError(
        400, "Partial-seat cancellation is not supported. Cancel the complete booking."
      );
    }

    const committed = await repository.withTransaction(async (session) => {
      const booking = await repository.findBookingByTicketId(ticketId, session);
      if (!booking) {
        throw new PassengerBookingCancellationValidationError(404, "Booking not found");
      }

      if (booking.userId.toString() !== userId) {
        throw new PassengerBookingCancellationValidationError(403, "You are not authorized to cancel this booking");
      }

      if (booking.status !== "booked") {
        throw new PassengerBookingCancellationValidationError(400, `Cannot cancel a booking with status '${booking.status}'`);
      }

      const trip = await repository.findTripById(booking.tripId, session);
      if (!trip) {
        throw new PassengerBookingCancellationValidationError(404, "Trip details not found.");
      }

      const estimate = await refundCalculatorService.calculateRefund({
        totalAmount: booking.totalAmount || 0,
        tripDate: trip.tripDate,
        departureTime: trip.departureTime,
        policySnapshot: booking.refundPolicySnapshot,
        smMoneyUsed: booking.smMoneyUsed, gatewayAmount: booking.gatewayAmount, paymentMethod: booking.paymentMethod,
      });

      if (!estimate.eligible) {
        throw new PassengerBookingCancellationValidationError(400, estimate.reason);
      }

      // Free the seats in Seat collection
      const seatDoc = await repository.findSeatByTripId(booking.tripId, session);
      if (!seatDoc) {
        throw new PassengerBookingCancellationValidationError(404, "Seat data not found for trip.");
      }

      // Serialize all cancellation effects on the booking. A competing request
      // retries the transaction and observes cancelled status before moving money.
      if (!await repository.claimBooking(booking, session)) {
        throw new PassengerBookingCancellationValidationError(409, 'Booking cancellation is already being processed');
      }
      seatService.freeSeats(seatDoc, booking.seats);
      await repository.saveSeat(seatDoc, session);

      const refundInfo = await refundService.processRefundAndClawback(
        booking,
        userId,
        estimate,
        cancelReason,
        requestBody || {},
        session
      );

      booking.status = "cancelled";
      booking.cancellationReason = cancelReason || "User cancelled";
      booking.cancellationRequestedAt = new Date();
      booking.cancelledBy = "user";
      booking.refundId = refundInfo._id;

      await repository.saveBooking(booking, session);
      return { booking, estimate };
    });
    const { booking, estimate } = committed;

    await notificationService.sendCancellationNotifications(
      userId,
      booking,
      estimate
    );

    return {
      ticketId: booking.ticketId,
      status: "cancelled",
      refundAmount: estimate.refundAmount,
      cancellationCharge: estimate.cancellationCharge,
      refundPercentage: estimate.refundPercentage,
      appliedPolicy: estimate.appliedPolicy?.name || "Default",
      seats: booking.seats,
    };
  };

  return { cancelPassengerBooking };
};

module.exports = {
  createPassengerBookingCancellationService,
};
