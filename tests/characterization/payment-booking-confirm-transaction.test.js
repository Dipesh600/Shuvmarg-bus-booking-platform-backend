'use strict';
/**
 * tests/characterization/payment-booking-confirm-transaction.test.js
 * Characterizes transaction creation and post-payment trip verification.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { setupConfirmHarness, makeConfirmReq, makeMockConfirmRes } = require('../helpers/payment-booking-confirm-harness.js');

test('confirmBooking transaction & trip safety characterization', async (t) => {
  let h;
  t.beforeEach(() => { h = setupConfirmHarness(); });
  t.afterEach(() => { h.restore(); });

  await t.test('1. trip missing after payment marks transaction DISPUTED', async () => {
    let disputedReason, reversed = false;
    h.mockMethod(h.Trip, 'findById', () => ({ lean: () => Promise.resolve(null) }));
    h.mockMethod(h.Transaction, 'findByIdAndUpdate', (id, update) => { disputedReason = update.disputeReason; return Promise.resolve({}); });
    h.mockMethod(h.smLedgerService, 'reverseDebit', () => { reversed = true; return Promise.resolve(); });

    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ smMoneyToUse: 200, paymentAmount: 800, originalAmount: 1000 }), res);

    assert.equal(res.getStatus(), 404);
    const body = res.getJson();
    assert.equal(body.success, false);
    assert.equal(body.errorCode, 'BOOKING_CREATION_FAILED_PAYMENT_RECEIVED');
    assert.ok(body.message.includes('trip was not found'));
    assert.equal(disputedReason, 'Trip not found after payment verification');
    assert.equal(reversed, true);
  });

  await t.test('2. booking window closed after payment marks transaction DISPUTED', async () => {
    let disputedReason;
    h.mockMethod(h.Trip, 'findById', () => ({ lean: () => Promise.resolve({ status: 'scheduled', bookingClosesAt: new Date(Date.now() - 1000) }) }));
    h.mockMethod(h.Transaction, 'findByIdAndUpdate', (id, update) => { disputedReason = update.disputeReason; return Promise.resolve({}); });

    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq(), res);

    assert.equal(res.getStatus(), 400);
    const body = res.getJson();
    assert.equal(body.errorCode, 'BOOKING_CREATION_FAILED_PAYMENT_RECEIVED');
    assert.ok(body.message.includes('booking has closed'));
    assert.equal(disputedReason, 'Booking window closed after payment was processed');
  });

  await t.test('3. trip status unbookable after payment marks transaction DISPUTED', async () => {
    let disputedReason;
    h.mockMethod(h.Trip, 'findById', () => ({ lean: () => Promise.resolve({ status: 'completed' }) }));
    h.mockMethod(h.Transaction, 'findByIdAndUpdate', (id, update) => { disputedReason = update.disputeReason; return Promise.resolve({}); });

    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq(), res);

    assert.equal(res.getStatus(), 400);
    const body = res.getJson();
    assert.equal(body.errorCode, 'BOOKING_CREATION_FAILED_PAYMENT_RECEIVED');
    assert.ok(body.message.includes('trip is no longer available'));
    assert.equal(disputedReason, 'Trip status is "completed" — not bookable after payment');
  });

  await t.test('4. transaction payload created with exact metadata', async () => {
    let createdTxn;
    h.mockMethod(h.Transaction, 'create', (payload) => { createdTxn = payload; return Promise.resolve({ _id: 'txn123', ...payload }); });

    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ gateway: 'esewa', paymentId: 'esewa_pay_1' }), res);

    assert.equal(res.getStatus(), 201);
    assert.equal(createdTxn.transactionType, 'BOOKING');
    assert.equal(createdTxn.status, 'PAYMENT_RECEIVED');
    assert.equal(createdTxn.gateway, 'esewa');
    assert.equal(createdTxn.transactionId, 'esewa_pay_1');
  });
});
