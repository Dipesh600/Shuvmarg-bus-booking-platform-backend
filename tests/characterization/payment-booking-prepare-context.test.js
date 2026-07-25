'use strict';
/**
 * tests/characterization/payment-booking-prepare-context.test.js
 * Characterizes prepareBooking behaviour for malformed authentication context
 * and missing SM Money balance result.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { setupPrepareHarness, makeMockRes } = require('../helpers/payment-booking-prepare-harness.js');

const EXPECTED_500 = { success: false, message: 'Internal Server Error!' };

test('prepareBooking malformed context characterization', async (t) => {
  let h;
  t.beforeEach(() => { h = setupPrepareHarness(); });
  t.afterEach(() => { h.restore(); });

  await t.test('1. missing dbUser => HTTP 500 Internal Server Error', async () => {
    const origErr = console.error;
    console.error = () => {};
    try {
      let couponCalled = false;
      let holdCalled = false;
      let nextErr;
      h.mockMethod(h.CouponHelper, 'validateCoupon', () => { couponCalled = true; return Promise.resolve(h.defaults.couponValidation); });
      h.mockMethod(h.passengerSeatHold, 'createOrReusePassengerSeatHold', () => { holdCalled = true; return Promise.resolve(h.defaults.hold); });

      const { res, next, getStatus, getJson } = makeMockRes();
      const req = { body: { scheduleId: 't1', seatNumbers: ['A1'], originalAmount: 100 }, userInfo: { activeRole: 'passenger' } };
      await h.prepareBooking(req, res, (e) => { nextErr = e; });

      assert.equal(getStatus(), 500);
      assert.deepEqual(getJson(), EXPECTED_500);
      assert.equal(couponCalled, false, 'coupon not called for no-coupon request');
      assert.equal(holdCalled, false, 'seat hold must not be created');
      assert.equal(nextErr, undefined, 'next(error) must not be called for ordinary unexpected errors');
    } finally {
      console.error = origErr;
    }
  });

  await t.test('2. missing userInfo => HTTP 500 Internal Server Error', async () => {
    const origErr = console.error;
    console.error = () => {};
    try {
      let holdCalled = false;
      let nextErr;
      h.mockMethod(h.passengerSeatHold, 'createOrReusePassengerSeatHold', () => { holdCalled = true; return Promise.resolve(h.defaults.hold); });

      const { res, getStatus, getJson } = makeMockRes();
      const req = { body: { scheduleId: 't1', seatNumbers: ['A1'], originalAmount: 100 }, dbUser: { _id: 'u1' } };
      await h.prepareBooking(req, res, (e) => { nextErr = e; });

      assert.equal(getStatus(), 500);
      assert.deepEqual(getJson(), EXPECTED_500);
      assert.equal(holdCalled, false, 'seat hold must not be created');
      assert.equal(nextErr, undefined, 'next(error) must not be called for ordinary unexpected errors');
    } finally {
      console.error = origErr;
    }
  });

  await t.test('3. missing SM Money balance result => HTTP 500, hold not created', async () => {
    const origErr = console.error;
    console.error = () => {};
    try {
      let holdCalled = false;
      let nextErr;
      h.mockMethod(h.smLedgerService, 'computeSpendableBalance', () => Promise.resolve(null));
      h.mockMethod(h.passengerSeatHold, 'createOrReusePassengerSeatHold', () => { holdCalled = true; return Promise.resolve(h.defaults.hold); });

      const { res, getStatus, getJson } = makeMockRes();
      const req = { body: { scheduleId: 't1', seatNumbers: ['A1'], originalAmount: 100 }, dbUser: { _id: 'u1' }, userInfo: { activeRole: 'passenger' } };
      await h.prepareBooking(req, res, (e) => { nextErr = e; });

      assert.equal(getStatus(), 500);
      assert.deepEqual(getJson(), EXPECTED_500);
      assert.equal(holdCalled, false, 'seat hold must not be created after balance failure');
      assert.equal(nextErr, undefined, 'next(error) must not be called for ordinary unexpected errors');
    } finally {
      console.error = origErr;
    }
  });
});
