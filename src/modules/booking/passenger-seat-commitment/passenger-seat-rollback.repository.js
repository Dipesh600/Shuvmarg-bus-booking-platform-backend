'use strict';

/**
 * src/modules/booking/passenger-seat-commitment/passenger-seat-rollback.repository.js
 * Repository factory for passenger seat rollback module.
 */

function createPassengerSeatRollbackRepository({ Seat, rollbackUnfulfilledSeat }) {
  if (
    !Seat ||
    typeof Seat.findOne !== 'function' ||
    typeof Seat.findOneAndUpdate !== 'function'
  ) {
    throw new Error(
      'createPassengerSeatRollbackRepository requires Seat with findOne and findOneAndUpdate'
    );
  }

  async function findSeatDocumentByTripId(tripId) {
    return Seat.findOne({ tripId });
  }

  async function rollbackSeat({ tripId, arrayField, seatNo, userId }) {
    if (rollbackUnfulfilledSeat) return rollbackUnfulfilledSeat({ tripId, arrayField, seatNo, userId });
    return Seat.findOneAndUpdate(
      {
        tripId,
        [arrayField]: { $elemMatch: { seatNo, bookedBy: userId } },
      },
      {
        $set: {
          [`${arrayField}.$[elem].booked`]: false,
          [`${arrayField}.$[elem].bookedBy`]: null,
          [`${arrayField}.$[elem].bookedAt`]: null,
        },
      },
      { arrayFilters: [{ 'elem.seatNo': seatNo, 'elem.bookedBy': userId }] }
    );
  }

  return {
    findSeatDocumentByTripId,
    rollbackSeat,
  };
}

module.exports = {
  createPassengerSeatRollbackRepository,
};
