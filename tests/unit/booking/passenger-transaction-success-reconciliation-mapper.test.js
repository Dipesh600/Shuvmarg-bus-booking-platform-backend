'use strict';

/**
 * tests/unit/booking/passenger-transaction-success-reconciliation-mapper.test.js
 * Unit tests for passenger transaction success reconciliation mapper.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  mapPassengerTransactionReconciliationNotApplied,
} = require('../../../src/modules/booking/passenger-transaction-success-reconciliation/passenger-transaction-success-reconciliation.mapper');

test('passengerTransactionSuccessReconciliationMapper unit tests', async (t) => {
  await t.test('1-7. exact failure result shape, keys, and properties', () => {
    const result = mapPassengerTransactionReconciliationNotApplied();

    assert.deepEqual(result, {
      ok: false,
      failureType: 'RECONCILIATION_UPDATE_NOT_APPLIED',
    });
    assert.equal(result.ok, false);
    assert.equal(result.failureType, 'RECONCILIATION_UPDATE_NOT_APPLIED');
    assert.equal(result.statusCode, undefined);
    assert.equal(result.status, undefined);
    assert.equal(result.body, undefined);
    assert.equal(result.message, undefined);
    assert.equal(result.logMessage, undefined);
    assert.equal(result.caseId, undefined);
  });

  await t.test('8. returns a fresh object instance on each call', () => {
    const res1 = mapPassengerTransactionReconciliationNotApplied();
    const res2 = mapPassengerTransactionReconciliationNotApplied();

    assert.notEqual(res1, res2);
    res1.ok = true;
    assert.equal(res2.ok, false);
  });
});
