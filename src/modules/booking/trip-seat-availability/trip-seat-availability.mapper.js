const resolveSeatConfig = (trip) => {
  if (!trip) return null;
  if (trip.seatLayoutSnapshot?.seatConfig) {
    return trip.seatLayoutSnapshot.seatConfig;
  }
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
const buildAvailabilityData = (seats, seatConfig, trip = null) => {
  const baseFare = trip?.tripFare ?? trip?.routeId?.basePrice ?? null;
  const overrides = new Map((trip?.seatFareOverrides || []).map((item) => [
    String(item.seatLabel).trim().toUpperCase(), item.fare,
  ]));
  const mapPublicSeat = (seat) => ({
    seatNo: seat.seatNo,
    booked: Boolean(seat.booked),
    seatClass: seat.seatClass,
    blockedFor: seat.blockedFor,
    fare: baseFare == null ? null : (overrides.get(String(seat.seatNo).toUpperCase()) || baseFare),
  });

  return {
    seata: (seats.seata || []).map(mapPublicSeat),
    seatb: (seats.seatb || []).map(mapPublicSeat),
    seatc: (seats.seatc || []).map(mapPublicSeat),
    seatConfig,
    baseFare,
  };
};

module.exports = {
  resolveSeatConfig,
  maskActiveHeldSeats,
  buildAvailabilityData
};
