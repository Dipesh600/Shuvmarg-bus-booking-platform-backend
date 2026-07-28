'use strict';

/**
 * src/modules/booking/passenger-wallet-payment/passenger-wallet-payment.mapper.js
 *
 * Owns failure-result mapping for passenger wallet payments.
 */

function mapWalletNotAvailableResult() {
  return {
    ok: false,
    statusCode: 400,
    body: {
      success: false,
      message: 'Wallet is not available for this account.',
      errorCode: 'WALLET_NOT_AVAILABLE',
    },
  };
}

function mapWalletFrozenResult() {
  return {
    ok: false,
    statusCode: 403,
    body: {
      success: false,
      message: 'Wallet is frozen. Please contact support.',
      errorCode: 'WALLET_FROZEN',
    },
  };
}

function mapWalletDebitFailureResult(error) {
  return {
    ok: false,
    statusCode: 402,
    body: {
      success: false,
      message: (error && error.message) || 'Failed to debit SM Wallet',
      errorCode: 'WALLET_DEBIT_FAILED',
    },
  };
}

module.exports = {
  mapWalletNotAvailableResult,
  mapWalletFrozenResult,
  mapWalletDebitFailureResult,
};
