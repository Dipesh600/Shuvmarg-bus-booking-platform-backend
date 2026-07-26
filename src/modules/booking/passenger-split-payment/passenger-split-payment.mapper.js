'use strict';

/**
 * src/modules/booking/passenger-split-payment/passenger-split-payment.mapper.js
 * Owns failure-result mapping for passenger split-payment SM Money debits.
 */

function mapSplitPaymentDebitFailure(error) {
  return {
    ok: false,
    statusCode: 402,
    body: {
      success: false,
      message: (error && error.message) || 'Failed to debit Shuvmarg Money',
      errorCode: 'SM_MONEY_DEBIT_FAILED',
    },
  };
}

module.exports = {
  mapSplitPaymentDebitFailure,
};
