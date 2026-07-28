'use strict';

/**
 * tests/unit/booking/passenger-post-payment-trip-validation-service.test.js
 * Unit tests for passenger post-payment trip validation service.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const mapper = require('../../../src/modules/booking/passenger-post-payment-trip-validation/passenger-post-payment-trip-validation.mapper.js');
const {
  createPassengerPostPaymentTripValidationService,
} = require('../../../src/modules/booking/passenger-post-payment-trip-validation/passenger-post-payment-trip-validation.service.js');

test('passengerPostPaymentTripValidationService unit tests', async (t) => {
  const fixedNow = new Date('2026-07-26T12:00:00Z');
  const createFixedDate = () => new Date(fixedNow.getTime());

  await t.test('1, 13 & 14. missing trip returns trip-not-found result and checks missing trip before cutoff and status', async () => {
    const repository = { findTripById: async () => null };
    const service = createPassengerPostPaymentTripValidationService({ repository, mapper, createDate: createFixedDate });

    const res = await service.validatePassengerPostPaymentTrip({ scheduleId: 's1', transactionId: 'txn_1' });
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.errorCode, 'BOOKING_CREATION_FAILED_PAYMENT_RECEIVED');
    assert.equal(res.disputeReason, 'Trip not found after payment verification');
  });

  await t.test('2, 3, 4, 5, 6 & 14. handles booking cutoff dates correctly against injected clock', async () => {
    const beforeNow = new Date('2026-07-26T11:59:59Z');
    const equalNow = new Date('2026-07-26T12:00:00Z');
    const afterNow = new Date('2026-07-26T12:00:01Z');

    // Case 1: Cutoff before now -> maps to booking-window-closed
    const repoBefore = { findTripById: async () => ({ status: 'scheduled', bookingClosesAt: beforeNow }) };
    const serviceBefore = createPassengerPostPaymentTripValidationService({ repository: repoBefore, mapper, createDate: createFixedDate });
    const resBefore = await serviceBefore.validatePassengerPostPaymentTrip({ scheduleId: 's1', transactionId: 'txn_1' });
    assert.equal(resBefore.statusCode, 400);
    assert.equal(resBefore.disputeReason, 'Booking window closed after payment was processed');

    // Case 2: Cutoff equal to now -> succeeds
    const repoEqual = { findTripById: async () => ({ status: 'scheduled', bookingClosesAt: equalNow }) };
    const serviceEqual = createPassengerPostPaymentTripValidationService({ repository: repoEqual, mapper, createDate: createFixedDate });
    const resEqual = await serviceEqual.validatePassengerPostPaymentTrip({ scheduleId: 's1', transactionId: 'txn_1' });
    assert.equal(resEqual.ok, true);

    // Case 3: Cutoff after now -> succeeds
    const repoAfter = { findTripById: async () => ({ status: 'scheduled', bookingClosesAt: afterNow }) };
    const serviceAfter = createPassengerPostPaymentTripValidationService({ repository: repoAfter, mapper, createDate: createFixedDate });
    const resAfter = await serviceAfter.validatePassengerPostPaymentTrip({ scheduleId: 's1', transactionId: 'txn_1' });
    assert.equal(resAfter.ok, true);

    // Case 4: Missing cutoff -> succeeds to status check
    const repoNullCutoff = { findTripById: async () => ({ status: 'scheduled', bookingClosesAt: null }) };
    const serviceNullCutoff = createPassengerPostPaymentTripValidationService({ repository: repoNullCutoff, mapper, createDate: createFixedDate });
    const resNullCutoff = await serviceNullCutoff.validatePassengerPostPaymentTrip({ scheduleId: 's1', transactionId: 'txn_1' });
    assert.equal(resNullCutoff.ok, true);
  });

  await t.test('7, 8, 9, 10 & 11. validates trip status (scheduled & boarding pass; case-sensitive; other statuses fail; returns exact trip)', async () => {
    const validStatuses = ['scheduled', 'boarding'];
    for (const status of validStatuses) {
      const dummyTrip = { _id: 't1', status };
      const repo = { findTripById: async () => dummyTrip };
      const service = createPassengerPostPaymentTripValidationService({ repository: repo, mapper, createDate: createFixedDate });
      const res = await service.validatePassengerPostPaymentTrip({ scheduleId: 't1', transactionId: 'tx' });
      assert.equal(res.ok, true);
      assert.equal(res.trip, dummyTrip);
    }

    const invalidStatuses = ['SCHEDULED', 'Boarding', 'cancelled', 'completed', 'active', 'in_progress', 'delayed'];
    for (const status of invalidStatuses) {
      const repo = { findTripById: async () => ({ status }) };
      const service = createPassengerPostPaymentTripValidationService({ repository: repo, mapper, createDate: createFixedDate });
      const res = await service.validatePassengerPostPaymentTrip({ scheduleId: 't1', transactionId: 'tx' });
      assert.equal(res.ok, false);
      assert.equal(res.statusCode, 400);
      assert.equal(res.disputeReason, `Trip status is "${status}" — not bookable after payment`);
    }
  });

  await t.test('12. propagates repository lookup errors', async () => {
    const repository = { findTripById: async () => { throw new Error('DB Lookup Exception'); } };
    const service = createPassengerPostPaymentTripValidationService({ repository, mapper, createDate: createFixedDate });
    await assert.rejects(async () => service.validatePassengerPostPaymentTrip({ scheduleId: 's1', transactionId: 'tx' }), { message: 'DB Lookup Exception' });
  });
});
