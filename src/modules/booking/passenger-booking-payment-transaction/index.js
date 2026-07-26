'use strict';

/**
 * src/modules/booking/passenger-booking-payment-transaction/index.js
 * Production entrypoint for passenger booking payment transaction module.
 */

const PlatformConfig = require('../../../../models/platformConfigModel.js');
const Transaction = require('../../../../models/transactionModel.js');
const logger = require('../../../../utils/logger.js');
const {
  createPassengerBookingPaymentTransactionRepository,
} = require('./passenger-booking-payment-transaction.repository.js');
const {
  createPassengerBookingPaymentTransactionService,
} = require('./passenger-booking-payment-transaction.service.js');

const repository = createPassengerBookingPaymentTransactionRepository({
  PlatformConfig,
  Transaction,
});

const service = createPassengerBookingPaymentTransactionService({
  repository,
  logger,
  createDate: () => new Date(),
  createTimestamp: () => Date.now(),
});

module.exports = {
  createPassengerBookingPaymentTransaction:
    service.createPassengerBookingPaymentTransaction,
};
