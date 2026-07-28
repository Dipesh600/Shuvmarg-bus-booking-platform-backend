'use strict';

/**
 * tests/unit/booking/passenger-transaction-success-reconciliation-repository.test.js
 * Unit tests for passenger transaction success reconciliation repository.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createPassengerTransactionSuccessReconciliationRepository,
} = require('../../../src/modules/booking/passenger-transaction-success-reconciliation/passenger-transaction-success-reconciliation.repository');

test('passengerTransactionSuccessReconciliationRepository unit tests', async (t) => {
  await t.test('1. rejects missing Transaction dependency', () => {
    assert.throws(
      () => createPassengerTransactionSuccessReconciliationRepository({}),
      /requires Transaction model with findOneAndUpdate/
    );
  });

  await t.test('2. rejects missing Transaction.findOneAndUpdate', () => {
    assert.throws(
      () =>
        createPassengerTransactionSuccessReconciliationRepository({
          Transaction: {},
        }),
      /requires Transaction model with findOneAndUpdate/
    );
  });

  await t.test('3-10, 14. calls findOneAndUpdate exactly once with exact filter, update, options', async () => {
    let callCount = 0;
    let passedFilter = null;
    let passedUpdate = null;
    let passedOptions = null;

    const dummyDoc = { _id: 'txn-1', status: 'SUCCESS' };
    const mockTransaction = {
      findOneAndUpdate: async (filter, update, options) => {
        callCount++;
        passedFilter = filter;
        passedUpdate = update;
        passedOptions = options;
        return dummyDoc;
      },
    };

    const repository =
      createPassengerTransactionSuccessReconciliationRepository({
        Transaction: mockTransaction,
      });

    const result = await repository.transitionPaymentReceivedToSuccess({
      transactionId: 'txn-123',
      bookingId: 'book-456',
      ticketId: 'SHUV-789',
    });

    assert.equal(callCount, 1);
    assert.deepEqual(passedFilter, {
      _id: 'txn-123',
      status: 'PAYMENT_RECEIVED',
    });
    assert.deepEqual(passedUpdate, {
      $set: {
        status: 'SUCCESS',
        bookingId: 'book-456',
        ticketId: 'SHUV-789',
      },
    });
    assert.deepEqual(passedOptions, {
      new: true,
      runValidators: true,
    });
    assert.equal(result, dummyDoc);
  });

  await t.test('11. returns exact transaction result', async () => {
    const dummyDoc = { _id: 't-1', status: 'SUCCESS' };
    const repository =
      createPassengerTransactionSuccessReconciliationRepository({
        Transaction: {
          findOneAndUpdate: async () => dummyDoc,
        },
      });

    const result = await repository.transitionPaymentReceivedToSuccess({
      transactionId: 't-1',
      bookingId: 'b-1',
      ticketId: 'tk-1',
    });
    assert.equal(result, dummyDoc);
  });

  await t.test('12. returns null unchanged when update fails', async () => {
    const repository =
      createPassengerTransactionSuccessReconciliationRepository({
        Transaction: {
          findOneAndUpdate: async () => null,
        },
      });

    const result = await repository.transitionPaymentReceivedToSuccess({
      transactionId: 't-1',
      bookingId: 'b-1',
      ticketId: 'tk-1',
    });
    assert.equal(result, null);
  });

  await t.test('13. propagates repository errors unchanged', async () => {
    const dbErr = new Error('Mongo connection drop');
    const repository =
      createPassengerTransactionSuccessReconciliationRepository({
        Transaction: {
          findOneAndUpdate: async () => {
            throw dbErr;
          },
        },
      });

    await assert.rejects(
      async () =>
        repository.transitionPaymentReceivedToSuccess({
          transactionId: 't-1',
          bookingId: 'b-1',
          ticketId: 'tk-1',
        }),
      (err) => err === dbErr
    );
  });
});
