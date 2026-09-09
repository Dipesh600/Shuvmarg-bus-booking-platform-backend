"use strict";

const { withMongoTransaction } = require("../../../shared/with-mongo-transaction");
const { createBudgetedRefund } = require("../../../shared/refund-budget");
const { createPassengerBookingCancellationSeatService } = require("../../booking/passenger-booking-cancellation/passenger-booking-cancellation-seat.service");
const bookingSms = require("../../notifications/outbox/booking-sms.service");
const createTripCancellationService = ({ mongoose, Booking, Trip, Seat, User, transitionPolicy,
  clawbackCashback, smsService = bookingSms }) => {
  const cancelTrip = async ({ tripId, fleetId, adminId, reason }) => withMongoTransaction(mongoose, null, async session => {
    const trip = await Trip.findOne({ _id: tripId, busId: fleetId }).session(session);
    if (!trip) return { statusCode: 404, message: "Trip not found." };
    if (trip.status === "cancelled") return { trip };
    if (!transitionPolicy.canTransition(trip.status, "cancelled")) {
      return { statusCode: 409, message: "Trip status changed; cancellation is no longer allowed." };
    }
    trip.status = "cancelled";
    trip.cancelledBy = adminId;
    trip.cancellationReason = reason;
    await trip.save({ session });
    const bookings = await Booking.find({ tripId, status: "booked" }).session(session);
    const users = User && bookings.length ? await User.find({ _id: { $in: bookings.map(row => row.userId) } })
      .select("phone").session(session).lean() : [];
    const phones = new Map(users.map(user => [String(user._id), user.phone]));
    const seats = await Seat.findOne({ tripId }).session(session);
    if (bookings.length && !seats) throw new Error("Trip seat data is missing; cancellation requires review");
    for (const booking of bookings) {
      const claimed = await Booking.updateOne({ _id: booking._id, status: "booked" },
        { $set: { status: "cancelled" } }, { session });
      if (claimed.modifiedCount !== 1) throw new Error("Booking cancellation changed concurrently");
      const refund = await createBudgetedRefund({ userId: booking.userId, bookingId: booking._id,
        originalAmount: booking.totalAmount, refundAmount: booking.totalAmount,
        reason: "Trip Cancelled by Operator", destination: null,
        remarks: booking.totalAmount > 0 ? "Waiting for passenger refund destination" : null,
        status: booking.totalAmount > 0 ? "pending" : "not_applicable" }, session);
      await clawbackCashback(booking._id, { session });
      createPassengerBookingCancellationSeatService().freeSeats(seats, booking.seats);
      booking.status = "cancelled";
      booking.refundId = refund._id;
      booking.cancellationReason = reason;
      booking.cancellationRequestedAt = new Date();
      booking.cancelledBy = "admin";
      await booking.save({ session });
      const phone = phones.get(String(booking.userId));
      if (phone) await smsService.enqueueBookingCancelled({ booking, refund, phone }, { session });
    }
    if (seats) await seats.save({ session });
    return { trip };
  });
  return { cancelTrip };
};

module.exports = { createTripCancellationService };
