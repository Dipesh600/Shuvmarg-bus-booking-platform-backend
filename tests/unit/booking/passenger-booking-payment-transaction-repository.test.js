'use strict';

/**
 * tests/unit/booking/passenger-booking-payment-transaction-repository.test.js
 * Unit tests for passenger booking payment transaction repository factory.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { createPassengerBookingPaymentTransactionRepository } = require('../../../src/modules/booking/passenger-booking-payment-transaction/passenger-booking-payment-transaction.repository.js');

test('passengerBookingPaymentTransactionRepository unit tests', async (t) => {

  await t.test('1 & 2. rejects missing PlatformConfig or Transaction dependency', () => {
    assert.throws(
      () => createPassengerBookingPaymentTransactionRepository({ Transaction: { create: async () => {} } }),
      /createPassengerBookingPaymentTransactionRepository requires PlatformConfig/
    );
    assert.throws(
      () => createPassengerBookingPaymentTransactionRepository({ PlatformConfig: { getConfig: async () => {} } }),
      /createPassengerBookingPaymentTransactionRepository requires Transaction/
    );
  });

  await t.test('3 & 4. getGatewayFeeConfig calls PlatformConfig.getConfig with gateway_fees and returns result', async () => {
    let capturedKey = null;
    const repo = createPassengerBookingPaymentTransactionRepository({
      PlatformConfig: {
        getConfig: async (key) => { capturedKey = key; return { esewa: { feePercent: 2 } }; },
      },
      Transaction: { create: async () => {} },
    });

    const config = await repo.getGatewayFeeConfig();
    assert.equal(capturedKey, 'gateway_fees');
    assert.deepEqual(config, { esewa: { feePercent: 2 } });
  });

  await t.test('5 & 6. createTransaction passes exact payload to Transaction.create and returns result', async () => {
    let capturedPayload = null;
    const dummyTxn = { _id: 'txn_123', status: 'PAYMENT_RECEIVED' };
    const repo = createPassengerBookingPaymentTransactionRepository({
      PlatformConfig: { getConfig: async () => ({}) },
      Transaction: {
        create: async (payload) => { capturedPayload = payload; return dummyTxn; },
      },
    });

    const payload = { userId: 'u1', transactionType: 'BOOKING' };
    const result = await repo.createTransaction(payload);
    assert.deepEqual(capturedPayload, payload);
    assert.equal(result, dummyTxn);
  });

  await t.test('7 & 8. propagates configuration lookup and transaction creation errors', async () => {
    const repoErrorConfig = createPassengerBookingPaymentTransactionRepository({
      PlatformConfig: { getConfig: async () => { throw new Error('DB Config Error'); } },
      Transaction: { create: async () => {} },
    });
    await assert.rejects(async () => repoErrorConfig.getGatewayFeeConfig(), { message: 'DB Config Error' });

    const repoErrorCreate = createPassengerBookingPaymentTransactionRepository({
      PlatformConfig: { getConfig: async () => ({}) },
      Transaction: { create: async () => { throw new Error('DB Txn Error'); } },
    });
    await assert.rejects(async () => repoErrorCreate.createTransaction({}), { message: 'DB Txn Error' });
  });
});
