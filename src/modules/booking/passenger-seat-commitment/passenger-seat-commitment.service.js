'use strict';

/**
 * src/modules/booking/passenger-seat-commitment/passenger-seat-commitment.service.js
 * Service factory for passenger seat commitment module.
 */

function createPassengerSeatCommitmentService({
  repository,
  mapper,
  createDate = () => new Date(),
}) {
  if (
    !repository ||
    typeof repository.findSeatDocumentByTripId !== 'function' ||
    typeof repository.lockSeat !== 'function'
  ) {
    throw new Error(
      'createPassengerSeatCommitmentService requires repository with findSeatDocumentByTripId and lockSeat'
    );
  }
  if (
    !mapper ||
    typeof mapper.mapPassengerSeatDataNotFound !== 'function' ||
    typeof mapper.mapPassengerSeatLockFailed !== 'function'
  ) {
    throw new Error(
      'createPassengerSeatCommitmentService requires mapper with failure mapping functions'
    );
  }

  async function commitPassengerSeats({
    scheduleId,
    userId,
    seatNumbers,
    transactionId,
  }) {
    const seatDoc = await repository.findSeatDocumentByTripId(scheduleId);
    if (!seatDoc) {
      return mapper.mapPassengerSeatDataNotFound({ transactionId });
    }

    const allSeats = [...seatDoc.seata, ...seatDoc.seatb, ...seatDoc.seatc];

    const exactSeatsToLock = [];
    for (const reqSeat of seatNumbers) {
      const exactSeat = allSeats.find(
        (s) => s.seatNo.toLowerCase() === reqSeat
      );
      if (exactSeat) {
        exactSeatsToLock.push(exactSeat.seatNo);
      } else {
        exactSeatsToLock.push(reqSeat.toUpperCase());
      }
    }

    const alreadyBookedSeats = [];
    const invalidSeats = [];

    for (const seatNo of exactSeatsToLock) {
      let arrayField = null;
      if (
        seatDoc.seata.some(
          (s) => s.seatNo.toLowerCase() === seatNo.toLowerCase()
        )
      ) {
        arrayField = 'seata';
      } else if (
        seatDoc.seatb.some(
          (s) => s.seatNo.toLowerCase() === seatNo.toLowerCase()
        )
      ) {
        arrayField = 'seatb';
      } else if (
        seatDoc.seatc.some(
          (s) => s.seatNo.toLowerCase() === seatNo.toLowerCase()
        )
      ) {
        arrayField = 'seatc';
      }

      if (!arrayField) {
        invalidSeats.push(seatNo.toUpperCase());
        continue;
      }

      const updated = await repository.lockSeat({
        scheduleId,
        arrayField,
        seatNo,
        userId,
        bookedAt: createDate(),
      });

      if (!updated) {
        alreadyBookedSeats.push(seatNo.toUpperCase());
      }
    }

    if (invalidSeats.length > 0 || alreadyBookedSeats.length > 0) {
      return mapper.mapPassengerSeatLockFailed({
        transactionId,
        invalidSeats,
        alreadyBookedSeats,
      });
    }

    return {
      ok: true,
      lockedSeatNumbers: seatNumbers,
    };
  }

  return {
    commitPassengerSeats,
  };
}

module.exports = {
  createPassengerSeatCommitmentService,
};
