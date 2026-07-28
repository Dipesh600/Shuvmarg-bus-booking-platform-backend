'use strict';

/**
 * src/modules/booking/passenger-post-payment-trip-validation/passenger-post-payment-trip-validation.repository.js
 * Repository factory for passenger post-payment trip validation module.
 */

function createPassengerPostPaymentTripValidationRepository({ Trip }) {
  if (!Trip || typeof Trip.findById !== 'function') {
    throw new Error(
      'createPassengerPostPaymentTripValidationRepository requires Trip with findById'
    );
  }

  async function findTripById(scheduleId) {
    return Trip.findById(scheduleId).lean();
  }

  return {
    findTripById,
  };
}

module.exports = {
  createPassengerPostPaymentTripValidationRepository,
};
