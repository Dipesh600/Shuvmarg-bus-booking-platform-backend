'use strict';

/**
 * Repository boundary for passenger payment dispute transaction updates.
 */
function createPassengerPaymentDisputeRepository({ Transaction }) {
  if (!Transaction || typeof Transaction.findByIdAndUpdate !== 'function') {
    throw new Error('createPassengerPaymentDisputeRepository requires Transaction');
  }

  function markDisputed({ transactionId, disputeReason, failureReason }) {
    const update = {
      status: 'DISPUTED',
      disputeReason,
    };

    if (failureReason !== undefined) {
      update.failureReason = failureReason;
    }

    return Transaction.findByIdAndUpdate(transactionId, update);
  }

  return {
    markDisputed,
  };
}

module.exports = {
  createPassengerPaymentDisputeRepository,
};
