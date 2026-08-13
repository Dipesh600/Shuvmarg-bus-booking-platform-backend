const createTripSeatAvailabilityService = ({ repository, mapper }) => {
  return async (tripId, currentUserId) => {
    if (typeof repository.findV3Snapshot !== "function") {
      const seats = await repository.findSeatByTripId(tripId);
      if (!seats) return null;
      const trip = await repository.findTripWithSeatConfig(tripId);
      const seatConfig = mapper.resolveSeatConfig(trip);
      const activeHolds = await repository.findActiveSeatHolds(tripId, currentUserId);
      return mapper.buildAvailabilityData(mapper.maskActiveHeldSeats(seats, activeHolds), seatConfig);
    }
    const [seats, snapshot, control] = await Promise.all([
      repository.findSeatByTripId(tripId), repository.findV3Snapshot(tripId), repository.findV3Control(tripId),
    ]);
    if (!seats && !snapshot) return null;

    const trip = await repository.findTripWithSeatConfig(tripId);
    const seatConfig = mapper.resolveSeatConfig(trip);

    const activeHolds = await repository.findActiveSeatHolds(tripId, currentUserId);
    const bookedSeatLabels = snapshot ? await repository.findActiveBookedSeatLabels(tripId) : [];
    const v3 = mapper.buildV3Availability({ snapshot, control, activeHolds, bookedSeatLabels });
    if (!seats) return { seatLayoutV3: v3 };
    const maskedSeats = mapper.maskActiveHeldSeats(seats, activeHolds);

    return { ...mapper.buildAvailabilityData(maskedSeats, seatConfig), ...(v3 ? { seatLayoutV3: v3 } : {}) };
  };
};

module.exports = {
  createTripSeatAvailabilityService
};
