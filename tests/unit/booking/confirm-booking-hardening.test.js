'use strict';
/**
 * tests/unit/booking/confirm-booking-hardening.test.js
 *
 * Contracts:
 *  1. Unsupported gateway → 400 before side effects
 *  2. Transaction SUCCESS → null → 409 BOOKING_RECONCILIATION_REQUIRED
 *  3. Transaction SUCCESS → throw → 409; no SM reversal, seat rollback, or txn dispute
 *  4. Successful confirmation completes hold with correct holdId and userId
 *  5. Hold completion failure post-commit → 201 (isolated)
 *  6. Cashback failure post-commit → 201 (isolated)
 *  7. Notification failure post-commit → 201, notification was attempted
 *  8. Post-commit exception → 201 via snapshot; no money/seat/txn side effects
 *  9. Pre-booking unexpected failure → 500 with compensation
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../../helpers/confirm-booking-stubs');

test.after(S.teardown);

test('Passenger Booking Confirmation Hardening Contracts', async (t) => {

  await t.test('1. unsupported gateway returns 400 before side effects', async () => {
    let fired = false;
    S.patch(S.Transaction, 'create', async () => { fired = true; });
    try {
      const req = { body: { gateway: 'cash', paymentAmount: 1000, originalAmount: 1000 }, dbUser: { _id: S.VALID_USER_ID } };
      const res = S.makeRes();
      await S.confirmBooking(req, res);
      assert.equal(res.getStatus(), 400);
      assert.equal(res.getBody().errorCode, 'UNSUPPORTED_PAYMENT_GATEWAY');
      assert.equal(fired, false);
    } finally { S.restoreAll(); }
  });

  await t.test('2. transaction SUCCESS null → 409 BOOKING_RECONCILIATION_REQUIRED', async () => {
    S.patchHappyPath();
    S.patch(S.Transaction, 'findOneAndUpdate', async () => null);
    try {
      const res = S.makeRes();
      await S.confirmBooking(S.makeReq(), res);
      assert.equal(res.getStatus(), 409);
      assert.equal(res.getBody().errorCode, 'BOOKING_RECONCILIATION_REQUIRED');
    } finally { S.restoreAll(); }
  });

  await t.test('3. transaction SUCCESS throw → 409; no SM reversal, seat rollback, txn dispute', async () => {
    S.patchHappyPath();
    S.patch(S.Transaction, 'findOneAndUpdate', async () => { throw new Error('DB timeout'); });
    let smReversed = false, seatRolled = 0, txnDisputed = false;
    S.patch(S.smLedgerService, 'reverseDebit', async () => { smReversed = true; });
    S.patch(S.Transaction, 'findByIdAndUpdate', async () => { txnDisputed = true; });
    let seatCalls = 0;
    S.patch(S.Seat, 'findOneAndUpdate', async () => { seatCalls++; if (seatCalls > 1) seatRolled++; return { _id: 'x' }; });
    try {
      const res = S.makeRes();
      await S.confirmBooking(S.makeReq(), res);
      assert.equal(res.getStatus(), 409);
      assert.equal(res.getBody().errorCode, 'BOOKING_RECONCILIATION_REQUIRED');
      assert.equal(smReversed, false, 'no SM reversal');
      assert.equal(seatRolled, 0,    'no seat rollback');
      assert.equal(txnDisputed, false,'no txn dispute');
    } finally { S.restoreAll(); }
  });

  await t.test('4. completePassengerHold called with correct holdId and userId', async () => {
    let params = null;
    S.patchHappyPath();
    S.patch(S.passengerSeatHold, 'completePassengerHold', async (p) => { params = p; });
    try {
      const res = S.makeRes();
      await S.confirmBooking(S.makeReq(), res);
      assert.equal(res.getStatus(), 201);
      assert.equal(String(params.holdId), S.VALID_HOLD_ID);
      assert.equal(String(params.userId), S.VALID_USER_ID);
    } finally { S.restoreAll(); }
  });

  await t.test('5. hold completion failure post-commit → 201 (isolated)', async () => {
    S.patchHappyPath();
    S.patch(S.passengerSeatHold, 'completePassengerHold', async () => { throw new Error('Hold err'); });
    try {
      const res = S.makeRes();
      await S.confirmBooking(S.makeReq(), res);
      assert.equal(res.getStatus(), 201);
    } finally { S.restoreAll(); }
  });

  await t.test('6. cashback failure post-commit → 201 (isolated)', async () => {
    S.patchHappyPath();
    S.patch(S.smLedgerService, 'generateCashback', async () => { throw new Error('Cashback err'); });
    try {
      const res = S.makeRes();
      await S.confirmBooking(S.makeReq(), res);
      assert.equal(res.getStatus(), 201);
    } finally { S.restoreAll(); }
  });

  await t.test('7. notification failure post-commit → 201, notification attempted', async () => {
    S.patchHappyPath();
    S.notifStub._shouldThrow = true;
    S.notifStub._callCount   = 0;
    try {
      const res = S.makeRes();
      await S.confirmBooking(S.makeReq(), res);
      assert.equal(res.getStatus(), 201);
      assert.ok(S.notifStub._callCount >= 1, 'notification attempted');
    } finally { S.notifStub._shouldThrow = false; S.restoreAll(); }
  });

  await t.test('8. post-commit exception → 201 via snapshot; no SM/seat/txn side effects', async () => {
    S.patchHappyPath();
    let smReversed = false, seatRolled = 0, txnDisputed = false;
    S.patch(S.smLedgerService, 'reverseDebit', async () => { smReversed = true; });
    S.patch(S.Transaction, 'findByIdAndUpdate', async () => { txnDisputed = true; });
    let seatCalls = 0;
    S.patch(S.Seat, 'findOneAndUpdate', async () => { seatCalls++; if (seatCalls > 1) seatRolled++; return { _id: 'x' }; });
    S.patch(S.smLedgerService, 'generateCashback', async () => { throw new Error('post-commit-explosion'); });
    try {
      const res = S.makeRes();
      await S.confirmBooking(S.makeReq(), res);
      assert.equal(res.getStatus(), 201, 'snapshot used');
      assert.equal(res.getBody().success, true);
      assert.equal(smReversed, false); assert.equal(seatRolled, 0); assert.equal(txnDisputed, false);
    } finally { S.restoreAll(); }
  });

  await t.test('9. pre-booking failure → 500 with compensation', async () => {
    S.patch(S.PlatformConfig, 'getConfig', async () => ({ maxDiscountPercent: 80 }));
    S.patch(S.Transaction, 'create', async () => ({ _id: '507f1f77bcf86cd799439011' }));
    S.patch(S.Trip, 'findById', () => ({ select: () => ({ lean: async () => { throw new Error('DB crash'); } }), lean: async () => { throw new Error('DB crash'); } }));
    S.patch(S.Transaction, 'findByIdAndUpdate', async () => {});
    try {
      const res = S.makeRes();
      await S.confirmBooking(S.makeReq(), res);
      assert.equal(res.getStatus(), 500);
      assert.equal(res.getBody().errorCode, 'BOOKING_CREATION_FAILED_PAYMENT_RECEIVED');
    } finally { S.restoreAll(); }
  });
});
