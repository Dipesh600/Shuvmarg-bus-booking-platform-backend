'use strict';

/**
 * Repository for passenger booking persistence.
 */
function createPassengerBookingPersistenceRepository({ Booking }) {
  if (!Booking || typeof Booking.create !== 'function') {
    throw new TypeError('passengerBookingPersistenceRepository requires Booking model with create method');
  }

  return {
    async createBooking(payload) {
      return Booking.create(payload);
    },
  };
}

module.exports = {
  createPassengerBookingPersistenceRepository,
};
