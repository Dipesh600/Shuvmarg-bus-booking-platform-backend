"use strict";

function createTripSeatLayoutDualWriteService(repository, snapshotService) {
  async function createTrip(input) {
    return repository.runTransaction(async (session) => {
      const trip = await repository.createTrip(input.trip, session);
      const seats = await repository.createLegacySeats({
        tripId: trip._id,
        seata: input.legacySeats.seata,
        seatb: input.legacySeats.seatb,
        seatc: input.legacySeats.seatc,
      }, session);
      const hasV3Assignment = await repository.hasV3Assignment(input.trip.busId, session);
      const snapshot = hasV3Assignment
        ? await snapshotService.capture(trip._id, {
          session,
          unavailableElementIds: input.unavailableElementIds || [],
          pricing: { defaultFare: input.defaultFare ?? null, overrides: input.fareOverrides || [] },
        })
        : null;
      return { trip, seats, snapshot };
    });
  }

  return { createTrip };
}

module.exports = { createTripSeatLayoutDualWriteService };
