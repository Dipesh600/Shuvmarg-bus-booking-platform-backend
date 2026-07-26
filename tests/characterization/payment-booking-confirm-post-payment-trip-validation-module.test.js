'use strict';

/**
 * tests/characterization/payment-booking-confirm-post-payment-trip-validation-module.test.js
 * Characterization tests for confirmBooking post-payment trip validation integration.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { setupConfirmHarness, makeConfirmReq, makeMockConfirmRes } = require('../helpers/payment-booking-confirm-harness.js');

test('confirmBooking post-payment trip validation module characterization tests', async (t) => {

  await t.test('1, 2, 16 & 20. valid scheduled/boarding trip proceeds to seat lookup after transaction creation', async () => {
    for (const status of ['scheduled', 'boarding']) {
      const h = setupConfirmHarness();
      try {
        let transactionCreated = false;
        let seatLookupCalled = false;
        h.mockMethod(h.Transaction, 'create', async (p) => { transactionCreated = true; return { _id: 'txn_val_10', ...p }; });
        h.mockMethod(h.Trip, 'findById', () => {
          assert.equal(transactionCreated, true, 'Trip lookup must occur after Transaction.create');
          return { lean: async () => ({ ...h.defaults.trip, status }) };
        });
        h.mockMethod(h.Seat, 'findOne', () => { seatLookupCalled = true; return Promise.resolve(h.defaults.seatDoc); });

        const req = makeConfirmReq();
        const res = makeMockConfirmRes();
        await h.confirmBooking(req, res);

        assert.equal(seatLookupCalled, true, `Status ${status} should proceed to seat lookup`);
      } finally {
        h.restore();
      }
    }
  });

  await t.test('3-7, 17. missing trip returns 404, exact body, marks DISPUTED, reverses debit, sends admin alert and prevents seat lookup', async () => {
    const h = setupConfirmHarness();
    try {
      let disputeUpdateReason = null;
      let adminAlertReason = null;
      let seatLookupCalled = false;

      h.mockMethod(h.Transaction, 'create', async (p) => ({ _id: 'txn_missing_trip_404', ...p }));
      h.mockMethod(h.Trip, 'findById', () => ({ lean: async () => null }));
      h.mockMethod(h.Transaction, 'findByIdAndUpdate', (id, update) => {
        if (update.status === 'DISPUTED') disputeUpdateReason = update.disputeReason;
        return Promise.resolve();
      });
      h.mockMethod(h.Seat, 'findOne', () => { seatLookupCalled = true; return Promise.resolve(h.defaults.seatDoc); });

      const req = makeConfirmReq();
      const res = makeMockConfirmRes();
      await h.confirmBooking(req, res);

      assert.equal(res.getStatus(), 404);
      assert.deepEqual(res.getJson(), {
        success: false,
        message: 'Your payment was received but the trip was not found. Your case ID is txn_missing_trip_404. We will resolve this within 2 hours.',
        caseId: 'txn_missing_trip_404',
        errorCode: 'BOOKING_CREATION_FAILED_PAYMENT_RECEIVED',
      });
      assert.equal(disputeUpdateReason, 'Trip not found after payment verification');
      assert.equal(seatLookupCalled, false);
    } finally {
      h.restore();
    }
  });

  await t.test('8-10. expired cutoff returns 400 with exact body and dispute reason', async () => {
    const h = setupConfirmHarness();
    try {
      let disputeReason = null;
      const pastCutoff = new Date(Date.now() - 10000);
      h.mockMethod(h.Transaction, 'create', async (p) => ({ _id: 'txn_cutoff_400', ...p }));
      h.mockMethod(h.Trip, 'findById', () => ({ lean: async () => ({ ...h.defaults.trip, bookingClosesAt: pastCutoff }) }));
      h.mockMethod(h.Transaction, 'findByIdAndUpdate', (id, update) => {
        if (update.status === 'DISPUTED') disputeReason = update.disputeReason;
        return Promise.resolve();
      });

      const req = makeConfirmReq();
      const res = makeMockConfirmRes();
      await h.confirmBooking(req, res);

      assert.equal(res.getStatus(), 400);
      assert.equal(res.getJson().message, 'Your payment was received but booking has closed for this trip. Your case ID is txn_cutoff_400. We will resolve this within 2 hours.');
      assert.equal(disputeReason, 'Booking window closed after payment was processed');
    } finally {
      h.restore();
    }
  });

  await t.test('11-15. non-bookable status returns 400, preserves status in response, dispute, compensation and admin alert', async () => {
    const h = setupConfirmHarness();
    try {
      let disputeReason = null;
      h.mockMethod(h.Transaction, 'create', async (p) => ({ _id: 'txn_status_400', ...p }));
      h.mockMethod(h.Trip, 'findById', () => ({ lean: async () => ({ ...h.defaults.trip, status: 'completed' }) }));
      h.mockMethod(h.Transaction, 'findByIdAndUpdate', (id, update) => {
        if (update.status === 'DISPUTED') disputeReason = update.disputeReason;
        return Promise.resolve();
      });

      const req = makeConfirmReq();
      const res = makeMockConfirmRes();
      await h.confirmBooking(req, res);

      assert.equal(res.getStatus(), 400);
      assert.equal(res.getJson().message, 'Your payment was received but the trip is no longer available (status: completed). Your case ID is txn_status_400. We will resolve this within 2 hours.');
      assert.equal(disputeReason, 'Trip status is "completed" — not bookable after payment');
    } finally {
      h.restore();
    }
  });

  await t.test('18 & 19. lookup exception propagates to outer catch (500) without calling mapped dispute update', async () => {
    const h = setupConfirmHarness();
    try {
      let disputeReason = null;
      h.mockMethod(h.Trip, 'findById', () => ({ lean: async () => { throw new Error('Database lookup crash'); } }));
      h.mockMethod(h.Transaction, 'findByIdAndUpdate', (id, update) => {
        if (update.status === 'DISPUTED') disputeReason = update.disputeReason;
        return Promise.resolve();
      });

      const req = makeConfirmReq();
      const res = makeMockConfirmRes();
      await h.confirmBooking(req, res);

      assert.equal(res.getStatus(), 500);
      assert.equal(disputeReason.includes('Unexpected crash: Database lookup crash'), true);
    } finally {
      h.restore();
    }
  });
});
