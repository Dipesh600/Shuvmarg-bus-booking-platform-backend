'use strict';

/**
 * src/modules/booking/passenger-post-payment-trip-validation/passenger-post-payment-trip-validation.service.js
 * Service factory for passenger post-payment trip validation module.
 */

function createPassengerPostPaymentTripValidationService({
  repository,
  mapper,
  createDate = () => new Date(),
}) {
  if (!repository || typeof repository.findTripById !== 'function') {
    throw new Error(
      'createPassengerPostPaymentTripValidationService requires repository with findTripById'
    );
  }
  if (
    !mapper ||
    typeof mapper.mapPostPaymentTripNotFound !== 'function' ||
    typeof mapper.mapPostPaymentBookingWindowClosed !== 'function' ||
    typeof mapper.mapPostPaymentTripStatusNotBookable !== 'function'
  ) {
    throw new Error(
      'createPassengerPostPaymentTripValidationService requires mapper with error mapping functions'
    );
  }

  async function validatePassengerPostPaymentTrip({ scheduleId, transactionId } = {}) {
    const trip = await repository.findTripById(scheduleId);

    if (!trip) {
      return mapper.mapPostPaymentTripNotFound(transactionId);
    }

    const now = createDate();
    if (trip.bookingClosesAt && new Date(trip.bookingClosesAt) < now) {
      return mapper.mapPostPaymentBookingWindowClosed(transactionId);
    }

    if (trip.status !== 'scheduled' && trip.status !== 'boarding') {
      return mapper.mapPostPaymentTripStatusNotBookable({
        transactionId,
        tripStatus: trip.status,
      });
    }

    return {
      ok: true,
      trip,
    };
  }

  return {
    validatePassengerPostPaymentTrip,
  };
}

module.exports = {
  createPassengerPostPaymentTripValidationService,
};
