'use strict';

/**
 * src/modules/booking/passenger-booking-payment-transaction/passenger-booking-payment-transaction.repository.js
 * Repository factory for passenger booking payment transaction module.
 */

function createPassengerBookingPaymentTransactionRepository({ PlatformConfig, Transaction, createAttemptTransaction }) {
  if (!PlatformConfig || typeof PlatformConfig.getConfig !== 'function') {
    throw new Error('createPassengerBookingPaymentTransactionRepository requires PlatformConfig with getConfig');
  }
  if (!Transaction || typeof Transaction.create !== 'function') {
    throw new Error('createPassengerBookingPaymentTransactionRepository requires Transaction with create');
  }

  async function getGatewayFeeConfig() {
    return PlatformConfig.getConfig('gateway_fees');
  }

  async function createTransaction(payload, ownership) {
    return createAttemptTransaction ? createAttemptTransaction(payload, ownership) : Transaction.create(payload);
  }

  return {
    getGatewayFeeConfig,
    createTransaction,
  };
}

module.exports = {
  createPassengerBookingPaymentTransactionRepository,
};
