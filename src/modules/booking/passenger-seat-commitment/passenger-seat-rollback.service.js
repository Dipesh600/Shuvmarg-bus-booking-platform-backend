'use strict';

/**
 * src/modules/booking/passenger-seat-commitment/passenger-seat-rollback.service.js
 * Service factory for passenger seat rollback module.
 */

function createPassengerSeatRollbackService({ repository, logger }) {
  if (
    !repository ||
    typeof repository.findSeatDocumentByTripId !== 'function' ||
    typeof repository.rollbackSeat !== 'function'
  ) {
    throw new Error(
      'createPassengerSeatRollbackService requires repository with findSeatDocumentByTripId and rollbackSeat'
    );
  }

  async function rollbackPassengerSeatLocks({ tripId, seatNumbers, userId }) {
    const attempted = Array.isArray(seatNumbers) ? seatNumbers.length : 0;
    const result = {
      ok: true,
      attempted,
      rolledBack: 0,
      skipped: 0,
      failed: 0,
    };
    if (!attempted) {
      return result;
    }

    const seatDoc = await repository.findSeatDocumentByTripId(tripId);
    if (!seatDoc) {
      return result;
    }

    const allSeats = [
      ...(Array.isArray(seatDoc.seata) ? seatDoc.seata : []),
      ...(Array.isArray(seatDoc.seatb) ? seatDoc.seatb : []),
      ...(Array.isArray(seatDoc.seatc) ? seatDoc.seatc : []),
    ];

    for (const reqSeat of seatNumbers) {
      try {
        const exactSeat = allSeats.find(
          (s) =>
            s &&
            s.seatNo &&
            s.seatNo.toLowerCase() === String(reqSeat).toLowerCase()
        );
        if (!exactSeat) {
          result.skipped += 1;
          continue;
        }
        const seatNo = exactSeat.seatNo;

        let arrayField = null;
        if (
          Array.isArray(seatDoc.seata) &&
          seatDoc.seata.some((s) => s && s.seatNo === seatNo)
        ) {
          arrayField = 'seata';
        } else if (
          Array.isArray(seatDoc.seatb) &&
          seatDoc.seatb.some((s) => s && s.seatNo === seatNo)
        ) {
          arrayField = 'seatb';
        } else if (
          Array.isArray(seatDoc.seatc) &&
          seatDoc.seatc.some((s) => s && s.seatNo === seatNo)
        ) {
          arrayField = 'seatc';
        }

        if (!arrayField) {
          result.skipped += 1;
          continue;
        }

        await repository.rollbackSeat({
          tripId,
          arrayField,
          seatNo,
          userId,
        });
        result.rolledBack += 1;
      } catch (rollbackErr) {
        result.failed += 1;
        if (logger && typeof logger.error === 'function') {
          logger.error(
            'confirmBooking: seat rollback failed for individual seat',
            {
              tripId,
              seatNo: reqSeat,
              userId,
              error: rollbackErr.message || String(rollbackErr),
            }
          );
        }
      }
    }

    return result;
  }

  return {
    rollbackPassengerSeatLocks,
  };
}

module.exports = {
  createPassengerSeatRollbackService,
};
