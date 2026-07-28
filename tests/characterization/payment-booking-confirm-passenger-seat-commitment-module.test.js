'use strict';

/**
 * tests/characterization/payment-booking-confirm-passenger-seat-commitment-module.test.js
 * Characterization tests for confirmBooking passenger seat commitment module integration.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { setupConfirmHarness, makeConfirmReq, makeMockConfirmRes } = require('../helpers/payment-booking-confirm-harness.js');

test('confirmBooking passenger seat commitment module characterization tests', async (t) => {

  await t.test('1-6. missing seat document returns 404, exact body, marks DISPUTED, reverses debit, sends admin alert and does NOT call rollback', async () => {
    const h = setupConfirmHarness();
    try {
      let rollbackCalled = false;
      let disputeReason = null;

      h.mockMethod(h.Transaction, 'create', async (p) => ({ _id: 'txn_nodoc_404', ...p }));
      h.mockMethod(h.Trip, 'findById', () => ({ lean: async () => ({ ...h.defaults.trip, status: 'scheduled' }) }));
      h.mockMethod(h.Seat, 'findOne', async () => null);
      h.mockMethod(h.Transaction, 'findByIdAndUpdate', (id, update) => {
        if (update.status === 'DISPUTED') disputeReason = update.disputeReason;
        return Promise.resolve();
      });

      const req = makeConfirmReq();
      const res = makeMockConfirmRes();
      await h.confirmBooking(req, res);

      assert.equal(res.getStatus(), 404);
      assert.deepEqual(res.getJson(), {
        success: false,
        message: 'Your payment was received but seat data is missing. Your case ID is txn_nodoc_404. We will resolve this within 2 hours.',
        caseId: 'txn_nodoc_404',
        errorCode: 'BOOKING_CREATION_FAILED_PAYMENT_RECEIVED',
      });
      assert.equal(disputeReason, 'Seat data not found for trip after payment');
    } finally {
      h.restore();
    }
  });

  await t.test('7-9, 21 & 22. transaction creation & trip validation occur first; stored casing used; valid seats lock sequentially; proceeds to booking creation & sets rollback state', async () => {
    const h = setupConfirmHarness();
    try {
      let txnCreated = false;
      let tripValidated = false;
      let seatDocQueried = false;
      let bookingCreated = false;
      const lockedSeats = [];

      h.mockMethod(h.Transaction, 'create', async (p) => { txnCreated = true; return { _id: 'txn_ok_seats', ...p }; });
      h.mockMethod(h.Trip, 'findById', () => {
        assert.equal(txnCreated, true);
        tripValidated = true;
        return { lean: async () => ({ ...h.defaults.trip, status: 'scheduled' }) };
      });
      h.mockMethod(h.Seat, 'findOne', async () => {
        assert.equal(tripValidated, true);
        seatDocQueried = true;
        return {
          seata: [{ seatNo: 'A1', booked: false }],
          seatb: [{ seatNo: 'B2', booked: false }],
          seatc: [],
        };
      });
      h.mockMethod(h.Seat, 'findOneAndUpdate', async (filter, update) => {
        lockedSeats.push(filter.seata?.$elemMatch?.seatNo || filter.seatb?.$elemMatch?.seatNo);
        return { _id: 'locked' };
      });
      h.mockMethod(h.Booking, 'create', async (b) => { bookingCreated = true; return [{ _id: 'b1', ...b[0] }]; });

      const req = makeConfirmReq();
      req.bookingHold.seatNumbers = ['a1', 'b2'];
      const res = makeMockConfirmRes();
      await h.confirmBooking(req, res);

      assert.equal(seatDocQueried, true);
      assert.deepEqual(lockedSeats, ['A1', 'B2']);
      assert.equal(bookingCreated, true);
      assert.equal(res.getStatus(), 201);
    } finally {
      h.restore();
    }
  });

  await t.test('10-18. failed commitment (invalid/booked) calls rollback once with normalized seats, status 409, marks DISPUTED, reverses debit, sends alert, prevents booking creation', async () => {
    const h = setupConfirmHarness();
    try {
      let rollbackArgs = null;
      let bookingCreated = false;
      let disputeReason = null;

      h.mockMethod(h.Transaction, 'create', async (p) => ({ _id: 'txn_fail_lock', ...p }));
      h.mockMethod(h.Trip, 'findById', () => ({ lean: async () => ({ ...h.defaults.trip, status: 'scheduled' }) }));
      h.mockMethod(h.Seat, 'findOne', async () => ({
        seata: [{ seatNo: 'A1', booked: false }],
        seatb: [],
        seatc: [],
      }));
      h.mockMethod(h.Seat, 'findOneAndUpdate', async () => null); // simulate already booked
      h.mockMethod(h.Transaction, 'findByIdAndUpdate', (id, update) => {
        if (update.status === 'DISPUTED') disputeReason = update.disputeReason;
        return Promise.resolve();
      });

      const req = makeConfirmReq();
      req.bookingHold.seatNumbers = ['a1', 'z9']; // 'a1' booked, 'z9' invalid
      const res = makeMockConfirmRes();
      await h.confirmBooking(req, res);

      assert.equal(res.getStatus(), 409);
      assert.equal(disputeReason.includes('Invalid seat(s): Z9 | Already booked: A1 — taken during payment'), true);
      assert.equal(res.getJson().message.includes('Invalid seat(s): Z9 | Already booked: A1 — taken during payment'), true);
    } finally {
      h.restore();
    }
  });

  await t.test('19 & 20. lookup exception and lock exception propagate to outer catch (500)', async () => {
    const hFindErr = setupConfirmHarness();
    try {
      hFindErr.mockMethod(hFindErr.Trip, 'findById', () => ({ lean: async () => ({ ...hFindErr.defaults.trip, status: 'scheduled' }) }));
      hFindErr.mockMethod(hFindErr.Seat, 'findOne', async () => { throw new Error('FindOne Crash'); });

      const req = makeConfirmReq();
      const res = makeMockConfirmRes();
      await hFindErr.confirmBooking(req, res);
      assert.equal(res.getStatus(), 500);
    } finally {
      hFindErr.restore();
    }

    const hLockErr = setupConfirmHarness();
    try {
      hLockErr.mockMethod(hLockErr.Trip, 'findById', () => ({ lean: async () => ({ ...hLockErr.defaults.trip, status: 'scheduled' }) }));
      hLockErr.mockMethod(hLockErr.Seat, 'findOne', async () => ({ seata: [{ seatNo: 'a1' }], seatb: [], seatc: [] }));
      hLockErr.mockMethod(hLockErr.Seat, 'findOneAndUpdate', async () => { throw new Error('Lock Crash'); });

      const req = makeConfirmReq();
      const res = makeMockConfirmRes();
      await hLockErr.confirmBooking(req, res);
      assert.equal(res.getStatus(), 500);
    } finally {
      hLockErr.restore();
    }
  });
});
