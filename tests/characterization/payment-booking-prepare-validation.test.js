'use strict';
/**
 * tests/characterization/payment-booking-prepare-validation.test.js
 * Characterizes prepareBooking validation and seat-hold normalization integration defect.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { setupPrepareHarness, makePrepareReq, makeMockRes } = require('../helpers/payment-booking-prepare-harness.js');

test('prepareBooking validation characterization', async (t) => {
  let h;
  t.beforeEach(() => { h = setupPrepareHarness(); });
  t.afterEach(() => { h.restore(); });

  const enableDownstreamPrepareFlow = () => h.installSeatNormalizationSeam();

  await t.test('1. empty request body', async () => {
    const { res, getStatus, getJson } = makeMockRes();
    await h.prepareBooking({ body: null }, res);
    assert.equal(getStatus(), 400);
    assert.deepEqual(getJson(), { success: false, message: 'your body is empty please add' });
  });

  await t.test('2. missing required fields', async () => {
    const cases = [
      { seatNumbers: ['A1'], originalAmount: 100 },
      { scheduleId: 't1', originalAmount: 100 },
      { scheduleId: 't1', seatNumbers: [], originalAmount: 100 },
      { scheduleId: 't1', seatNumbers: ['A1'] }
    ];
    for (const b of cases) {
      const { res, getStatus, getJson } = makeMockRes();
      await h.prepareBooking(makePrepareReq(b), res);
      assert.equal(getStatus(), 400);
      assert.deepEqual(getJson(), { success: false, message: 'Missing required fields: scheduleId, seatNumbers, originalAmount' });
    }
  });

  await t.test('3. trip not found', async () => {
    h.mockMethod(h.Trip, 'findById', () => ({ select: () => ({ lean: () => Promise.resolve(null) }) }));
    const { res, getStatus, getJson } = makeMockRes();
    await h.prepareBooking(makePrepareReq({ scheduleId: 't1', seatNumbers: ['A1'], originalAmount: 100 }), res);
    assert.equal(getStatus(), 404);
    assert.deepEqual(getJson(), { success: false, message: 'Trip not found.' });
  });

  await t.test('4. booking window closed', async () => {
    h.mockMethod(h.Trip, 'findById', () => ({ select: () => ({ lean: () => Promise.resolve({ status: 'scheduled', bookingClosesAt: new Date(Date.now() - 1000) }) }) }));
    const { res, getStatus, getJson } = makeMockRes();
    await h.prepareBooking(makePrepareReq({ scheduleId: 't1', seatNumbers: ['A1'], originalAmount: 100 }), res);
    assert.equal(getStatus(), 400);
    assert.deepEqual(getJson(), { success: false, message: 'Online booking has closed for this trip. Bookings can no longer be accepted.', errorCode: 'BOOKING_WINDOW_CLOSED' });
  });

  await t.test('5. trip status not bookable', async () => {
    h.mockMethod(h.Trip, 'findById', () => ({ select: () => ({ lean: () => Promise.resolve({ status: 'completed' }) }) }));
    const { res, getStatus, getJson } = makeMockRes();
    await h.prepareBooking(makePrepareReq({ scheduleId: 't1', seatNumbers: ['A1'], originalAmount: 100 }), res);
    assert.equal(getStatus(), 400);
    assert.deepEqual(getJson(), { success: false, message: 'Bookings are not available for trips with status: completed', errorCode: 'TRIP_NOT_BOOKABLE' });
  });

  await t.test('valid prepare request currently fails because the seat-hold index does not export normalizeSeatNumbers', async () => {
    assert.equal(typeof h.passengerSeatHold.normalizeSeatNumbers, 'undefined');

    let seatFindCount = 0, validateCouponCount = 0, computeBalanceCount = 0, getConfigCount = 0, createHoldCount = 0;
    h.mockMethod(h.Seat, 'findOne', () => { seatFindCount++; return Promise.resolve(h.defaults.seatDoc); });
    h.mockMethod(h.CouponHelper, 'validateCoupon', () => { validateCouponCount++; return Promise.resolve(h.defaults.couponValidation); });
    h.mockMethod(h.smLedgerService, 'computeSpendableBalance', () => { computeBalanceCount++; return Promise.resolve(h.defaults.spendableBalance); });
    h.mockMethod(h.PlatformConfig, 'getConfig', () => { getConfigCount++; return Promise.resolve(h.defaults.smConfig); });
    h.mockMethod(h.passengerSeatHold, 'createOrReusePassengerSeatHold', () => { createHoldCount++; return Promise.resolve(h.defaults.hold); });

    const { res, getStatus, getJson } = makeMockRes();
    await h.prepareBooking(makePrepareReq({ scheduleId: '507f1f77bcf86cd799439011', seatNumbers: ['A1'], originalAmount: 100 }), res);

    assert.equal(getStatus(), 400);
    assert.deepEqual(getJson(), { success: false, message: 'Invalid seat selection.', errorCode: 'INVALID_SEAT_SELECTION' });
    assert.equal(seatFindCount, 0);
    assert.equal(validateCouponCount, 0);
    assert.equal(computeBalanceCount, 0);
    assert.equal(getConfigCount, 0);
    assert.equal(createHoldCount, 0);
  });

  await t.test('6. injected normalization domain error is preserved', async () => {
    enableDownstreamPrepareFlow();
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
    enableDownstreamPrepareFlow();
    h.mockMethod(h.passengerSeatHold, 'normalizeSeatNumbers', () => { throw new Error('Boom'); });
    const { res, getStatus, getJson } = makeMockRes();
    await h.prepareBooking(makePrepareReq({ scheduleId: 't1', seatNumbers: ['A1'], originalAmount: 100 }), res);
    assert.equal(getStatus(), 400);
    assert.deepEqual(getJson(), { success: false, message: 'Invalid seat selection.', errorCode: 'INVALID_SEAT_SELECTION' });
  });

  await t.test('8. seat document not found', async () => {
    enableDownstreamPrepareFlow();
    h.mockMethod(h.Seat, 'findOne', () => Promise.resolve(null));
    const { res, getStatus, getJson } = makeMockRes();
    await h.prepareBooking(makePrepareReq({ scheduleId: 't1', seatNumbers: ['A1'], originalAmount: 100 }), res);
    assert.equal(getStatus(), 404);
    assert.deepEqual(getJson(), { success: false, message: 'Seat data not found for schedule.' });
  });

  await t.test('9. invalid seat selection (unknown seat)', async () => {
    enableDownstreamPrepareFlow();
    h.mockMethod(h.Seat, 'findOne', () => Promise.resolve({ seata: [{ seatNo: 'A1', booked: false }], seatb: [], seatc: [] }));
    const { res, getStatus, getJson } = makeMockRes();
    await h.prepareBooking(makePrepareReq({ scheduleId: 't1', seatNumbers: ['Z9'], originalAmount: 100 }), res);
    assert.equal(getStatus(), 400);
    assert.deepEqual(getJson(), { success: false, message: 'Invalid seat(s): Z9' });
  });

  await t.test('10. already booked seat', async () => {
    enableDownstreamPrepareFlow();
    h.mockMethod(h.Seat, 'findOne', () => Promise.resolve({ seata: [{ seatNo: 'A1', booked: true }], seatb: [], seatc: [] }));
    const { res, getStatus, getJson } = makeMockRes();
    await h.prepareBooking(makePrepareReq({ scheduleId: 't1', seatNumbers: ['A1'], originalAmount: 100 }), res);
    assert.equal(getStatus(), 400);
    assert.deepEqual(getJson(), { success: false, message: 'Seat A1 is already booked!' });
  });
});
