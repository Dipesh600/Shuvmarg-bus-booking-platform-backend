'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const passengerSeatHold = require('../../src/modules/booking/passenger-seat-hold');
const { setupPrepareHarness, makePrepareReq, makeMockRes } = require('../helpers/payment-booking-prepare-harness.js');

test('prepareBooking validation characterization', async (t) => {
  let h;
  t.beforeEach(() => { h = setupPrepareHarness(); });
  t.afterEach(() => { h.restore(); });

  await t.test('1. empty request body', async () => {
    const { res, getStatus, getJson } = makeMockRes();
    await h.prepareBooking({ body: null }, res);
    assert.equal(getStatus(), 400);
    assert.deepEqual(getJson(), { success: false, message: 'your body is empty please add' });
  });

  await t.test('2. missing required fields', async () => {
    const cases = [{ seatNumbers: ['A1'] }, { scheduleId: 't1' },
      { scheduleId: 't1', seatNumbers: [] }];
    for (const b of cases) {
      const { res, getStatus, getJson } = makeMockRes();
      await h.prepareBooking(makePrepareReq(b), res);
      assert.equal(getStatus(), 400);
      assert.deepEqual(getJson(), { success: false, message: 'Missing required fields: scheduleId, seatNumbers' });
    }
  });

  await t.test('3. trip not found', async () => {
    h.mockMethod(h.Trip, 'findById', () => {
      const query = { select: () => query, populate: () => query, lean: () => Promise.resolve(null) };
      return query;
    });
    const { res, getStatus, getJson } = makeMockRes();
    await h.prepareBooking(makePrepareReq({ scheduleId: 't1', seatNumbers: ['A1'], originalAmount: 100 }), res);
    assert.equal(getStatus(), 404);
    assert.deepEqual(getJson(), { success: false, message: 'Trip not found.' });
  });

  await t.test('4. booking window closed', async () => {
    h.mockMethod(h.Trip, 'findById', () => {
      const query = { select: () => query, populate: () => query, lean: () => Promise.resolve({ status: 'scheduled', bookingClosesAt: new Date(Date.now() - 1000) }) };
      return query;
    });
    const { res, getStatus, getJson } = makeMockRes();
    await h.prepareBooking(makePrepareReq({ scheduleId: 't1', seatNumbers: ['A1'], originalAmount: 100 }), res);
    assert.equal(getStatus(), 400);
    assert.deepEqual(getJson(), { success: false, message: 'Online booking has closed for this trip. Bookings can no longer be accepted.', errorCode: 'BOOKING_WINDOW_CLOSED' });
  });

  await t.test('5. trip status not bookable', async () => {
    h.mockMethod(h.Trip, 'findById', () => {
      const query = { select: () => query, populate: () => query, lean: () => Promise.resolve({ status: 'completed' }) };
      return query;
    });
    const { res, getStatus, getJson } = makeMockRes();
    await h.prepareBooking(makePrepareReq({ scheduleId: 't1', seatNumbers: ['A1'], originalAmount: 100 }), res);
    assert.equal(getStatus(), 400);
    assert.deepEqual(getJson(), { success: false, message: 'Bookings are not available for trips with status: completed', errorCode: 'TRIP_NOT_BOOKABLE' });
  });

  await t.test('valid prepare request crosses the seat-normalization facade boundary', async () => {
    assert.equal(typeof h.passengerSeatHold.normalizeSeatNumbers, 'function');
    assert.equal(h.passengerSeatHold.normalizeSeatNumbers, passengerSeatHold.policy.normalizeSeatNumbers);
    let seatFindCount = 0, validateCouponCount = 0, computeBalanceCount = 0, getConfigCount = 0, createHoldCount = 0;
    let createHoldArgs = null;

    h.mockMethod(h.Seat, 'findOne', () => { seatFindCount++; return Promise.resolve(h.defaults.seatDoc); });
    h.mockMethod(h.CouponHelper, 'validateCoupon', () => { validateCouponCount++; return Promise.resolve(h.defaults.couponValidation); });
    h.mockMethod(h.smLedgerService, 'computePurchaseBalance', () => { computeBalanceCount++; return Promise.resolve({ display: h.defaults.spendableBalance.display, refund: 0, restricted: h.defaults.spendableBalance.display }); });
    h.mockMethod(h.PlatformConfig, 'getConfig', () => { getConfigCount++; return Promise.resolve(h.defaults.smConfig); });
    h.mockMethod(h.passengerSeatHold, 'createOrReusePassengerSeatHold', (args) => {
      createHoldCount++;
      createHoldArgs = args;
      return Promise.resolve(h.defaults.hold);
    });

    const req = makePrepareReq({ scheduleId: '507f1f77bcf86cd799439011', seatNumbers: ['A1'], originalAmount: 1, smMoneyToUse: 0 });
    const { res, getStatus, getJson } = makeMockRes();
    await h.prepareBooking(req, res);

    assert.equal(getStatus(), 200);
    assert.equal(seatFindCount, 1);
    assert.equal(validateCouponCount, 0);
    assert.equal(computeBalanceCount, 1);
    assert.equal(getConfigCount, 1);
    assert.equal(createHoldCount, 1);
    assert.deepEqual(createHoldArgs.seatNumbers, ['a1']);

    const body = getJson();
    assert.equal(body.success, true);
    const d = body.data;
    assert.equal(d.tempBookingId, 'TB1');
    assert.equal(d.scheduleId, '507f1f77bcf86cd799439011');
    assert.deepEqual(d.seats, ['a1']);
    assert.equal(d.originalAmount, 1000);
    assert.equal(d.couponDiscount, 0);
    assert.equal(d.afterCouponAmount, 1000);
    assert.equal(d.smMoneyApplied, 0);
    assert.equal(d.gatewayAmount, 1000);
    assert.equal(d.paymentAmount, 1000);
    assert.ok(d.expiresAt);
  });

  await t.test('6. injected normalization domain error is preserved', async () => {
    h.mockMethod(h.passengerSeatHold, 'normalizeSeatNumbers', () => {
      const e = new Error('Normalized error');
      e.statusCode = 422;
      e.responseBody = { success: false, message: 'Normalized error' };
      throw e;
    });
    const { res, getStatus, getJson } = makeMockRes();
    await h.prepareBooking(makePrepareReq({ scheduleId: 't1', seatNumbers: ['A1'], originalAmount: 100 }), res);
    assert.equal(getStatus(), 422);
    assert.deepEqual(getJson(), { success: false, message: 'Normalized error' });
  });

  await t.test('7. injected unexpected normalization failure maps to INVALID_SEAT_SELECTION', async () => {
    h.mockMethod(h.passengerSeatHold, 'normalizeSeatNumbers', () => { throw new Error('Boom'); });
    const { res, getStatus, getJson } = makeMockRes();
    await h.prepareBooking(makePrepareReq({ scheduleId: 't1', seatNumbers: ['A1'], originalAmount: 100 }), res);
    assert.equal(getStatus(), 400);
    assert.deepEqual(getJson(), { success: false, message: 'Invalid seat selection.', errorCode: 'INVALID_SEAT_SELECTION' });
  });

  await t.test('8. seat document not found', async () => {
    h.mockMethod(h.Seat, 'findOne', () => Promise.resolve(null));
    const { res, getStatus, getJson } = makeMockRes();
    await h.prepareBooking(makePrepareReq({ scheduleId: 't1', seatNumbers: ['A1'], originalAmount: 100 }), res);
    assert.equal(getStatus(), 404);
    assert.deepEqual(getJson(), { success: false, message: 'Seat data not found for schedule.' });
  });

  await t.test('9. invalid seat selection (unknown seat)', async () => {
    h.mockMethod(h.Seat, 'findOne', () => Promise.resolve({ seata: [{ seatNo: 'A1', booked: false }], seatb: [], seatc: [] }));
    const { res, getStatus, getJson } = makeMockRes();
    await h.prepareBooking(makePrepareReq({ scheduleId: 't1', seatNumbers: ['Z9'], originalAmount: 100 }), res);
    assert.equal(getStatus(), 400);
    assert.deepEqual(getJson(), { success: false, message: 'Invalid seat(s): Z9' });
  });

  await t.test('10. already booked seat', async () => {
    h.mockMethod(h.Seat, 'findOne', () => Promise.resolve({ seata: [{ seatNo: 'A1', booked: true }], seatb: [], seatc: [] }));
    const { res, getStatus, getJson } = makeMockRes();
    await h.prepareBooking(makePrepareReq({ scheduleId: 't1', seatNumbers: ['A1'], originalAmount: 100 }), res);
    assert.equal(getStatus(), 400);
    assert.deepEqual(getJson(), { success: false, message: 'Seat A1 is already booked!' });
  });
});
