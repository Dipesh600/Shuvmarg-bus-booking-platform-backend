'use strict';

/**
 * src/modules/booking/passenger-esewa-verification/index.js
 * Production entrypoint for passenger eSewa payment verification module.
 */

const { verifyEsewaPayment } = require('../../../../services/esewaVerificationService.js');
const logger = require('../../../../utils/logger.js');
const mapper = require('./passenger-esewa-verification.mapper.js');
const { createPassengerEsewaVerificationService } = require('./passenger-esewa-verification.service.js');

const service = createPassengerEsewaVerificationService({
  verifyEsewaPayment,
  logger,
  mapper,
});

module.exports = {
  verifyPassengerEsewaPayment: service.verifyPassengerEsewaPayment,
};
