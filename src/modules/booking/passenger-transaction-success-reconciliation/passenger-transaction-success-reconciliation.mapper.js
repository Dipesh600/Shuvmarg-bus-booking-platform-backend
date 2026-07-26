'use strict';

/**
 * src/modules/booking/passenger-transaction-success-reconciliation/passenger-transaction-success-reconciliation.mapper.js
 * Mapper functions for passenger transaction success reconciliation.
 */

function mapPassengerTransactionReconciliationNotApplied() {
  return {
    ok: false,
    failureType: 'RECONCILIATION_UPDATE_NOT_APPLIED',
  };
}

module.exports = {
  mapPassengerTransactionReconciliationNotApplied,
};
