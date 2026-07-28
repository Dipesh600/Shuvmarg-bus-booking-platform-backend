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

    const booking = await repository.findBookingByTicketId(ticketId);
    if (!booking) {
      throw new PassengerBookingCancellationValidationError(404, "Booking not found");
    }

    if (booking.userId.toString() !== userId) {
      throw new PassengerBookingCancellationValidationError(403, "You are not authorized to cancel this booking");
    }

    if (booking.status !== "booked") {
      throw new PassengerBookingCancellationValidationError(400, `Cannot cancel a booking with status '${booking.status}'`);
    }

    const trip = await repository.findTripById(booking.tripId);
    if (!trip) {
      throw new PassengerBookingCancellationValidationError(404, "Trip details not found.");
    }

    const estimate = await refundCalculatorService.calculateRefund({
      totalAmount: booking.totalAmount || 0,
      tripDate: trip.tripDate,
      departureTime: trip.departureTime,
    });

    if (!estimate.eligible) {
      throw new PassengerBookingCancellationValidationError(400, estimate.reason);
    }

    // Free the seats in Seat collection
    const seatDoc = await repository.findSeatByTripId(booking.tripId);
    if (!seatDoc) {
      throw new PassengerBookingCancellationValidationError(404, "Seat data not found for trip.");
    }

    seatService.freeSeats(seatDoc, booking.seats);
    await repository.saveSeat(seatDoc);

    const refundInfo = await refundService.processRefundAndClawback(
      booking,
      userId,
      estimate,
      cancelReason,
      requestBody
    );

    booking.status = "cancelled";
    booking.cancellationReason = cancelReason || "User cancelled";
    booking.cancellationRequestedAt = new Date();
    booking.cancelledBy = "user";
    booking.refundId = refundInfo._id;

    await repository.saveBooking(booking);

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
