const Booking = require("../../../../models/bookTicketModel.js");
const Trip = require("../../../../models/tripModel");
const Seat = require("../../../../models/seatsModel.js");
const Refund = require("../../../../models/refundModel");
const UserDeviceInfo = require("../../../../models/userDeviceInfoModel.js");
const mongoose = require('mongoose');

function createPassengerBookingCancellationRepository() {
  return {
    async withTransaction(work) {
      const session = await mongoose.startSession();
      try {
        return await session.withTransaction(() => work(session));
      } finally {
        await session.endSession();
      }
    },

    async claimBooking(booking, session) {
      const result = await Booking.updateOne(
        { _id: booking._id, userId: booking.userId, status: 'booked' },
        { $set: { status: 'cancelled' } }, { session }
      );
      return result.modifiedCount === 1;
    },

    async findBookingByTicketId(ticketId, session) {
      const query = Booking.findOne({ ticketId });
      return await (session ? query.session(session) : query);
    },

    async findTripById(tripId, session) {
      const query = Trip.findById(tripId);
      return await (session ? query.session(session) : query);
    },

    async findSeatByTripId(tripId, session) {
      const query = Seat.findOne({ tripId });
      return await (session ? query.session(session) : query);
    },

    async saveSeat(seatDoc, session) {
      seatDoc.markModified("seata");
      seatDoc.markModified("seatb");
      seatDoc.markModified("seatc");
      return await seatDoc.save(session ? { session } : {});
    },

    async createRefund(refundData, session) {
      return require("../../../shared/refund-budget").createBudgetedRefund(refundData, session);
    },

    async findRefundForBooking(refundId, bookingId, userId, session) {
      const query = Refund.findOne({ _id: refundId, bookingId, userId });
      return await (session ? query.session(session) : query);
    },

    async claimRefundDestination(refundId, userId, destination, session) {
      const query = Refund.findOneAndUpdate(
        { _id: refundId, userId, destination: null, status: "pending" },
        { $set: { destination } },
        { new: true, ...(session ? { session } : {}) }
      );
      return await query;
    },

    async saveRefund(refund, session) {
      return refund.save(session ? { session } : {});
    },

    async saveBooking(booking, session) {
      return await booking.save(session ? { session } : {});
    },

    async findTripByIdWithRoute(tripId) {
      return await Trip.findById(tripId).populate("routeId");
    },

    async findUserDevices(userId) {
      return await UserDeviceInfo.find({ userId });
    }
  };
}

module.exports = { createPassengerBookingCancellationRepository };
