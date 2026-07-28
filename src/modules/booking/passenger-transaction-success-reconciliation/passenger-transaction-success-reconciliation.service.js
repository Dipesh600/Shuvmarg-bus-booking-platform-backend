'use strict';

/**
 * src/modules/booking/passenger-transaction-success-reconciliation/passenger-transaction-success-reconciliation.service.js
 * Service factory for passenger transaction success reconciliation.
 */

function createPassengerTransactionSuccessReconciliationService({
  repository,
  mapper,
}) {
  if (
    !repository ||
    typeof repository.transitionPaymentReceivedToSuccess !== 'function'
  ) {
    throw new Error(
      'createPassengerTransactionSuccessReconciliationService requires repository with transitionPaymentReceivedToSuccess'
    );
  }
  if (
    !mapper ||
    typeof mapper.mapPassengerTransactionReconciliationNotApplied !==
      'function'
  ) {
    throw new Error(
      'createPassengerTransactionSuccessReconciliationService requires mapper with mapPassengerTransactionReconciliationNotApplied'
    );
  }

  async function reconcilePassengerTransactionSuccess({
    transactionId,
    bookingId,
    ticketId,
  }) {
    const transaction =
      await repository.transitionPaymentReceivedToSuccess({
        transactionId,
        bookingId,
        ticketId,
      });

    if (!transaction) {
      return mapper.mapPassengerTransactionReconciliationNotApplied();
    }

    return {
      ok: true,
      transaction,
    };
  }

  return {
    reconcilePassengerTransactionSuccess,
  };
}

module.exports = {
  createPassengerTransactionSuccessReconciliationService,
};
