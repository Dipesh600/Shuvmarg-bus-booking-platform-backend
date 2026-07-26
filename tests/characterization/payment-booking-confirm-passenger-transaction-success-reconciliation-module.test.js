'use strict';

/**
 * tests/characterization/payment-booking-confirm-passenger-transaction-success-reconciliation-module.test.js
 * Characterization tests for passenger transaction success reconciliation module integration.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  setupConfirmHarness,
  makeConfirmReq,
  makeMockConfirmRes,
} = require('../helpers/payment-booking-confirm-harness');

test('confirmBooking passenger transaction success reconciliation module characterization tests', async (t) => {
  await t.test('1-10, 25. successful flow attempts reconciliation once with exact arguments and proceeds to post-commit work', async () => {
    const h = setupConfirmHarness();
    try {
      let passedFilter = null;
      let passedUpdate = null;
      let passedOptions = null;
      let updateCalls = 0;

      h.mockMethod(h.Booking, 'create', () => Promise.resolve({ _id: '507f1f77bcf86cd799439033', ticketId: 'TKT1' }));
      h.mockMethod(h.Transaction, 'findOneAndUpdate', (query, update, options) => {
        updateCalls++;
        passedFilter = query;
        passedUpdate = update;
        passedOptions = options;
        return Promise.resolve({ ...h.defaults.transaction, status: 'SUCCESS' });
      });

      const req = makeConfirmReq();
      const res = makeMockConfirmRes();
      const { confirmBooking } = require('../../controllers/ticketController/paymentBookingController.js');

      await confirmBooking(req, res);

      assert.equal(res.getStatus(), 201);
      assert.equal(updateCalls, 1);
      assert.deepEqual(passedFilter, {
        _id: '507f1f77bcf86cd799439011',
        status: 'PAYMENT_RECEIVED',
      });
      assert.equal(passedUpdate.$set.status, 'SUCCESS');
      assert.equal(passedUpdate.$set.bookingId, '507f1f77bcf86cd799439033');
      assert.ok(typeof passedUpdate.$set.ticketId === 'string' && passedUpdate.$set.ticketId.length > 0);
      assert.deepEqual(passedOptions, {
        new: true,
        runValidators: true,
      });
      assert.equal(res.getJson().success, true);
    } finally {
      h.restore();
    }
  });

  await t.test('11-15, 22-24. null update returns 409, logs error, prevents post-commit, does NOT rollback/dispute', async () => {
    const h = setupConfirmHarness();
    try {
      let seatRollbackCalled = false;
      let disputeRecorded = false;

      h.mockMethod(h.Transaction, 'findOneAndUpdate', () => Promise.resolve(null));
      h.mockMethod(h.Transaction, 'findByIdAndUpdate', (id, update) => {
        if (update.status === 'DISPUTED') disputeRecorded = true;
        return Promise.resolve();
      });
      h.mockMethod(h.Seat, 'findOneAndUpdate', (query) => {
        if (query.seata && query.seata.$elemMatch && query.seata.$elemMatch.bookedBy) seatRollbackCalled = true;
        return Promise.resolve({ _id: 's1', ...h.defaults.seatDoc });
      });

      const req = makeConfirmReq();
      const res = makeMockConfirmRes();
      const { confirmBooking } = require('../../controllers/ticketController/paymentBookingController.js');

      await confirmBooking(req, res);

      assert.equal(res.getStatus(), 409);
      assert.deepEqual(res.getJson(), {
        success: false,
        message: 'Your payment and booking were received, but final reconciliation is still required.',
        errorCode: 'BOOKING_RECONCILIATION_REQUIRED',
        caseId: '507f1f77bcf86cd799439011',
      });
      assert.equal(seatRollbackCalled, false);
      assert.equal(disputeRecorded, false);
    } finally {
      h.restore();
    }
  });

  await t.test('16-21, 22-24. exception in update returns 409, logs exception, prevents post-commit, does NOT rollback/dispute', async () => {
    const h = setupConfirmHarness();
    try {
      let seatRollbackCalled = false;
      let disputeRecorded = false;

      h.mockMethod(h.Transaction, 'findOneAndUpdate', () => {
        throw new Error('Mongo connection failed during reconciliation');
      });
      h.mockMethod(h.Transaction, 'findByIdAndUpdate', (id, update) => {
        if (update.status === 'DISPUTED') disputeRecorded = true;
        return Promise.resolve();
      });
      h.mockMethod(h.Seat, 'findOneAndUpdate', (query) => {
        if (query.seata && query.seata.$elemMatch && query.seata.$elemMatch.bookedBy) seatRollbackCalled = true;
        return Promise.resolve({ _id: 's1', ...h.defaults.seatDoc });
      });

      const req = makeConfirmReq();
      const res = makeMockConfirmRes();
      const { confirmBooking } = require('../../controllers/ticketController/paymentBookingController.js');

      await confirmBooking(req, res);

      assert.equal(res.getStatus(), 409);
      assert.deepEqual(res.getJson(), {
        success: false,
        message: 'Your payment and booking were received, but final reconciliation is still required.',
        errorCode: 'BOOKING_RECONCILIATION_REQUIRED',
        caseId: '507f1f77bcf86cd799439011',
      });
      assert.equal(seatRollbackCalled, false);
      assert.equal(disputeRecorded, false);
    } finally {
      h.restore();
    }
  });
});
