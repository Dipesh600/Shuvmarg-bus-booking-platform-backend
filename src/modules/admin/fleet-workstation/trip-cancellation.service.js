"use strict";

const createTripCancellationService = ({ Booking, Refund }) => {
  const cancelBookings = async (tripId) => {
    const bookings = await Booking.find({ tripId, status: "booked" });
    await Promise.all(
      bookings.map(async (booking) => {
        const refund = new Refund({
          userId: booking.userId,
          bookingId: booking._id,
          transactionId: booking.transactionId,
          originalAmount: booking.originalAmount,
          refundAmount: booking.totalAmount,
          reason: "Trip Cancelled by Operator",
          status: "pending",
        });
        await refund.save();
        booking.status = "cancelled";
        booking.refundId = refund._id;
        await booking.save();
      })
    );
  };
  return { cancelBookings };
};

module.exports = { createTripCancellationService };
