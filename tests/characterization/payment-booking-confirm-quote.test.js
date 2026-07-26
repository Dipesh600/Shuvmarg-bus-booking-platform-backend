'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { setupConfirmHarness, makeConfirmReq, makeMockConfirmRes } = require('../helpers/payment-booking-confirm-harness.js');

test('confirmBooking quote & context characterization', async (t) => {
  let h;
  t.beforeEach(() => { h = setupConfirmHarness(); });
  t.afterEach(() => { h.restore(); });

  function attachSpies() {
    const calls = { debit: 0, esewa: 0, txn: 0, seatLock: 0, booking: 0, coupon: 0, balance: 0, config: 0 };
    h.mockMethod(h.smLedgerService, 'debitLedgerFIFO', () => { calls.debit++; return Promise.resolve({}); });
    h.esewaStub._impl = () => { calls.esewa++; return Promise.resolve({ verified: true }); };
    h.mockMethod(h.Transaction, 'create', () => { calls.txn++; return Promise.resolve({}); });
    h.mockMethod(h.Seat, 'findOneAndUpdate', () => { calls.seatLock++; return Promise.resolve({}); });
    h.mockMethod(h.Booking, 'create', () => { calls.booking++; return Promise.resolve([]); });
    h.mockMethod(h.CouponHelper, 'validateCoupon', () => { calls.coupon++; return Promise.resolve({ isValid: true }); });
    h.mockMethod(h.smLedgerService, 'computeSpendableBalance', () => { calls.balance++; return Promise.resolve({ display: 1000 }); });
    h.mockMethod(h.PlatformConfig, 'getConfig', () => { calls.config++; return Promise.resolve({ maxDiscountPercent: 80 }); });
    return calls;
  }

  await t.test('1. unsupported gateway returns 400 UNSUPPORTED_PAYMENT_GATEWAY', async () => {
    const calls = attachSpies(), res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ gateway: 'stripe' }), res);
    assert.equal(res.getStatus(), 400);
    assert.equal(res.getJson().errorCode, 'UNSUPPORTED_PAYMENT_GATEWAY');
    assert.deepEqual(calls, { debit: 0, esewa: 0, txn: 0, seatLock: 0, booking: 0, coupon: 0, balance: 0, config: 0 });
  });

  await t.test('2. missing tempBookingId returns 400 and zeroes side effects', async () => {
    const calls = attachSpies(), res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ tempBookingId: null }), res);
    assert.equal(res.getStatus(), 400);
    assert.equal(res.getJson().message, 'Missing required fields for booking confirmation');
    assert.deepEqual(calls, { debit: 0, esewa: 0, txn: 0, seatLock: 0, booking: 0, coupon: 0, balance: 0, config: 0 });
  });

  await t.test('3. unsupported gateway wins over missing tempBookingId', async () => {
    const calls = attachSpies(), res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ gateway: 'invalid', tempBookingId: null }), res);
    assert.equal(res.getStatus(), 400);
    assert.equal(res.getJson().errorCode, 'UNSUPPORTED_PAYMENT_GATEWAY');
    assert.deepEqual(calls, { debit: 0, esewa: 0, txn: 0, seatLock: 0, booking: 0, coupon: 0, balance: 0, config: 0 });
  });

  await t.test('4. invalid coupon returns 400 COUPON_INVALID_DURING_CONFIRMATION', async () => {
    h.mockMethod(h.CouponHelper, 'validateCoupon', () => Promise.resolve({ isValid: false, error: 'Expired' }));
    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ couponCode: 'INVALID' }), res);
    assert.equal(res.getStatus(), 400);
    assert.equal(res.getJson().errorCode, 'COUPON_INVALID_DURING_CONFIRMATION');
  });

  await t.test('5. amount mismatch returns 400 AMOUNT_MISMATCH', async () => {
    h.mockMethod(h.CouponHelper, 'validateCoupon', () => Promise.resolve({ isValid: true, discountAmount: 100, finalAmount: 500, coupon: { _id: 'c1', couponCode: 'MISMATCH' } }));
    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ couponCode: 'MISMATCH', originalAmount: 1000 }), res);
    assert.equal(res.getStatus(), 400);
    assert.equal(res.getJson().errorCode, 'AMOUNT_MISMATCH');
  });

  await t.test('6. no coupon skips CouponHelper.validateCoupon', async () => {
    let couponCalled = false;
    h.mockMethod(h.CouponHelper, 'validateCoupon', () => { couponCalled = true; return Promise.resolve({ isValid: true }); });
    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ couponCode: '' }), res);
    assert.equal(res.getStatus(), 201);
    assert.equal(couponCalled, false);
  });

  await t.test('7. positive smMoneyToUse loads spendable balance & config', async () => {
    let balanceCalled = false, configCalled = false;
    h.mockMethod(h.smLedgerService, 'computeSpendableBalance', () => { balanceCalled = true; return Promise.resolve({ display: 1000 }); });
    h.mockMethod(h.PlatformConfig, 'getConfig', () => { configCalled = true; return Promise.resolve({ maxDiscountPercent: 80 }); });
    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ smMoneyToUse: 100, paymentAmount: 900, originalAmount: 1000 }), res);
    assert.equal(res.getStatus(), 201);
    assert.equal(balanceCalled, true); assert.equal(configCalled, true);
  });

  await t.test('8. zero smMoneyToUse skips balance & config lookup', async () => {
    let balanceCalled = false;
    h.mockMethod(h.smLedgerService, 'computeSpendableBalance', () => { balanceCalled = true; return Promise.resolve({ display: 1000 }); });
    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ smMoneyToUse: 0 }), res);
    assert.equal(res.getStatus(), 201);
    assert.equal(balanceCalled, false);
  });

  await t.test('9. wallet gateway quote sets gatewayAmount to zero before debit', async () => {
    let debitedAmount = null;
    h.mockMethod(h.smLedgerService, 'debitLedgerFIFO', (args) => { debitedAmount = args.amount; return Promise.resolve({ _id: 'd1' }); });
    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ gateway: 'wallet', walletPin: '1234', paymentAmount: 1000, originalAmount: 1000 }), res);
    assert.equal(res.getStatus(), 201);
    assert.equal(debitedAmount, 1000);
  });

  await t.test('10. unsupported gateway + missing dbUser -> 400 unsupported gateway', async () => {
    const calls = attachSpies(), req = makeConfirmReq({ gateway: 'unsupported_gateway' }), res = makeMockConfirmRes();
    delete req.dbUser; delete req.bookingHold; delete req.userInfo;
    await h.confirmBooking(req, res);
    assert.equal(res.getStatus(), 400);
    assert.equal(res.getJson().errorCode, 'UNSUPPORTED_PAYMENT_GATEWAY');
    assert.deepEqual(calls, { debit: 0, esewa: 0, txn: 0, seatLock: 0, booking: 0, coupon: 0, balance: 0, config: 0 });
  });

  await t.test('11. missing tempBookingId + missing dbUser -> 400 missing reference', async () => {
    const calls = attachSpies(), req = makeConfirmReq({ tempBookingId: null }), res = makeMockConfirmRes();
    delete req.dbUser; delete req.bookingHold; delete req.userInfo;
    await h.confirmBooking(req, res);
    assert.equal(res.getStatus(), 400);
    assert.equal(res.getJson().message, 'Missing required fields for booking confirmation');
    assert.deepEqual(calls, { debit: 0, esewa: 0, txn: 0, seatLock: 0, booking: 0, coupon: 0, balance: 0, config: 0 });
  });

  await t.test('12. valid gateway and reference + missing dbUser -> 500', async () => {
    const calls = attachSpies(), req = makeConfirmReq(), res = makeMockConfirmRes();
    delete req.dbUser;
    await h.confirmBooking(req, res);
    assert.equal(res.getStatus(), 500);
    assert.deepEqual(calls, { debit: 0, esewa: 0, txn: 0, seatLock: 0, booking: 0, coupon: 0, balance: 0, config: 0 });
  });

  await t.test('13. valid gateway and reference + missing bookingHold -> 500', async () => {
    const calls = attachSpies(), req = makeConfirmReq(), res = makeMockConfirmRes();
    delete req.bookingHold;
    await h.confirmBooking(req, res);
    assert.equal(res.getStatus(), 500);
    assert.deepEqual(calls, { debit: 0, esewa: 0, txn: 0, seatLock: 0, booking: 0, coupon: 0, balance: 0, config: 0 });
  });

  await t.test('14. valid gateway and reference + missing userInfo -> 500', async () => {
    const calls = attachSpies(), req = makeConfirmReq(), res = makeMockConfirmRes();
    delete req.userInfo;
    await h.confirmBooking(req, res);
    assert.equal(res.getStatus(), 500);
    assert.deepEqual(calls, { debit: 0, esewa: 0, txn: 0, seatLock: 0, booking: 0, coupon: 0, balance: 0, config: 0 });
  });
});
