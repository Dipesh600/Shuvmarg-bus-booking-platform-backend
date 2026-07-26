'use strict';

/**
 * tests/unit/booking/passenger-split-payment-mapper.test.js
 * Unit tests for passenger split-payment mapper.
 */

const test   = require('node:test');
const assert = require('node:assert/strict');
const {
  mapSplitPaymentDebitFailure,
} = require('../../../src/modules/booking/passenger-split-payment/passenger-split-payment.mapper');

test('passengerSplitPaymentMapper unit tests', async (t) => {

  await t.test('1, 2, 3 & 4. mapSplitPaymentDebitFailure returns ok: false, status 402, code SM_MONEY_DEBIT_FAILED, and preserves error.message', () => {
    const err = new Error('Insufficient SM Balance');
    const res = mapSplitPaymentDebitFailure(err);

    assert.equal(res.ok, false);
    assert.equal(res.statusCode, 402);
    assert.deepEqual(res.body, {
      success: false,
      message: 'Insufficient SM Balance',
      errorCode: 'SM_MONEY_DEBIT_FAILED',
    });
  });

  await t.test('5. uses default message when error message is absent', () => {
    const res = mapSplitPaymentDebitFailure(null);

    assert.equal(res.ok, false);
    assert.equal(res.statusCode, 402);
    assert.deepEqual(res.body, {
      success: false,
      message: 'Failed to debit Shuvmarg Money',
      errorCode: 'SM_MONEY_DEBIT_FAILED',
    });
  });

  await t.test('6. exact response-body shape for undefined error', () => {
    const res = mapSplitPaymentDebitFailure();
    assert.equal(res.ok, false);
    assert.equal(res.statusCode, 402);
    assert.equal(res.body.success, false);
    assert.equal(res.body.errorCode, 'SM_MONEY_DEBIT_FAILED');
  });
});
