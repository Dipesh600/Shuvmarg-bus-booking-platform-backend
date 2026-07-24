const resolveSeatConfig = (trip) => {
  if (!trip) return null;
  if (trip.seatTemplateId && trip.seatTemplateId.seatConfig) {
    return trip.seatTemplateId.seatConfig;
  }
  if (trip.busId && trip.busId.seatConfig) {
    return trip.busId.seatConfig;
  }
  return null;
};

const maskActiveHeldSeats = (seats, activeHolds) => {
  if (activeHolds.length > 0) {
    const heldSeatsSet = new Set();

    activeHolds.forEach((hold) => {
      hold.seatNumbers.forEach((seatNumber) => {
        heldSeatsSet.add(seatNumber.toLowerCase());
      });
    });

    const maskSeats = (seatArray) => {
      if (!seatArray) return;

      seatArray.forEach((seat) => {
        if (
          !seat.booked &&
          heldSeatsSet.has(seat.seatNo.toLowerCase())
        ) {
          seat.booked = true;
          seat.blockedFor = "reserved";
        }
      });
    };

    maskSeats(seats.seata);
    maskSeats(seats.seatb);
    maskSeats(seats.seatc);
  }

  return seats;
};
const buildAvailabilityData = (seats, seatConfig) => {
  return {
    ...seats,
    seatConfig: seatConfig
  };
};

module.exports = {
  resolveSeatConfig,
  maskActiveHeldSeats,
  buildAvailabilityData
};
