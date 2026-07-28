'use strict';

/**
 * tests/unit/booking/passenger-booking-payment-transaction-payload.test.js
 * Unit tests for passenger booking payment transaction payload construction.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { createPassengerBookingPaymentTransactionService } = require('../../../src/modules/booking/passenger-booking-payment-transaction/passenger-booking-payment-transaction.service.js');

test('passengerBookingPaymentTransactionPayload unit tests', async (t) => {
  const mockDate = new Date('2026-07-26T12:00:00Z');
  const mockTimestamp = 1700000000000;

  await t.test('1-19. constructs exact payload structure across all gateway and parameter combinations', async () => {
    let capturedPayload = null;
    const repository = {
      getGatewayFeeConfig: async () => ({ esewa: { feePercent: 2.5 } }),
      createTransaction: async (payload) => { capturedPayload = payload; return { _id: 'txn_1', ...payload }; },
    };

    const service = createPassengerBookingPaymentTransactionService({
      repository,
      createDate: () => mockDate,
      createTimestamp: () => mockTimestamp,
    });

    // Case A: eSewa gateway with paymentId and originalAmount
    await service.createPassengerBookingPaymentTransaction({
      userId: 'u123',
      scheduleId: 'sched_456',
      seatNumbers: ['A1', 'A2'],
      gateway: 'esewa',
      paymentId: 'esewa_pay_007',
      originalAmount: 1000,
      paymentAmount: 1000,
      gatewayAmount: 800,
      smMoneyApplied: 200,
      tempBookingId: 'hold_777',
      internalMoneyDebitEntryId: 'debit_999',
    });

    assert.equal(capturedPayload.userId, 'u123');
    assert.equal(capturedPayload.tripId, 'sched_456');
    assert.deepEqual(capturedPayload.seats, ['A1', 'A2']);
    assert.equal(capturedPayload.transactionType, 'BOOKING');
    assert.equal(capturedPayload.gateway, 'esewa');
    assert.equal(capturedPayload.transactionId, 'esewa_pay_007');
    assert.equal(capturedPayload.originalAmount, 1000);
    assert.equal(capturedPayload.totalAmount, 1000);
    assert.equal(capturedPayload.status, 'PAYMENT_RECEIVED');
    assert.equal(capturedPayload.paidAt, mockDate);
    assert.deepEqual(capturedPayload.meta, {
      tempBookingId: 'hold_777',
      paymentMethod: 'ESEWA',
      bookedVia: 'APP',
      smMoneyUsed: 200,
      gatewayAmount: 800,
      smDebitEntryId: 'debit_999',
      gatewayFeeRate: 2.5,
    });

    // Case B: Wallet gateway without paymentId and with originalAmount falsy (fallback paymentAmount)
    await service.createPassengerBookingPaymentTransaction({
      userId: 'u123',
      scheduleId: 'sched_456',
      seatNumbers: ['A1'],
      gateway: 'wallet',
      paymentId: null,
      originalAmount: 0,
      paymentAmount: 500,
      gatewayAmount: null,
      smMoneyApplied: null,
      tempBookingId: 'hold_888',
      internalMoneyDebitEntryId: 'wallet_debit_111',
    });

    assert.equal(capturedPayload.gateway, 'sm_wallet');
    assert.equal(capturedPayload.transactionId, 'sm_wallet_1700000000000');
    assert.equal(capturedPayload.originalAmount, 500);
    assert.equal(capturedPayload.totalAmount, 0);
    assert.equal(capturedPayload.meta.paymentMethod, 'SM_WALLET');
    assert.equal(capturedPayload.meta.gatewayAmount, null);
    assert.equal(capturedPayload.meta.smMoneyUsed, null);
    assert.equal(capturedPayload.meta.smDebitEntryId, 'wallet_debit_111');
  });

  await t.test('20. rejects with TypeError from gateway.toUpperCase() when non-wallet gateway is falsy without calling createTransaction', async () => {
    let createTransactionCalled = false;
    const repository = {
      getGatewayFeeConfig: async () => ({}),
      createTransaction: async () => { createTransactionCalled = true; },
    };
    const service = createPassengerBookingPaymentTransactionService({ repository });

    await assert.rejects(
      async () => service.createPassengerBookingPaymentTransaction({ gateway: null }),
      (err) => err instanceof TypeError
    );
    assert.equal(createTransactionCalled, false);
  });
});
