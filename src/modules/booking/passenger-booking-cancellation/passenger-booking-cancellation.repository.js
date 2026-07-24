const Booking = require("../../../../models/bookTicketModel.js");
const Trip = require("../../../../models/tripModel");
const Seat = require("../../../../models/seatsModel.js");
const Refund = require("../../../../models/refundModel");
const UserDeviceInfo = require("../../../../models/userDeviceInfoModel.js");

function createPassengerBookingCancellationRepository() {
  return {
    async findBookingByTicketId(ticketId) {
      return await Booking.findOne({ ticketId });
    },

    async findTripById(tripId) {
      return await Trip.findById(tripId);
    },

    async findSeatByTripId(tripId) {
      return await Seat.findOne({ tripId });
    },

    async saveSeat(seatDoc) {
      seatDoc.markModified("seata");
      seatDoc.markModified("seatb");
      seatDoc.markModified("seatc");
      return await seatDoc.save();
    },

    async createRefund(refundData) {
      return await Refund.create(refundData);
    },

    async saveBooking(booking) {
      return await booking.save();
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
