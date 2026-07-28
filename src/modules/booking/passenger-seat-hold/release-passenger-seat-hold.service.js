'use strict';

function createReleasePassengerSeatHoldService({ repository, clock }) {
  return async function releasePassengerSeatHold({ tempBookingId, userId }) {
    if (!tempBookingId || typeof tempBookingId !== 'string') {
      return {
        ok: false,
        statusCode: 400,
        body: {
          success: false,
          message: 'A valid temporary booking ID is required.',
          errorCode: 'BOOKING_HOLD_REFERENCE_REQUIRED',
        },
      };
    }

    await repository.releaseOwnedHold(tempBookingId, userId, clock());
    return {
      ok: true,
      statusCode: 200,
      body: {
        success: true,
        message: 'Seat hold released.',
      },
    };
  };
}

module.exports = {
  createReleasePassengerSeatHoldService,
};
