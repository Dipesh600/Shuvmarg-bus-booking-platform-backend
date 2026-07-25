'use strict';
/**
 * tests/characterization/payment-booking-confirm-validation.test.js
 * Characterizes confirmBooking pre-side-effect validation errors.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { setupConfirmHarness, makeConfirmReq, makeMockConfirmRes } = require('../helpers/payment-booking-confirm-harness.js');

test('confirmBooking validation characterization', async (t) => {
  let h;
  t.beforeEach(() => { h = setupConfirmHarness(); });
  t.afterEach(() => { h.restore(); });

  await t.test('1. empty request body', async () => {
    const res = makeMockConfirmRes();
    await h.confirmBooking({ body: null }, res);
    assert.equal(res.getStatus(), 400);
    assert.deepEqual(res.getJson(), { success: false, message: 'your body is empty please add' });
  });

  await t.test('2. unsupported payment gateway', async () => {
    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ gateway: 'stripe' }), res);
    assert.equal(res.getStatus(), 400);
    assert.deepEqual(res.getJson(), { success: false, message: 'The selected payment gateway is not supported.', errorCode: 'UNSUPPORTED_PAYMENT_GATEWAY' });
  });

  await t.test('3. missing tempBookingId', async () => {
    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ tempBookingId: null }), res);
    assert.equal(res.getStatus(), 400);
    assert.deepEqual(res.getJson(), { success: false, message: 'Missing required fields for booking confirmation' });
  });

  await t.test('4. invalid coupon during confirmation', async () => {
    h.mockMethod(h.CouponHelper, 'validateCoupon', () => Promise.resolve({ isValid: false, error: 'Invalid coupon' }));
    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ couponCode: 'BAD' }), res);
    assert.equal(res.getStatus(), 400);
    assert.deepEqual(res.getJson(), { success: false, message: 'Coupon validation failed: Invalid coupon', errorCode: 'COUPON_INVALID_DURING_CONFIRMATION' });
  });

  await t.test('5. amount mismatch in confirmation quote', async () => {
    h.mockMethod(h.CouponHelper, 'validateCoupon', () => Promise.resolve({
      isValid: true, discountAmount: 100, finalAmount: 500, coupon: { _id: 'c1', couponCode: 'BAD' }
    }));
    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ couponCode: 'BAD', originalAmount: 1000 }), res);
    assert.equal(res.getStatus(), 400);
    assert.deepEqual(res.getJson(), { success: false, message: 'Amount mismatch between coupon, wallet, and gateway calculations.', errorCode: 'AMOUNT_MISMATCH' });
  });

  await t.test('6. eSewa missing paymentId or paymentAmount', async () => {
    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ paymentId: null, paymentAmount: 1000 }), res);
    assert.equal(res.getStatus(), 400);
    assert.deepEqual(res.getJson(), { success: false, message: 'Missing paymentId or paymentAmount for eSewa confirmation', errorCode: 'ESEWA_PARAMS_MISSING' });
  });

  await t.test('7. wallet PIN required & malformed', async () => {
    const cases = [null, '123', 'abcd', '12345'];
    for (const pin of cases) {
      const res = makeMockConfirmRes();
      await h.confirmBooking(makeConfirmReq({ gateway: 'wallet', walletPin: pin }), res);
      assert.equal(res.getStatus(), 401);
      assert.deepEqual(res.getJson(), { success: false, message: 'Wallet PIN is required for wallet payments.', errorCode: 'WALLET_PIN_REQUIRED' });
    }
  });

  await t.test('8. wallet PIN not set', async () => {
    h.mockMethod(h.Wallet, 'findOne', () => Promise.resolve({ isPinSet: false, status: 'active' }));
    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ gateway: 'wallet', walletPin: '1234' }), res);
    assert.equal(res.getStatus(), 400);
    assert.deepEqual(res.getJson(), { success: false, message: 'Wallet PIN is not set. Please set up your wallet first.', errorCode: 'WALLET_PIN_NOT_SET' });
  });

  await t.test('9. wallet frozen', async () => {
    h.mockMethod(h.Wallet, 'findOne', () => Promise.resolve({ isPinSet: true, status: 'frozen' }));
    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ gateway: 'wallet', walletPin: '1234' }), res);
    assert.equal(res.getStatus(), 403);
    assert.deepEqual(res.getJson(), { success: false, message: 'Wallet is frozen. Please contact support.', errorCode: 'WALLET_FROZEN' });
  });

  await t.test('10. incorrect wallet PIN', async () => {
    h.mockMethod(h.bcrypt, 'compare', () => Promise.resolve(false));
    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ gateway: 'wallet', walletPin: '1234' }), res);
    assert.equal(res.getStatus(), 401);
    assert.deepEqual(res.getJson(), { success: false, message: 'Incorrect wallet PIN.', errorCode: 'WALLET_PIN_INVALID' });
  });
});
