'use strict';
/**
 * tests/characterization/payment-booking-confirm-booking.test.js
 * Characterizes booking persistence and failure rollbacks in confirmBooking.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { setupConfirmHarness, makeConfirmReq, makeMockConfirmRes } = require('../helpers/payment-booking-confirm-harness.js');

test('confirmBooking booking creation characterization', async (t) => {
  let h;
  t.beforeEach(() => { h = setupConfirmHarness(); });
  t.afterEach(() => { h.restore(); });

  await t.test('1. successful booking persistence and field assignment', async () => {
    let createdBookingPayload;
    h.mockMethod(h.Booking, 'create', (doc) => {
      createdBookingPayload = doc;
      return Promise.resolve({ ...doc, _id: 'b123' });
    });

    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ passengerDetails: [{ name: 'Ram', age: 30, gender: 'M' }] }), res);
    assert.equal(res.getStatus(), 201);
    assert.ok(createdBookingPayload);
    assert.equal(createdBookingPayload.bookedVia, 'APP');
    assert.equal(createdBookingPayload.passengerDetails[0].name, 'Ram');
    assert.ok(createdBookingPayload.ticketId);
    assert.equal(res.getJson().data.bookingId, 'b123');
  });

  await t.test('2. Booking.create failure rolls back seats, reverses SM debit, and sets transaction DISPUTED', async () => {
    let rollbacksCalled = false;
    let reversedCalled = false;
    let disputedReason;

    h.mockMethod(h.Booking, 'create', () => Promise.reject(new Error('Mongo write error')));
    h.mockMethod(h.smLedgerService, 'reverseDebit', () => { reversedCalled = true; return Promise.resolve(); });
    h.mockMethod(h.Transaction, 'findByIdAndUpdate', (id, update) => { disputedReason = update.disputeReason; return Promise.resolve({}); });
    h.mockMethod(h.Seat, 'findOneAndUpdate', (filter) => {
      if (JSON.stringify(filter).includes('$elemMatch')) rollbacksCalled = true;
      return Promise.resolve({});
    });

    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ smMoneyToUse: 100, paymentAmount: 900, originalAmount: 1000 }), res);

    assert.equal(res.getStatus(), 500);
    const body = res.getJson();
    assert.equal(body.success, false);
    assert.equal(body.errorCode, 'BOOKING_CREATION_FAILED_PAYMENT_RECEIVED');
    assert.ok(body.message.includes('ticket creation failed'));
    assert.ok(disputedReason.includes('Booking.create() failed'));
    assert.equal(reversedCalled, true);
    assert.equal(rollbacksCalled, true);
  });

  await t.test('3. transaction SUCCESS update returning null returns 409 RECONCILIATION_REQUIRED', async () => {
    h.mockMethod(h.Transaction, 'findOneAndUpdate', () => Promise.resolve(null));

    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq(), res);

    assert.equal(res.getStatus(), 409);
    assert.deepEqual(res.getJson(), {
      success: false,
      message: 'Your payment and booking were received, but final reconciliation is still required.',
      caseId: '507f1f77bcf86cd799439011',
      errorCode: 'BOOKING_RECONCILIATION_REQUIRED'
    });
  });
});
