'use strict';

/**
 * src/modules/booking/passenger-seat-commitment/passenger-seat-commitment.repository.js
 * Repository factory for passenger seat commitment module.
 */

function createPassengerSeatCommitmentRepository({ Seat }) {
  if (
    !Seat ||
    typeof Seat.findOne !== 'function' ||
    typeof Seat.findOneAndUpdate !== 'function'
  ) {
    throw new Error(
      'createPassengerSeatCommitmentRepository requires Seat with findOne and findOneAndUpdate'
    );
  }

  async function findSeatDocumentByTripId(scheduleId) {
    return Seat.findOne({ tripId: scheduleId });
  }

  async function lockSeat({ scheduleId, arrayField, seatNo, userId, bookedAt }) {
    return Seat.findOneAndUpdate(
      {
        tripId: scheduleId,
        [arrayField]: {
          $elemMatch: {
            seatNo,
            booked: false,
            $or: [{ blockedFor: "none" }, { blockedFor: { $exists: false } }],
          },
        },
      },
      {
        $set: {
          [`${arrayField}.$[elem].booked`]: true,
          [`${arrayField}.$[elem].bookedBy`]: userId,
          [`${arrayField}.$[elem].bookedAt`]: bookedAt,
        },
      },
      {
        arrayFilters: [{
          'elem.seatNo': seatNo,
          'elem.booked': false,
          $or: [{ 'elem.blockedFor': 'none' }, { 'elem.blockedFor': { $exists: false } }],
        }],
        new: true,
      }
    );
  }

  return {
    findSeatDocumentByTripId,
    lockSeat,
  };
}

module.exports = {
  createPassengerSeatCommitmentRepository,
};
