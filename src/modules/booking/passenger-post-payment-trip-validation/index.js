'use strict';

/**
 * src/modules/booking/passenger-post-payment-trip-validation/index.js
 * Production entrypoint for passenger post-payment trip validation module.
 */

const Trip = require('../../../../models/tripModel.js');
const {
  createPassengerPostPaymentTripValidationRepository,
} = require('./passenger-post-payment-trip-validation.repository.js');
const mapper = require('./passenger-post-payment-trip-validation.mapper.js');
const {
  createPassengerPostPaymentTripValidationService,
} = require('./passenger-post-payment-trip-validation.service.js');

const repository = createPassengerPostPaymentTripValidationRepository({
  Trip,
});

const service = createPassengerPostPaymentTripValidationService({
  repository,
  mapper,
  createDate: () => new Date(),
});

module.exports = {
  validatePassengerPostPaymentTrip:
    service.validatePassengerPostPaymentTrip,
};
