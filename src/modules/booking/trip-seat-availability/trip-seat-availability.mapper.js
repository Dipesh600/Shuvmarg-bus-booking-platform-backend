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
  const mapPublicSeat = (seat) => ({
    seatNo: seat.seatNo,
    booked: Boolean(seat.booked),
    seatClass: seat.seatClass,
    blockedFor: seat.blockedFor,
  });

  return {
    seata: (seats.seata || []).map(mapPublicSeat),
    seatb: (seats.seatb || []).map(mapPublicSeat),
    seatc: (seats.seatc || []).map(mapPublicSeat),
    seatConfig,
  };
};

const buildV3Availability = ({ snapshot, control, activeHolds, bookedSeatLabels }) => {
  if (!snapshot) return null;
  const stateOverrides = new Map((control?.stateOverrides || []).map((item) => [item.elementId, item.state]));
  const fareOverrides = new Map((control?.fareOverrides?.length ? control.fareOverrides : snapshot.pricing?.overrides || []).map((item) => [item.elementId, item.fare]));
  const held = new Set(activeHolds.flatMap((hold) => hold.seatNumbers || []).map((label) => label.toLowerCase()));
  const booked = new Set(bookedSeatLabels.map((label) => label.toLowerCase()));
  const capturedStates = new Map((snapshot.placeStates || []).map((item) => [item.elementId, item.state]));
  const defaultFare = control?.defaultFareOverride ?? snapshot.pricing?.defaultFare ?? null;
  const layout = structuredClone(snapshot.layout);
  layout.sections.forEach((section) => section.elements.forEach((element) => {
    if (!["SEAT", "BERTH"].includes(element.kind)) return;
    const label = element.label.toLowerCase();
    element.runtime = {
      state: stateOverrides.get(element.elementId) || capturedStates.get(element.elementId) || "OPEN",
      held: held.has(label), booked: booked.has(label),
      fare: fareOverrides.get(element.elementId) ?? defaultFare,
      currency: "NPR",
    };
  }));
  return { schemaVersion: 3, layout, controlVersion: control?.version || 0, defaultFare, currency: "NPR" };
};

module.exports = {
  resolveSeatConfig,
  maskActiveHeldSeats,
  buildAvailabilityData,
  buildV3Availability,
};
