'use strict';
const mapper = require('../../src/modules/booking/passenger-esewa-checkout/passenger-esewa-checkout.mapper');
const { createPassengerEsewaCheckoutFinalizationService } = require('../../src/modules/booking/passenger-esewa-checkout/passenger-esewa-checkout-finalization.service');

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
    verifyPayment: async () => ({ verified: true }),
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

module.exports = { attempt, makeService };
