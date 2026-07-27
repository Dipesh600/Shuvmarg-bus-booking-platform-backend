'use strict';

/**
 * Production composition for passenger internal-money compensation.
 */
const smLedgerService = require('../../wallet/sm-ledger');
const logger = require('../../../../utils/logger');
const splitPayment = require('../passenger-split-payment');
const {
  createPassengerInternalMoneyCompensationService,
} = require('./passenger-internal-money-compensation.service');

const service = createPassengerInternalMoneyCompensationService({
  smLedgerService,
  splitPayment,
  logger,
});

module.exports = {
  reversePassengerInternalMoneyDebits:
    service.reversePassengerInternalMoneyDebits,
};
