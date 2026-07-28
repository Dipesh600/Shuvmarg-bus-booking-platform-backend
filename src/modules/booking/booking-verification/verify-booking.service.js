const repository = require("./booking-verification.repository");

const verifyPassengerBooking = async ({ ticketId, userId }) => {
  const booking = await repository.findPassengerBookingByTicketId({ ticketId, userId });

  if (!booking) {
    return {
      statusCode: 404,
      responseBody: {
        success: false,
        message: "Booking not found!",
      },
    };
  }

  return {
    statusCode: 200,
    responseBody: {
      success: true,
      message: "Booking verified successfully!",
      data: {
        bookingId: booking._id,
        ticketId: booking.ticketId,
        scheduleDetails: booking.scheduleId,
        seats: booking.seats,
        originalAmount: booking.originalAmount,
        discountAmount: booking.discountAmount,
        totalAmount: booking.totalAmount,
        couponUsed: booking.couponCode,
        gateway: booking.gateway,
        transactionId: booking.transactionId,
        status: booking.status,
        bookedAt: booking.bookedAt,
      },
    },
  };
};

module.exports = {
  verifyPassengerBooking,
};
