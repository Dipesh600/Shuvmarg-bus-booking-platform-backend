'use strict';

/**
 * tests/unit/booking/passenger-seat-commitment-mapper.test.js
 * Unit tests for passenger seat commitment mapper.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const mapper = require('../../../src/modules/booking/passenger-seat-commitment/passenger-seat-commitment.mapper.js');

test('passengerSeatCommitmentMapper unit tests', async (t) => {

  await t.test('1-3 & 13. mapPassengerSeatDataNotFound returns exact 404 result shape, rollback: false, and caseId', () => {
    const res = mapper.mapPassengerSeatDataNotFound({ transactionId: 'txn_seat_404' });
    assert.deepEqual(res, {
      ok: false,
      failureType: 'SEAT_DATA_NOT_FOUND',
      statusCode: 404,
      body: {
        success: false,
        message: 'Your payment was received but seat data is missing. Your case ID is txn_seat_404. We will resolve this within 2 hours.',
        caseId: 'txn_seat_404',
        errorCode: 'BOOKING_CREATION_FAILED_PAYMENT_RECEIVED',
      },
      disputeReason: 'Seat data not found for trip after payment',
      compensationReason: 'Seat data not found after payment',
      adminAlertReason: 'Seat data not found for trip after payment',
      rollbackRequired: false,
    });
  });

  await t.test('4, 5, 6, 9-14. mapPassengerSeatLockFailed formats invalid-seat-only failure correctly', () => {
    const res = mapper.mapPassengerSeatLockFailed({
      transactionId: 'txn_inv',
      invalidSeats: ['Z1', 'Z2'],
      alreadyBookedSeats: [],
    });

    assert.equal(res.ok, false);
    assert.equal(res.failureType, 'SEAT_LOCK_FAILED');
    assert.equal(res.statusCode, 409);
    assert.equal(res.rollbackRequired, true);
    assert.equal(res.fullReason, 'Invalid seat(s): Z1, Z2');
    assert.equal(
      res.body.message,
      'Your payment was received but the requested seats are no longer available. Your case ID is txn_inv. We will resolve this within 2 hours. (Invalid seat(s): Z1, Z2)'
    );
    assert.equal(res.disputeReason, 'Seat lock failed after payment: Invalid seat(s): Z1, Z2');
    assert.equal(res.compensationReason, 'Seat lock failed: Invalid seat(s): Z1, Z2');
    assert.equal(res.adminAlertReason, 'Seat lock failed: Invalid seat(s): Z1, Z2');
    assert.deepEqual(res.invalidSeats, ['Z1', 'Z2']);
    assert.deepEqual(res.alreadyBookedSeats, []);
  });

  await t.test('7. mapPassengerSeatLockFailed formats already-booked-only failure correctly with em dash', () => {
    const res = mapper.mapPassengerSeatLockFailed({
      transactionId: 'txn_bk',
      invalidSeats: [],
      alreadyBookedSeats: ['A1'],
    });

    assert.equal(res.fullReason, 'Already booked: A1 — taken during payment');
    assert.equal(res.disputeReason, 'Seat lock failed after payment: Already booked: A1 — taken during payment');
  });

  await t.test('8. mapPassengerSeatLockFailed combines invalid and already-booked in exact order joined by pipe', () => {
    const res = mapper.mapPassengerSeatLockFailed({
      transactionId: 'txn_both',
      invalidSeats: ['Z9'],
      alreadyBookedSeats: ['B2'],
    });

    assert.equal(res.fullReason, 'Invalid seat(s): Z9 | Already booked: B2 — taken during payment');
    assert.equal(
      res.disputeReason,
      'Seat lock failed after payment: Invalid seat(s): Z9 | Already booked: B2 — taken during payment'
    );
  });
});
