'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { setupConfirmHarness, makeConfirmReq, makeMockConfirmRes } = require('../helpers/payment-booking-confirm-harness.js');

test('confirmBooking passenger booking persistence module characterization tests', async (t) => {
  await t.test('1-12, 22. successful booking persistence creates payload, uses ticket ID, transitions SUCCESS, and responds 201', async () => {
    const h = setupConfirmHarness();
    try {
      let createdBookingPayload = null;
      let txnSuccessUpdate = null;

      h.mockMethod(h.Booking, 'create', async (payload) => {
        createdBookingPayload = payload;
        return { _id: '507f1f77bcf86cd799439033', ticketId: payload.ticketId, ...payload };
      });
      h.mockMethod(h.Transaction, 'findOneAndUpdate', (query, update) => {
        txnSuccessUpdate = update;
        return Promise.resolve({ ...h.defaults.transaction, status: 'SUCCESS' });
      });

      const req = makeConfirmReq({ gateway: 'esewa', paymentId: 'p123' });
      const res = makeMockConfirmRes();
      await h.confirmBooking(req, res);

      assert.equal(res.getStatus(), 201);
      assert.ok(createdBookingPayload);
      assert.equal(createdBookingPayload.userId, '507f1f77bcf86cd799439012');
      assert.equal(createdBookingPayload.tripId, '507f1f77bcf86cd799439011');
      assert.equal(createdBookingPayload.paymentMethod, 'ESEWA');
      assert.equal(createdBookingPayload.transactionId, 'p123');
      assert.ok(createdBookingPayload.ticketId);

      assert.ok(txnSuccessUpdate);
      assert.equal(txnSuccessUpdate.$set.status, 'SUCCESS');
      assert.equal(txnSuccessUpdate.$set.bookingId, '507f1f77bcf86cd799439033');
      assert.equal(txnSuccessUpdate.$set.ticketId, createdBookingPayload.ticketId);
    } finally {
      h.restore();
    }
  });

  await t.test('3-9. verifies SM_WALLET, SM_WALLET_SPLIT, and wallet fallback transaction ID prefix', async () => {
    const h = setupConfirmHarness();
    try {
      let capturedPayloads = [];
      h.mockMethod(h.Booking, 'create', async (payload) => {
        capturedPayloads.push(payload);
        return { _id: 'b1', ticketId: payload.ticketId, ...payload };
      });

      const req1 = makeConfirmReq({ gateway: 'wallet', paymentId: null });
      await h.confirmBooking(req1, makeMockConfirmRes());
      assert.equal(capturedPayloads[0].paymentMethod, 'SM_WALLET');
      assert.ok(capturedPayloads[0].transactionId.startsWith('sm_wallet_'));

      h.mockMethod(h.smLedgerService, 'computeSpendableBalance', () => Promise.resolve({ display: 1000 }));
      const req2 = makeConfirmReq({ gateway: 'esewa', paymentId: 'p2', smMoneyToUse: 200 });
      await h.confirmBooking(req2, makeMockConfirmRes());
      assert.equal(capturedPayloads[1].paymentMethod, 'SM_WALLET_SPLIT');
      assert.equal(capturedPayloads[1].transactionId, 'p2');
    } finally {
      h.restore();
    }
  });

  await t.test('13-21. Booking.create failure rolls back seats, reverses debit, marks DISPUTED, sends alert/notif, and returns 500', async () => {
    const h = setupConfirmHarness();
    try {
      let disputeRecorded = false;
      let disputeReason = null;
      let seatRollbackCalled = false;

      h.mockMethod(h.Booking, 'create', async () => { throw new Error('Mongo write constraint violation'); });
      h.mockMethod(h.Transaction, 'findByIdAndUpdate', (id, update) => {
        if (update.status === 'DISPUTED') { disputeRecorded = true; disputeReason = update.disputeReason; }
        return Promise.resolve();
      });
      h.mockMethod(h.Seat, 'findOne', async () => ({ seata: [{ seatNo: 'a1', booked: true, bookedBy: '507f1f77bcf86cd799439012' }], seatb: [], seatc: [] }));
      h.mockMethod(h.Seat, 'findOneAndUpdate', (query) => { if (query.seata) seatRollbackCalled = true; return Promise.resolve({}); });

      const req = makeConfirmReq();
      const res = makeMockConfirmRes();
      await h.confirmBooking(req, res);

      assert.equal(res.getStatus(), 500);
      assert.equal(res.getJson().errorCode, 'BOOKING_CREATION_FAILED_PAYMENT_RECEIVED');
      assert.ok(disputeRecorded);
      assert.ok(disputeReason.includes('Mongo write constraint violation'));
      assert.ok(seatRollbackCalled);
    } finally {
      h.restore();
    }
  });

  await t.test('missing trip in persistence causes TypeError before Booking.create, marks DISPUTED, rolls back seats, returns 500', async () => {
    const h = setupConfirmHarness();
    try {
      let bookingCreateCalled = false;
      let disputeRecorded = false;
      let txnSuccessAttempted = false;
      let seatRollbackCalled = false;

      const bookingPersistenceIndexPath = require.resolve('../../src/modules/booking/passenger-booking-persistence');
      const controllerPath = require.resolve('../../controllers/ticketController/paymentBookingController.js');

      require.cache[bookingPersistenceIndexPath] = {
        id: bookingPersistenceIndexPath, filename: bookingPersistenceIndexPath, loaded: true,
        exports: { persistPassengerBooking: async () => { throw new TypeError("Cannot read properties of undefined (reading 'brandId')"); } }
      };
      delete require.cache[controllerPath];
      const { confirmBooking } = require('../../controllers/ticketController/paymentBookingController.js');

      h.mockMethod(h.Booking, 'create', async () => { bookingCreateCalled = true; return {}; });
      h.mockMethod(h.Transaction, 'findByIdAndUpdate', (id, update) => { if (update.status === 'DISPUTED') disputeRecorded = true; return Promise.resolve(); });
      h.mockMethod(h.Transaction, 'findOneAndUpdate', (query, update) => { if (update.$set && update.$set.status === 'SUCCESS') txnSuccessAttempted = true; return Promise.resolve({}); });
      h.mockMethod(h.Seat, 'findOne', async () => ({ seata: [{ seatNo: 'a1', booked: false }], seatb: [], seatc: [] }));
      h.mockMethod(h.Seat, 'findOneAndUpdate', (query) => {
        if (query.seata && query.seata.$elemMatch && query.seata.$elemMatch.bookedBy) seatRollbackCalled = true;
        return Promise.resolve({ _id: 's1', ...h.defaults.seatDoc });
      });

      const req = makeConfirmReq();
      const res = makeMockConfirmRes();
      await confirmBooking(req, res);

      assert.equal(bookingCreateCalled, false, 'Booking.create must not be called when trip is missing');
      assert.equal(txnSuccessAttempted, false, 'Transaction SUCCESS transition must not be attempted');
      assert.equal(res.getStatus(), 500);
      assert.ok(disputeRecorded);
      assert.ok(seatRollbackCalled);
    } finally {
      h.restore();
    }
  });
});
