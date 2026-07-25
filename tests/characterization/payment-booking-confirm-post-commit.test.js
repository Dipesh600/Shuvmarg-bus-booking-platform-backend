'use strict';
/**
 * tests/characterization/payment-booking-confirm-post-commit.test.js
 * Characterizes post-commit side-effects and error isolation in confirmBooking.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { setupConfirmHarness, makeConfirmReq, makeMockConfirmRes } = require('../helpers/payment-booking-confirm-harness.js');

test('confirmBooking post-commit behavior characterization', async (t) => {
  let h;
  t.beforeEach(() => { h = setupConfirmHarness(); });
  t.afterEach(() => { h.restore(); });

  await t.test('1. post-commit side-effects succeed (hold complete, ledger link, coupon apply, cashback, notification)', async () => {
    let holdCompleted = false, ledgerUpdated = false, couponApplied = false, cashbackGenerated = false, notifSent = false;

    h.mockMethod(h.passengerSeatHold, 'completePassengerHold', () => { holdCompleted = true; return Promise.resolve(); });
    h.mockMethod(h.SMLedger, 'updateOne', () => { ledgerUpdated = true; return Promise.resolve(); });
    h.mockMethod(h.CouponHelper, 'applyCoupon', () => { couponApplied = true; return Promise.resolve(); });
    h.mockMethod(h.smLedgerService, 'generateCashback', () => { cashbackGenerated = true; return Promise.resolve({ scratchCard: { _id: 'sc123' } }); });
    h.defaults.onNotifSent = () => { notifSent = true; };

    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ couponCode: 'SAVE', smMoneyToUse: 100, paymentAmount: 900, originalAmount: 1000 }), res);
    await new Promise(r => setImmediate(r));

    assert.equal(res.getStatus(), 201);
    assert.equal(holdCompleted, true);
    assert.equal(ledgerUpdated, true);
    assert.equal(couponApplied, true);
    assert.equal(cashbackGenerated, true);
    assert.equal(notifSent, true);
    assert.equal(res.getJson().data.scratchCardId, 'sc123');
  });

  await t.test('2. post-commit failures in optional side-effects do not alter 201 success response', async () => {
    h.mockMethod(h.passengerSeatHold, 'completePassengerHold', () => Promise.reject(new Error('Hold err')));
    h.mockMethod(h.SMLedger, 'updateOne', () => Promise.reject(new Error('Ledger err')));
    h.mockMethod(h.CouponHelper, 'applyCoupon', () => Promise.reject(new Error('Coupon err')));
    h.mockMethod(h.smLedgerService, 'generateCashback', () => Promise.reject(new Error('Cashback err')));
    h.defaults.onNotifSent = () => { throw new Error('Notif err'); };

    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ couponCode: 'SAVE', smMoneyToUse: 100, paymentAmount: 900, originalAmount: 1000 }), res);

    assert.equal(res.getStatus(), 201);
    assert.equal(res.getJson().success, true);
    assert.ok(res.getJson().data.ticketId);
  });

  await t.test('3. unexpected exception post-commit returns 201 committed response', async () => {
    h.mockMethod(h.passengerSeatHold, 'completePassengerHold', () => { throw new Error('Uncaught post-commit crash'); });

    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq(), res);

    assert.equal(res.getStatus(), 201);
    assert.equal(res.getJson().success, true);
  });
});
