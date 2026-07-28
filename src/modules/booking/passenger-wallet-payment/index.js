'use strict';

/**
 * src/modules/booking/passenger-wallet-payment/index.js
 *
 * Production composition root for passenger wallet payment debit module.
 */

const Wallet = require('../../../../models/walletModel');
const smLedgerService = require('../../wallet/sm-ledger');
const logger = require('../../../../utils/logger');
const { createPassengerWalletPaymentRepository } = require('./passenger-wallet-payment.repository');
const mapper = require('./passenger-wallet-payment.mapper');
const { createPassengerWalletPaymentService } = require('./passenger-wallet-payment.service');

const walletRepository = createPassengerWalletPaymentRepository({ Wallet });

const passengerWalletPaymentService = createPassengerWalletPaymentService({
  walletRepository,
  smLedgerService,
  logger,
  mapper,
});

module.exports = {
  debitPassengerWalletPayment: passengerWalletPaymentService.debitPassengerWalletPayment,
};
