'use strict';

/**
 * src/modules/booking/passenger-split-payment/index.js
 * Production composition root for passenger split-payment SM Money module.
 */

const smLedgerService = require('../../wallet/sm-ledger');
const logger = require('../../../../utils/logger');
const mapper = require('./passenger-split-payment.mapper');
const { createPassengerSplitPaymentService } = require('./passenger-split-payment.service');

const passengerSplitPaymentService = createPassengerSplitPaymentService({
  smLedgerService,
  logger,
  mapper,
});

module.exports = {
  debitPassengerSplitPayment: passengerSplitPaymentService.debitPassengerSplitPayment,
  reversePassengerSplitPaymentDebit: passengerSplitPaymentService.reversePassengerSplitPaymentDebit,
};
