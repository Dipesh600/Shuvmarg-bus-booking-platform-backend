'use strict';
/**
 * tests/characterization/payment-booking-prepare-pricing.test.js
 * Characterizes prepareBooking pricing, coupon, SM Money, and seat-hold responses.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { setupPrepareHarness, makePrepareReq, makeMockRes } = require('../helpers/payment-booking-prepare-harness.js');

test('prepareBooking pricing & hold characterization', async (t) => {
  let h;
  t.beforeEach(() => {
    h = setupPrepareHarness();
  });
  t.afterEach(() => { h.restore(); });

  await t.test('1. preparation without coupon or SM Money', async () => {
    const { res, getStatus, getJson } = makeMockRes();
    await h.prepareBooking(makePrepareReq({ scheduleId: 't1', seatNumbers: ['a1'], originalAmount: 1000 }), res);
    assert.equal(getStatus(), 200);
    const d = getJson().data;
    assert.equal(d.originalAmount, 1000);
    assert.equal(d.couponDiscount, 0);
    assert.equal(d.couponDetails, null);
    assert.equal(d.smMoneyApplied, 0);
    assert.equal(d.gatewayAmount, 1000);
    assert.equal(d.paymentAmount, 1000);
    assert.equal(d.totalDiscount, 0);
  });

  await t.test('2. valid coupon applied', async () => {
    h.mockMethod(h.CouponHelper, 'validateCoupon', () => Promise.resolve({
      isValid: true, discountAmount: 200, finalAmount: 800, coupon: { _id: 'c1', couponCode: 'SAVE200', title: 'Save 200', discountType: 'fixed', discountValue: 200 }
    }));
    const { res, getStatus, getJson } = makeMockRes();
    await h.prepareBooking(makePrepareReq({ scheduleId: 't1', seatNumbers: ['a1'], originalAmount: 1000, couponCode: 'SAVE200' }), res);
    assert.equal(getStatus(), 200);
    const d = getJson().data;
    assert.equal(d.couponDiscount, 200);
    assert.equal(d.afterCouponAmount, 800);
    assert.equal(d.gatewayAmount, 800);
  });

  await t.test('3. invalid coupon rejected', async () => {
    h.mockMethod(h.CouponHelper, 'validateCoupon', () => Promise.resolve({ isValid: false, error: 'Expired coupon', errorCode: 'COUPON_EXPIRED' }));
    const { res, getStatus, getJson } = makeMockRes();
    await h.prepareBooking(makePrepareReq({ scheduleId: 't1', seatNumbers: ['a1'], originalAmount: 1000, couponCode: 'EXPIRED' }), res);
    assert.equal(getStatus(), 400);
    assert.deepEqual(getJson(), { success: false, message: 'Expired coupon', errorCode: 'COUPON_EXPIRED' });
  });

  await t.test('4. SM Money pricing clamping & cap logic', async () => {
    h.mockMethod(h.smLedgerService, 'computeSpendableBalance', () => Promise.resolve({ display: 500 }));
    const { res, getStatus, getJson } = makeMockRes();
    await h.prepareBooking(makePrepareReq({ scheduleId: 't1', seatNumbers: ['a1'], originalAmount: 1000, smMoneyToUse: 600 }), res);
    assert.equal(getStatus(), 200);
    const d = getJson().data;
    assert.equal(d.smMoneyBalance, 500);
    assert.equal(d.smMoneyApplied, 500);
    assert.equal(d.gatewayAmount, 500);
  });

  await t.test('5. coupon discount reduces remaining SM Money cap', async () => {
    h.mockMethod(h.CouponHelper, 'validateCoupon', () => Promise.resolve({
      isValid: true, discountAmount: 700, finalAmount: 300, coupon: { _id: 'c1', couponCode: 'BIG700', title: 'Big', discountType: 'fixed', discountValue: 700 }
    }));
    h.mockMethod(h.smLedgerService, 'computeSpendableBalance', () => Promise.resolve({ display: 500 }));
    const { res, getStatus, getJson } = makeMockRes();
    await h.prepareBooking(makePrepareReq({ scheduleId: 't1', seatNumbers: ['a1'], originalAmount: 1000, couponCode: 'BIG700', smMoneyToUse: 300 }), res);
    assert.equal(getStatus(), 200);
    const d = getJson().data;
    assert.equal(d.couponDiscount, 700);
    assert.equal(d.maxSmMoneyAllowed, 100);
    assert.equal(d.smMoneyApplied, 100);
    assert.equal(d.gatewayAmount, 200);
  });

  await t.test('6. seat hold domain error passes to next', async () => {
    h.mockMethod(h.passengerSeatHold, 'createOrReusePassengerSeatHold', () => {
      const e = new Error('Hold error');
      e.statusCode = 409;
      throw e;
    });
    const { res, next, getNextErr } = makeMockRes();
    await h.prepareBooking(makePrepareReq({ scheduleId: 't1', seatNumbers: ['a1'], originalAmount: 1000 }), res, next);
    assert.ok(getNextErr());
    assert.equal(getNextErr().statusCode, 409);
  });
});
