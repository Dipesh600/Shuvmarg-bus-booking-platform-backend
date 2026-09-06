const refundCalculatorService = require("../../../../services/refundCalculatorService");
const { PassengerBookingCancellationValidationError } = require("./passenger-booking-cancellation-validation.error");

const createPassengerBookingCancellationEstimateService = (repository) => {
  const estimatePassengerBookingCancellation = async (ticketId, userId) => {
    if (!ticketId) {
      throw new PassengerBookingCancellationValidationError(400, "ticketId is required");
    }

    const booking = await repository.findBookingByTicketId(ticketId);
    if (!booking) {
      throw new PassengerBookingCancellationValidationError(404, "Booking not found");
    }

    if (booking.userId.toString() !== userId) {
      throw new PassengerBookingCancellationValidationError(403, "You are not authorized to view this booking");
    }

    if (booking.status !== "booked") {
      throw new PassengerBookingCancellationValidationError(400, `Cannot cancel a booking with status '${booking.status}'`);
    }

    const trip = await repository.findTripById(booking.tripId);
    if (!trip) {
      throw new PassengerBookingCancellationValidationError(404, "Trip details not found");
    }

    const estimate = await refundCalculatorService.calculateRefund({
      totalAmount: booking.totalAmount || 0,
      tripDate: trip.tripDate,
      departureTime: booking.bookedDepartureTime || trip.departureTime,
        policySnapshot: booking.refundPolicySnapshot,
        smMoneyUsed: booking.smMoneyUsed, gatewayAmount: booking.gatewayAmount, paymentMethod: booking.paymentMethod,
    });

    return {
      ticketId: booking.ticketId,
      ticketFare: booking.totalAmount,
      eligible: estimate.eligible,
      reason: estimate.reason,
      refundAmount: estimate.refundAmount,
      cancellationCharge: estimate.cancellationCharge,
      gatewayDeduction: estimate.gatewayDeduction,
      refundPercentage: estimate.refundPercentage,
      hoursBeforeDeparture: estimate.hoursBeforeDeparture,
      appliedPolicy: estimate.appliedPolicy,
    };
  };

  return { estimatePassengerBookingCancellation };
};

module.exports = {
  createPassengerBookingCancellationEstimateService,
};
