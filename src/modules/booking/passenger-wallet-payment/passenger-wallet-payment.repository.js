'use strict';

/**
 * src/modules/booking/passenger-wallet-payment/passenger-wallet-payment.repository.js
 *
 * Owns persistence lookups for passenger wallet payments.
 */

function createPassengerWalletPaymentRepository({ Wallet }) {
  if (!Wallet || typeof Wallet.findOne !== 'function') {
    throw new Error('createPassengerWalletPaymentRepository: Wallet model is required');
  }

  async function findPassengerWalletByUserId(userId) {
    return Wallet.findOne({ userId });
  }

  return {
    findPassengerWalletByUserId,
  };
}

module.exports = {
  createPassengerWalletPaymentRepository,
};
