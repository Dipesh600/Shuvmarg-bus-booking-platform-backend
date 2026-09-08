'use strict';

/**
 * Repository for passenger booking persistence.
 */
function createPassengerBookingPersistenceRepository({ Booking, captureRefundPolicySnapshot, commitPaymentBooking }) {
  if (!Booking || typeof Booking.create !== 'function') {
    throw new TypeError('passengerBookingPersistenceRepository requires Booking model with create method');
  }

  return {
    async createBooking(payload, options = {}) {
      const snapshot = options.refundPolicySnapshot || (captureRefundPolicySnapshot ? await captureRefundPolicySnapshot() : null);
      const record = snapshot ? { ...payload, refundPolicySnapshot: snapshot } : payload;
      return commitPaymentBooking ? commitPaymentBooking(record, options) : Booking.create(record);
    },
  };
}

module.exports = {
  createPassengerBookingPersistenceRepository,
};
