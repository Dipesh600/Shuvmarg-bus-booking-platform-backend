'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mapper = require(
  '../../../src/modules/booking/passenger-esewa-checkout/passenger-esewa-checkout.mapper'
);
const {
  createPassengerEsewaCheckoutRecoveryService,
} = require(
  '../../../src/modules/booking/passenger-esewa-checkout/passenger-esewa-checkout-recovery.service'
);

function setup(verification) {
  const updates = [];
  let disputeCreated = 0;
  const transaction = { _id: 'case-1' };
  const service = createPassengerEsewaCheckoutRecoveryService({
    repository: {
      findTransactionByPaymentId: async () => null,
      createDisputedTransaction: async () => {
        disputeCreated += 1;
        return transaction;
      },
      updateAttempt: async (_id, update) => updates.push(update),
    },
    verifyPayment: async () => verification,
    sendDisputeAlert: async () => undefined,
    mapper,
  });
  return { service, updates, getDisputes: () => disputeCreated };
}

test('paid attempt with expired hold becomes an actionable dispute', async () => {
  const h = setup({ verified: true });
  const result = await h.service.resolveUnavailableHold({
    _id: 'attempt-1',
    transactionUuid: 'SM-1',
    gatewayAmount: 900,
  });
  assert.equal(result.statusCode, 409);
  assert.equal(
    result.body.errorCode,
    'PAYMENT_RECEIVED_BOOKING_DISPUTED'
  );
  assert.equal(result.body.caseId, 'case-1');
  assert.equal(h.getDisputes(), 1);
  assert.equal(h.updates.at(-1).status, 'DISPUTED');
});

test('unpaid expired attempt fails without creating a dispute', async () => {
  const h = setup({ verified: false, error: 'NOT_FOUND' });
  const result = await h.service.resolveUnavailableHold({
    _id: 'attempt-1',
    transactionUuid: 'SM-1',
    gatewayAmount: 900,
  });
  assert.equal(result.statusCode, 410);
  assert.equal(result.body.errorCode, 'BOOKING_HOLD_EXPIRED');
  assert.equal(h.getDisputes(), 0);
  assert.equal(h.updates.at(-1).status, 'FAILED');
});

test('a recorded successful transaction recovers a crash idempotently', async () => {
  const updates = [];
  const service = createPassengerEsewaCheckoutRecoveryService({
    repository: {
      findTransactionByPaymentId: async () => ({
        _id: 'txn-1',
        status: 'SUCCESS',
        bookingId: 'booking-1',
        ticketId: 'TKT-1',
      }),
      updateAttempt: async (_id, update) => updates.push(update),
    },
    verifyPayment: async () => ({ verified: true }),
    sendDisputeAlert: async () => undefined,
    mapper,
  });
  const result = await service.recoverRecordedTransaction({
    _id: 'attempt-1',
    userId: 'user-1',
    transactionUuid: 'SM-1',
    originalAmount: 900,
    discountAmount: 0,
    smMoneyApplied: 0,
    gatewayAmount: 900,
    finalAmount: 900,
    checkoutPayload: { seatNumbers: ['a1'] },
  });
  assert.equal(result.statusCode, 201);
  assert.equal(result.body.data.bookingId, 'booking-1');
  assert.equal(updates.at(-1).status, 'COMPLETED');
});
