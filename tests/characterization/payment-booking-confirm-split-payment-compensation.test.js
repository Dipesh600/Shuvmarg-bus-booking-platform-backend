'use strict';

/**
 * tests/characterization/payment-booking-confirm-split-payment-compensation.test.js
 * Characterizes split-payment reversal compensation on post-debit failures.
 */

const test   = require('node:test');
const assert = require('node:assert/strict');
const { setupConfirmHarness, makeConfirmReq, makeMockConfirmRes } = require('../helpers/payment-booking-confirm-harness.js');

test('confirmBooking: split-payment compensation & isolation', async (t) => {
  let h;
  t.beforeEach(() => { h = setupConfirmHarness(); });
  t.afterEach(() => { h.restore(); });

  const failureCases = [
    { name: '1. missing eSewa params', req: { gateway: 'esewa', paymentId: null, paymentAmount: 800, smMoneyToUse: 200 }, setup: () => {}, status: 400, code: 'ESEWA_PARAMS_MISSING', reasonMatch: 'paymentId or gatewayAmount' },
    { name: '2. failed eSewa verification', req: { gateway: 'esewa', paymentId: 'bad_p', paymentAmount: 800, smMoneyToUse: 200 }, setup: () => { require.cache[require.resolve('../../services/esewaVerificationService.js')].exports._impl = async () => ({ verified: false, error: 'Signature mismatch' }); }, status: 402, code: 'ESEWA_VERIFICATION_FAILED', reasonMatch: 'eSewa verification failed' },
    { name: '3. trip missing', req: { gateway: 'esewa', paymentId: 'p1', paymentAmount: 800, smMoneyToUse: 200 }, setup: () => h.mockMethod(h.Trip, 'findById', () => ({ lean: () => Promise.resolve(null) })), status: 404, code: 'BOOKING_CREATION_FAILED_PAYMENT_RECEIVED', reasonMatch: 'Trip not found' },
    { name: '4. booking closed', req: { gateway: 'esewa', paymentId: 'p1', paymentAmount: 800, smMoneyToUse: 200 }, setup: () => h.mockMethod(h.Trip, 'findById', () => ({ lean: () => Promise.resolve({ ...h.defaults.trip, bookingClosesAt: new Date(Date.now() - 1000) }) })), status: 400, code: 'BOOKING_CREATION_FAILED_PAYMENT_RECEIVED', reasonMatch: 'Booking window closed' },
    { name: '5. invalid trip status', req: { gateway: 'esewa', paymentId: 'p1', paymentAmount: 800, smMoneyToUse: 200 }, setup: () => h.mockMethod(h.Trip, 'findById', () => ({ lean: () => Promise.resolve({ ...h.defaults.trip, status: 'cancelled' }) })), status: 400, code: 'BOOKING_CREATION_FAILED_PAYMENT_RECEIVED', reasonMatch: 'not bookable' },
    { name: '6. seat data missing', req: { gateway: 'esewa', paymentId: 'p1', paymentAmount: 800, smMoneyToUse: 200 }, setup: () => h.mockMethod(h.Seat, 'findOne', () => Promise.resolve(null)), status: 404, code: 'BOOKING_CREATION_FAILED_PAYMENT_RECEIVED', reasonMatch: 'Seat data not found' },
    { name: '7. seat-lock failure', req: { gateway: 'esewa', paymentId: 'p1', paymentAmount: 800, smMoneyToUse: 200 }, setup: () => h.mockMethod(h.Seat, 'findOneAndUpdate', () => Promise.resolve(null)), status: 409, code: 'BOOKING_CREATION_FAILED_PAYMENT_RECEIVED', reasonMatch: 'Seat lock failed' },
    { name: '8. Booking.create failure', req: { gateway: 'esewa', paymentId: 'p1', paymentAmount: 800, smMoneyToUse: 200 }, setup: () => h.mockMethod(h.Booking, 'create', () => Promise.reject(new Error('DB write failure'))), status: 500, code: 'BOOKING_CREATION_FAILED_PAYMENT_RECEIVED', reasonMatch: 'Booking.create() failed' }
  ];

  for (const c of failureCases) {
    await t.test(c.name, async () => {
      let revCount = 0, revId = null;
      h.mockMethod(h.smLedgerService, 'debitLedgerFIFO', () => Promise.resolve({ _id: 'split_id_100' }));
      h.mockMethod(h.smLedgerService, 'reverseDebit', (id) => { revCount++; revId = id; return Promise.resolve(); });
      let loggedReason = null;
      const logger = require('../../utils/logger.js');
      h.mockMethod(logger, 'info', (msg, meta) => { if (msg === 'confirmBooking: SM Money debit reversed') loggedReason = meta?.reason; });
      c.setup();

      const res = makeMockConfirmRes();
      await h.confirmBooking(makeConfirmReq(c.req), res);

      assert.equal(res.getStatus(), c.status);
      assert.equal(res.getJson()?.errorCode, c.code);
      assert.equal(revCount, 1);
      assert.equal(revId, 'split_id_100');
      assert.ok(loggedReason && loggedReason.includes(c.reasonMatch), `reason '${loggedReason}' contains '${c.reasonMatch}'`);
    });
  }

  await t.test('9. reversal failure HTTP isolation', async () => {
    let revCount = 0, loggedErr = null;
    h.mockMethod(h.smLedgerService, 'debitLedgerFIFO', () => Promise.resolve({ _id: 'split_iso_1' }));
    h.mockMethod(h.smLedgerService, 'reverseDebit', () => { revCount++; return Promise.reject(new Error('Reversal DB error')); });
    const logger = require('../../utils/logger.js');
    h.mockMethod(logger, 'error', (msg, meta) => { if (msg.includes('failed to reverse SM Money debit')) loggedErr = meta; });
    const esewaPath = require.resolve('../../services/esewaVerificationService.js');
    require.cache[esewaPath].exports._impl = async () => ({ verified: false, error: 'Signature mismatch' });

    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ gateway: 'esewa', paymentId: 'bad_p', paymentAmount: 800, smMoneyToUse: 200 }), res);

    assert.equal(res.getStatus(), 402);
    assert.deepEqual(res.getJson(), { success: false, message: 'Payment verification failed: Signature mismatch', errorCode: 'ESEWA_VERIFICATION_FAILED' });
    assert.equal(revCount, 1);
    assert.ok(loggedErr, 'CRITICAL error logged');
  });

  await t.test('10. full-wallet compensation & wallet/split ID isolation', async () => {
    let revCount = 0, reversedId = null;
    h.mockMethod(h.Wallet, 'findOne', () => Promise.resolve({ status: 'active' }));
    h.mockMethod(h.smLedgerService, 'debitLedgerFIFO', () => Promise.resolve({ _id: 'wallet_debit_1' }));
    h.mockMethod(h.smLedgerService, 'reverseDebit', (id) => { revCount++; reversedId = id; return Promise.resolve(); });
    h.mockMethod(h.Seat, 'findOne', () => Promise.resolve(null));

    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ gateway: 'wallet', paymentAmount: 1000 }), res);

    assert.equal(res.getStatus(), 404);
    assert.equal(res.getJson()?.errorCode, 'BOOKING_CREATION_FAILED_PAYMENT_RECEIVED');
    assert.equal(revCount, 1);
    assert.equal(reversedId, 'wallet_debit_1');
  });
});
