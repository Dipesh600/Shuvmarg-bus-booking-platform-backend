const createTripSeatAvailabilityService = ({ repository, mapper }) => {
  return async (tripId, currentUserId) => {
    const seats = await repository.findSeatByTripId(tripId);
    if (!seats) {
      return null;
    }

    const trip = await repository.findTripWithSeatConfig(tripId);
    const seatConfig = mapper.resolveSeatConfig(trip);

    const activeHolds = await repository.findActiveSeatHolds(tripId, currentUserId);
    const maskedSeats = mapper.maskActiveHeldSeats(seats, activeHolds);

    return mapper.buildAvailabilityData(maskedSeats, seatConfig);
  };
};

module.exports = {
  createTripSeatAvailabilityService
};
