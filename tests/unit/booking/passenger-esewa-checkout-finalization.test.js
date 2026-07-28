'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mapper = require(
  '../../../src/modules/booking/passenger-esewa-checkout/passenger-esewa-checkout.mapper'
);
const {
  createPassengerEsewaCheckoutFinalizationService,
} = require('../../../src/modules/booking/passenger-esewa-checkout/passenger-esewa-checkout-finalization.service');

function attempt(overrides = {}) {
  return {
    _id: 'attempt-1',
    userId: 'user-1',
    holdId: 'hold-1',
    tempBookingId: 'TEMP-1',
    transactionUuid: 'SM-1',
    productCode: 'EPAYTEST',
    gatewayAmount: 900,
    status: 'INITIATED',
    checkoutPayload: {
      tempBookingId: 'TEMP-1',
      scheduleId: 'trip-1',
      seatNumbers: ['a1'],
      passengerDetails: [
        { name: 'Ram', gender: 'male', seatNo: 'a1' },
      ],
    },
    confirmationQuote: {
      gatewayAmount: 900,
      finalAmount: 900,
      smMoneyApplied: 0,
      discountAmount: 0,
    },
    ...overrides,
  };
}

function makeService(overrides = {}) {
  const current = attempt();
  const updates = [];
  const repository = {
    findOwnedAttempt: async () => current,
    claimOwnedAttempt: async () => current,
    findHoldByAttempt: async () => ({
      _id: 'hold-1',
      userId: 'user-1',
      tripId: 'trip-1',
      tempBookingId: 'TEMP-1',
      seatNumbers: ['a1'],
      originalAmount: 900,
      status: 'held',
      expiresAt: new Date(Date.now() + 60_000),
    }),
    updateAttempt: async (_id, update) => updates.push(update),
    ...overrides.repository,
  };
  let capturedRequest;
  const service = createPassengerEsewaCheckoutFinalizationService({
    readConfig: () => ({ secretKey: 'secret' }),
    repository,
    signature: {},
    mapper,
    validateResponse: () => null,
    orchestrate: async ({ req }) => {
      capturedRequest = req;
      return {
        statusCode: 201,
        body: {
          success: true,
          data: { bookingId: 'booking-1', ticketId: 'TKT-1' },
        },
      };
    },
    recovery: {
      recoverRecordedTransaction: async () => null,
      resolveUnavailableHold: async () => {
        throw new Error('not expected');
      },
      markDisputed: async () => {
        throw new Error('not expected');
      },
    },
    ...overrides.deps,
  });
  return { service, current, updates, getRequest: () => capturedRequest };
}

test('finalization uses the owned attempt snapshot and completes once', async () => {
  const h = makeService();
  const result = await h.service({
    userId: 'user-1',
    activeRole: 'passenger',
    transactionUuid: 'SM-1',
  });
  assert.equal(result.statusCode, 201);
  assert.equal(h.getRequest().body.paymentAmount, 900);
  assert.equal(h.getRequest().body.paymentId, 'SM-1');
  assert.equal(h.getRequest().paymentAttemptQuote, h.current.confirmationQuote);
  assert.equal(h.updates.at(-1).status, 'COMPLETED');
  assert.equal(h.updates.at(-1).bookingId, 'booking-1');
});

test('completed attempts are idempotent and do not run confirmation again', async () => {
  const stored = {
    statusCode: 201,
    body: { success: true, data: { bookingId: 'booking-1' } },
  };
  let claimed = false;
  const h = makeService({
    repository: {
      findOwnedAttempt: async () => attempt({
        status: 'COMPLETED',
        result: stored,
      }),
      claimOwnedAttempt: async () => {
        claimed = true;
      },
    },
  });
  assert.equal(
    await h.service({ userId: 'user-1', transactionUuid: 'SM-1' }),
    stored
  );
  assert.equal(claimed, false);
});

test('foreign and concurrently claimed attempts are rejected', async () => {
  const missing = makeService({
    repository: { findOwnedAttempt: async () => null },
  });
  const notFound = await missing.service({
    userId: 'other',
    transactionUuid: 'SM-1',
  });
  assert.equal(notFound.body.errorCode, 'ESEWA_PAYMENT_ATTEMPT_NOT_FOUND');

  const busy = makeService({
    repository: { claimOwnedAttempt: async () => null },
  });
  const conflict = await busy.service({
    userId: 'user-1',
    transactionUuid: 'SM-1',
  });
  assert.equal(conflict.body.errorCode, 'ESEWA_PAYMENT_CONFIRMATION_IN_PROGRESS');
});
