'use strict';

/**
 * tests/unit/booking/passenger-wallet-payment-mapper.test.js
 * Unit tests for passenger wallet payment mapper.
 */

const test   = require('node:test');
const assert = require('node:assert/strict');
const {
  mapWalletNotAvailableResult,
  mapWalletFrozenResult,
  mapWalletDebitFailureResult,
} = require('../../../src/modules/booking/passenger-wallet-payment/passenger-wallet-payment.mapper');

test('passengerWalletPaymentMapper unit tests', async (t) => {

  await t.test('1. missing-wallet status code and exact body', () => {
    const res = mapWalletNotAvailableResult();
    assert.equal(res.ok, false);
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, {
      success: false,
      message: 'Wallet is not available for this account.',
      errorCode: 'WALLET_NOT_AVAILABLE',
    });
  });

  await t.test('2. frozen-wallet status code and exact body', () => {
    const res = mapWalletFrozenResult();
    assert.equal(res.ok, false);
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, {
      success: false,
      message: 'Wallet is frozen. Please contact support.',
      errorCode: 'WALLET_FROZEN',
    });
  });

  await t.test('3. debit failure preserves error.message', () => {
    const err = new Error('Insufficient Funds');
    const res = mapWalletDebitFailureResult(err);
    assert.equal(res.ok, false);
    assert.equal(res.statusCode, 402);
    assert.deepEqual(res.body, {
      success: false,
      message: 'Insufficient Funds',
      errorCode: 'WALLET_DEBIT_FAILED',
    });
  });

  await t.test('4. debit failure uses default message when error message is absent', () => {
    const res = mapWalletDebitFailureResult(null);
    assert.equal(res.ok, false);
    assert.equal(res.statusCode, 402);
    assert.deepEqual(res.body, {
      success: false,
      message: 'Failed to debit SM Wallet',
      errorCode: 'WALLET_DEBIT_FAILED',
    });
  });

  await t.test('5. all failure results have ok: false', () => {
    assert.equal(mapWalletNotAvailableResult().ok, false);
    assert.equal(mapWalletFrozenResult().ok, false);
    assert.equal(mapWalletDebitFailureResult(new Error()).ok, false);
  });
});
