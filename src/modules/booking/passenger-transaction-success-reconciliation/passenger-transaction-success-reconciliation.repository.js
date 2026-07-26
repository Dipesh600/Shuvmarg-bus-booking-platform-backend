'use strict';

/**
 * src/modules/booking/passenger-transaction-success-reconciliation/passenger-transaction-success-reconciliation.repository.js
 * Repository factory for passenger transaction success reconciliation.
 */

function createPassengerTransactionSuccessReconciliationRepository({ Transaction }) {
  if (!Transaction || typeof Transaction.findOneAndUpdate !== 'function') {
    throw new Error(
      'createPassengerTransactionSuccessReconciliationRepository requires Transaction model with findOneAndUpdate'
    );
  }

  async function transitionPaymentReceivedToSuccess({
    transactionId,
    bookingId,
    ticketId,
  }) {
    return Transaction.findOneAndUpdate(
      {
        _id: transactionId,
        status: 'PAYMENT_RECEIVED',
      },
      {
        $set: {
          status: 'SUCCESS',
          bookingId,
          ticketId,
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );
  }

  return {
    transitionPaymentReceivedToSuccess,
  };
}

module.exports = {
  createPassengerTransactionSuccessReconciliationRepository,
};
