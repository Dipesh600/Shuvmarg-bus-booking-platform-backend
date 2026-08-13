const mongoose = require("mongoose");

function createPassengerBookingPreparationRepository({
  Trip,
  Seat,
  TripSeatLayoutSnapshot,
  TripSeatLayoutControl,
}) {
  return {
    async findBookableTripContext(scheduleId) {
      return Trip.findById(scheduleId)
        .select("status bookingClosesAt tripFare routeId")
        .populate("routeId", "basePrice")
        .lean();
    },

    async findTripSeatDocument(scheduleId) {
      return Seat.findOne({ tripId: scheduleId });
    },

    async findTripSeatLayoutPricing(scheduleId) {
      if (!TripSeatLayoutSnapshot || !TripSeatLayoutControl || !mongoose.isValidObjectId(scheduleId)) {
        return null;
      }
      const [snapshot, control] = await Promise.all([
        TripSeatLayoutSnapshot.findOne({ tripId: scheduleId }).lean(),
        TripSeatLayoutControl.findOne({ tripId: scheduleId }).lean(),
      ]);
      return snapshot ? { snapshot, control } : null;
    },
  };
}

module.exports = {
  createPassengerBookingPreparationRepository,
};
