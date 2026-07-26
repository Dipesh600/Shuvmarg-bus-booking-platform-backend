'use strict';

/**
 * tests/unit/booking/passenger-booking-payment-transaction-service.test.js
 * Unit tests for passenger booking payment transaction service fee calculation and logging.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { createPassengerBookingPaymentTransactionService } = require('../../../src/modules/booking/passenger-booking-payment-transaction/passenger-booking-payment-transaction.service.js');

test('passengerBookingPaymentTransactionService unit tests', async (t) => {

  await t.test('1-7. resolves gatewayFeeRate across configurations and includes in result and payload metadata', async () => {
    const testCases = [
      { config: { esewa: { feePercent: 3.5 } }, gateway: 'esewa', expectedFee: 3.5 },
      { config: null, gateway: 'esewa', expectedFee: 0 },
      { config: { khalti: { feePercent: 2 } }, gateway: 'esewa', expectedFee: 0 },
      { config: { esewa: { feePercent: 0 } }, gateway: 'esewa', expectedFee: 0 },
    ];

    for (const tc of testCases) {
      let createdPayload = null;
      const repository = {
        getGatewayFeeConfig: async () => tc.config,
        createTransaction: async (payload) => { createdPayload = payload; return { _id: 't1', ...payload }; },
      };
      const service = createPassengerBookingPaymentTransactionService({ repository });
      const result = await service.createPassengerBookingPaymentTransaction({ gateway: tc.gateway });

      assert.equal(result.gatewayFeeRate, tc.expectedFee);
      assert.equal(createdPayload.meta.gatewayFeeRate, tc.expectedFee);
      assert.equal(result.transaction._id, 't1');
    }
  });

  await t.test('8-12. logs expected success fields when logger is provided', async () => {
    let loggedMsg = null;
    let loggedMeta = null;
    const logger = {
      info: (msg, meta) => { loggedMsg = msg; loggedMeta = meta; },
    };
    const repository = {
      getGatewayFeeConfig: async () => ({}),
      createTransaction: async (p) => ({ _id: 'txn_999', ...p }),
    };

    const service = createPassengerBookingPaymentTransactionService({ repository, logger });
    await service.createPassengerBookingPaymentTransaction({
      gateway: 'esewa',
      paymentId: 'pay_123',
      userId: 'user_456',
      gatewayAmount: 700,
      smMoneyApplied: 300,
    });

    assert.equal(loggedMsg, 'confirmBooking: Transaction record created (PAYMENT_RECEIVED)');
    assert.deepEqual(loggedMeta, {
      txnId: 'txn_999',
      paymentId: 'pay_123',
      userId: 'user_456',
      gatewayAmount: 700,
      smMoneyApplied: 300,
    });
  });

  await t.test('13 & 14. propagates configuration and transaction creation errors without swallowing', async () => {
    const errorRepoConfig = {
      getGatewayFeeConfig: async () => { throw new Error('Config DB Failure'); },
      createTransaction: async () => {},
    };
    const service1 = createPassengerBookingPaymentTransactionService({ repository: errorRepoConfig });
    await assert.rejects(async () => service1.createPassengerBookingPaymentTransaction({ gateway: 'esewa' }), { message: 'Config DB Failure' });

    const errorRepoTxn = {
      getGatewayFeeConfig: async () => ({}),
      createTransaction: async () => { throw new Error('Transaction DB Failure'); },
    };
    const service2 = createPassengerBookingPaymentTransactionService({ repository: errorRepoTxn });
    await assert.rejects(async () => service2.createPassengerBookingPaymentTransaction({ gateway: 'esewa' }), { message: 'Transaction DB Failure' });
  });
});
