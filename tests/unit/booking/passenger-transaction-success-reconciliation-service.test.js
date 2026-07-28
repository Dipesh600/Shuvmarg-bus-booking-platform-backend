'use strict';

/**
 * tests/unit/booking/passenger-transaction-success-reconciliation-service.test.js
 * Unit tests for passenger transaction success reconciliation service.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createPassengerTransactionSuccessReconciliationService,
} = require('../../../src/modules/booking/passenger-transaction-success-reconciliation/passenger-transaction-success-reconciliation.service');

test('passengerTransactionSuccessReconciliationService unit tests', async (t) => {
  await t.test('1. rejects missing repository', () => {
    assert.throws(
      () => createPassengerTransactionSuccessReconciliationService({ mapper: { mapPassengerTransactionReconciliationNotApplied: () => {} } }),
      /requires repository with transitionPaymentReceivedToSuccess/
    );
  });

  await t.test('2. rejects missing repository method', () => {
    assert.throws(
      () => createPassengerTransactionSuccessReconciliationService({ repository: {}, mapper: { mapPassengerTransactionReconciliationNotApplied: () => {} } }),
      /requires repository with transitionPaymentReceivedToSuccess/
    );
  });

  await t.test('3. rejects missing mapper', () => {
    assert.throws(
      () => createPassengerTransactionSuccessReconciliationService({ repository: { transitionPaymentReceivedToSuccess: () => {} } }),
      /requires mapper with mapPassengerTransactionReconciliationNotApplied/
    );
  });

  await t.test('4. rejects missing mapper method', () => {
    assert.throws(
      () => createPassengerTransactionSuccessReconciliationService({ repository: { transitionPaymentReceivedToSuccess: () => {} }, mapper: {} }),
      /requires mapper with mapPassengerTransactionReconciliationNotApplied/
    );
  });

  await t.test('5-10, 16. passes exact parameters, calls repository once, returns ok: true with doc', async () => {
    let repoCalls = 0;
    let passedParams = null;
    const dummyDoc = { _id: 't-123', status: 'SUCCESS' };

    const service = createPassengerTransactionSuccessReconciliationService({
      repository: {
        transitionPaymentReceivedToSuccess: async (params) => {
          repoCalls++;
          passedParams = params;
          return dummyDoc;
        },
      },
      mapper: {
        mapPassengerTransactionReconciliationNotApplied: () => ({ ok: false, failureType: 'RECONCILIATION_UPDATE_NOT_APPLIED' }),
      },
    });

    const result = await service.reconcilePassengerTransactionSuccess({ transactionId: 'txn-1', bookingId: 'book-2', ticketId: 'ticket-3' });

    assert.equal(repoCalls, 1);
    assert.deepEqual(passedParams, { transactionId: 'txn-1', bookingId: 'book-2', ticketId: 'ticket-3' });
    assert.deepEqual(result, { ok: true, transaction: dummyDoc });
    assert.equal(result.transaction, dummyDoc);
  });

  await t.test('11-13. null/undefined repository result calls mapper once and returns exact mapper output', async () => {
    let mapperCalls = 0;
    const dummyFailure = { ok: false, failureType: 'RECONCILIATION_UPDATE_NOT_APPLIED' };

    const service = createPassengerTransactionSuccessReconciliationService({
      repository: { transitionPaymentReceivedToSuccess: async () => null },
      mapper: { mapPassengerTransactionReconciliationNotApplied: () => { mapperCalls++; return dummyFailure; } },
    });

    const result = await service.reconcilePassengerTransactionSuccess({ transactionId: 'txn-1', bookingId: 'book-2', ticketId: 'ticket-3' });

    assert.equal(mapperCalls, 1);
    assert.equal(result, dummyFailure);
  });

  await t.test('14. repository exception propagates unchanged', async () => {
    const repoErr = new Error('Database connection failed');
    const service = createPassengerTransactionSuccessReconciliationService({
      repository: { transitionPaymentReceivedToSuccess: async () => { throw repoErr; } },
      mapper: { mapPassengerTransactionReconciliationNotApplied: () => {} },
    });

    await assert.rejects(
      async () => service.reconcilePassengerTransactionSuccess({ transactionId: 't1', bookingId: 'b1', ticketId: 'tk1' }),
      (err) => err === repoErr
    );
  });

  await t.test('15. mapper exception propagates unchanged', async () => {
    const mapperErr = new Error('Mapper error');
    const service = createPassengerTransactionSuccessReconciliationService({
      repository: { transitionPaymentReceivedToSuccess: async () => null },
      mapper: { mapPassengerTransactionReconciliationNotApplied: () => { throw mapperErr; } },
    });

    await assert.rejects(
      async () => service.reconcilePassengerTransactionSuccess({ transactionId: 't1', bookingId: 'b1', ticketId: 'tk1' }),
      (err) => err === mapperErr
    );
  });
});
