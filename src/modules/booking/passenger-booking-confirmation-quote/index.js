'use strict';

const CouponHelper    = require('../../../../handlers/couponHelper.js');
const smLedgerService = require('../../../../services/smLedgerService.js');
const PlatformConfig  = require('../../../../models/platformConfigModel.js');
const logger          = require('../../../../utils/logger.js');

const policy = require('./passenger-booking-confirmation-quote.policy.js');
const mapper = require('./passenger-booking-confirmation-quote.mapper.js');
const { createPassengerBookingConfirmationQuoteService } = require('./passenger-booking-confirmation-quote.service.js');

const { buildPassengerBookingConfirmationQuote } = createPassengerBookingConfirmationQuoteService({
  couponHelper: CouponHelper,
  smLedgerService,
  platformConfig: PlatformConfig,
  logger,
  policy,
  mapper,
});

module.exports = {
  validatePassengerBookingConfirmationRequest: policy.validatePassengerBookingConfirmationRequest,
  buildPassengerBookingConfirmationQuote,
};
