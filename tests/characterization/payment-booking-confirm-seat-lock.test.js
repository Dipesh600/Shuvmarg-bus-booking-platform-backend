'use strict';
/**
 * tests/characterization/payment-booking-confirm-seat-lock.test.js
 * Characterizes atomic seat locking and rollback in confirmBooking.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { setupConfirmHarness, makeConfirmReq, makeMockConfirmRes } = require('../helpers/payment-booking-confirm-harness.js');

test('confirmBooking seat lock & rollback characterization', async (t) => {
  let h;
  t.beforeEach(() => { h = setupConfirmHarness(); });
  t.afterEach(() => { h.restore(); });

  await t.test('1. seat document not found after payment', async () => {
    let disputedReason;
    h.mockMethod(h.Seat, 'findOne', () => Promise.resolve(null));
    h.mockMethod(h.Transaction, 'findByIdAndUpdate', (id, update) => { disputedReason = update.disputeReason; return Promise.resolve({}); });

    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq(), res);

    assert.equal(res.getStatus(), 404);
    assert.equal(res.getJson().errorCode, 'BOOKING_CREATION_FAILED_PAYMENT_RECEIVED');
    assert.equal(disputedReason, 'Seat data not found for trip after payment');
  });

  await t.test('2. seat lock failure triggers rollback, SM debit reversal, and DISPUTED status', async () => {
    let rollbacks = [];
    let reversed = false;
    let disputedReason;

    h.mockMethod(h.Seat, 'findOneAndUpdate', (filter) => {
      if (filter['seata']) return Promise.resolve(null); // lock failed (already booked or missing)
      if (filter.$elemMatch) rollbacks.push(filter);
      return Promise.resolve(null);
    });
    h.mockMethod(h.smLedgerService, 'reverseDebit', () => { reversed = true; return Promise.resolve(); });
    h.mockMethod(h.Transaction, 'findByIdAndUpdate', (id, update) => { disputedReason = update.disputeReason; return Promise.resolve({}); });

    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ smMoneyToUse: 100, paymentAmount: 900, originalAmount: 1000 }), res);

    assert.equal(res.getStatus(), 409);
    const body = res.getJson();
    assert.equal(body.errorCode, 'BOOKING_CREATION_FAILED_PAYMENT_RECEIVED');
    assert.ok(body.message.includes('requested seats are no longer available'));
    assert.ok(disputedReason.includes('Seat lock failed'));
    assert.equal(reversed, true);
  });

  await t.test('3. successful lock updates seat status atomically', async () => {
    let lockQuery;
    h.mockMethod(h.Seat, 'findOneAndUpdate', (filter, update) => {
      lockQuery = { filter, update };
      return Promise.resolve({ _id: 'seat-doc' });
    });

    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq(), res);

    assert.equal(res.getStatus(), 201);
    assert.ok(lockQuery.filter['seata']);
    assert.equal(lockQuery.update.$set['seata.$[elem].booked'], true);
  });
});
