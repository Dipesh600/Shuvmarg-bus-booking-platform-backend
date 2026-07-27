'use strict';

/**
 * tests/characterization/payment-booking-confirm-wallet-payment.test.js
 * Controller-level characterization tests for passenger wallet payment integration.
 */

const test   = require('node:test');
const assert = require('node:assert/strict');
const {
  setupConfirmHarness,
  makeConfirmReq,
  makeMockConfirmRes,
} = require('../helpers/payment-booking-confirm-harness.js');

test('confirmBooking: wallet payment module integration', async (t) => {
  let h;
  t.beforeEach(() => { h = setupConfirmHarness(); });
  t.afterEach(() => { h.restore(); });

  await t.test('1-5. wallet gateway passes authenticated userId, quote amount, bookingId null, and tempBookingId note to debit and stores debitEntryId in transaction metadata', async () => {
    let capturedDebitInput = null;
    let capturedTransaction = null;

    h.mockMethod(h.smLedgerService, 'debitLedgerFIFO', async (input) => {
      capturedDebitInput = input;
      return { _id: 'wallet-debit-123' };
    });

    h.mockMethod(h.Transaction, 'create', async (data) => {
      capturedTransaction = data;
      return { _id: 'txn-1', status: 'PAYMENT_RECEIVED' };
    });

    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ gateway: 'wallet', paymentAmount: 1000, originalAmount: 1000 }), res);

    assert.equal(res.getStatus(), 201);
    assert.ok(capturedDebitInput, 'debitLedgerFIFO was called');
    assert.equal(String(capturedDebitInput.userId), '507f1f77bcf86cd799439012');
    assert.equal(capturedDebitInput.amount, 1000);
    assert.equal(capturedDebitInput.bookingId, null);
    assert.equal(capturedDebitInput.note, 'SM Wallet full payment: Rs. 1000 (temp: BH1)');

    assert.ok(capturedTransaction, 'Transaction.create was called');
    assert.equal(capturedTransaction.meta.smDebitEntryId, 'wallet-debit-123');
  });

  await t.test('6-9. module failure returns exact status/body and prevents Txn/Seat/Booking creation', async () => {
    h.mockMethod(h.Wallet, 'findOne', () => Promise.resolve(null));
    let txnCalled = false, seatCalled = false, bookCalled = false;
    h.mockMethod(h.Transaction, 'create', () => { txnCalled = true; return Promise.resolve({}); });
    h.mockMethod(h.Seat, 'findOneAndUpdate', () => { seatCalled = true; return Promise.resolve({}); });
    h.mockMethod(h.Booking, 'create', () => { bookCalled = true; return Promise.resolve([]); });

    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ gateway: 'wallet', paymentAmount: 1000, originalAmount: 1000 }), res);

    assert.equal(res.getStatus(), 400);
    assert.deepEqual(res.getJson(), {
      success: false,
      message: 'Wallet is not available for this account.',
      errorCode: 'WALLET_NOT_AVAILABLE',
    });
    assert.equal(txnCalled, false, 'No transaction created on wallet module failure');
    assert.equal(seatCalled, false, 'No seat lock on wallet module failure');
    assert.equal(bookCalled, false, 'No booking created on wallet module failure');
  });

  await t.test('10. eSewa gateway does not query Wallet model', async () => {
    let walletQueried = false;
    h.mockMethod(h.Wallet, 'findOne', () => { walletQueried = true; return Promise.resolve(null); });

    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ gateway: 'esewa', paymentId: 'p1', paymentAmount: 1000, originalAmount: 1000 }), res);

    assert.equal(res.getStatus(), 201);
    assert.equal(walletQueried, false);
  });

  await t.test('11. split-payment eSewa flow still uses existing STEP 2 debit', async () => {
    let smDebited = false;
    h.mockMethod(h.smLedgerService, 'debitLedgerFIFO', () => { smDebited = true; return Promise.resolve({ _id: 'split-d1' }); });

    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({
      gateway: 'esewa',
      paymentId: 'p1',
      paymentAmount: 600,
      originalAmount: 1000,
      smMoneyToUse: 400,
    }), res);

    assert.equal(res.getStatus(), 201);
    assert.equal(smDebited, true);
  });

  await t.test('12. no wallet model dependency remains in controller', () => {
    const {
      readPassengerBookingConfirmationOrchestratorSource,
    } = require('../helpers/passenger-booking-confirmation-orchestrator-source');
    const ctrlSrc = readPassengerBookingConfirmationOrchestratorSource();
    assert.equal(ctrlSrc.includes('models/walletModel'), false);
    assert.equal(ctrlSrc.includes('Wallet.findOne'), false);
  });
});
