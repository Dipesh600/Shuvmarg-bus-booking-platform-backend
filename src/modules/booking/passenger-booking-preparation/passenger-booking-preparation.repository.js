function createPassengerBookingPreparationRepository({ Trip, Seat }) {
  return {
    async findBookableTripContext(scheduleId) {
      return Trip.findById(scheduleId)
        .select("status bookingClosesAt tripFare seatFareOverrides routeId")
        .populate("routeId", "basePrice")
        .lean();
    },

    async findTripSeatDocument(scheduleId) {
      return Seat.findOne({ tripId: scheduleId });
    },
  };
}

module.exports = {
  createPassengerBookingPreparationRepository,
};
