'use strict';
/**
 * tests/characterization/payment-booking-confirm-wallet-without-pin.test.js
 * Characterizes wallet booking confirmation behavior after PIN removal.
 */
const test   = require('node:test');
const assert = require('node:assert/strict');
const { setupConfirmHarness, makeConfirmReq, makeMockConfirmRes } = require('../helpers/payment-booking-confirm-harness.js');

test('confirmBooking: wallet payment without PIN', async (t) => {
  let h;
  t.beforeEach(() => { h = setupConfirmHarness(); });
  t.afterEach(() => { h.restore(); });

  await t.test('1. wallet payment succeeds without walletPin', async () => {
    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ gateway: 'wallet', paymentAmount: 1000, originalAmount: 1000 }), res);
    assert.equal(res.getStatus(), 201);
    assert.equal(res.getJson().success, true);
  });

  await t.test('2. walletPin omitted entirely — proceeds to debit', async () => {
    let debitCalled = false;
    h.mockMethod(h.smLedgerService, 'debitLedgerFIFO', ({ amount }) => { debitCalled = true; return Promise.resolve({ _id: 'd1' }); });
    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ gateway: 'wallet', paymentAmount: 1000, originalAmount: 1000 }), res);
    assert.equal(res.getStatus(), 201);
    assert.equal(debitCalled, true);
  });

  await t.test('3. walletPin: null — proceeds to debit', async () => {
    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ gateway: 'wallet', walletPin: null, paymentAmount: 1000, originalAmount: 1000 }), res);
    assert.equal(res.getStatus(), 201);
  });

  await t.test('4. walletPin: invalid string — ignored, proceeds to debit', async () => {
    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ gateway: 'wallet', walletPin: 'bad-pin', paymentAmount: 1000, originalAmount: 1000 }), res);
    assert.equal(res.getStatus(), 201);
  });

  await t.test('5. wallet lookup uses authenticated req.dbUser._id', async () => {
    let capturedQuery = null;
    h.mockMethod(h.Wallet, 'findOne', (q) => { capturedQuery = q; return Promise.resolve({ status: 'active' }); });
    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ gateway: 'wallet', paymentAmount: 1000, originalAmount: 1000 }), res);
    assert.ok(capturedQuery, 'findOne was called');
    assert.equal(String(capturedQuery.userId), '507f1f77bcf86cd799439012');
  });

  await t.test('6. active wallet proceeds to debit', async () => {
    h.mockMethod(h.Wallet, 'findOne', () => Promise.resolve({ status: 'active' }));
    let debitAmount = null;
    h.mockMethod(h.smLedgerService, 'debitLedgerFIFO', ({ amount }) => { debitAmount = amount; return Promise.resolve({ _id: 'd1' }); });
    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ gateway: 'wallet', paymentAmount: 1000, originalAmount: 1000 }), res);
    assert.equal(res.getStatus(), 201);
    assert.equal(debitAmount, 1000);
  });

  await t.test('7. frozen wallet rejected before debit — zero side effects', async () => {
    h.mockMethod(h.Wallet, 'findOne', () => Promise.resolve({ status: 'frozen' }));
    let debitCalled = false, txnCalled = false, seatCalled = false, bookCalled = false;
    h.mockMethod(h.smLedgerService, 'debitLedgerFIFO', () => { debitCalled = true; return Promise.resolve({ _id: 'd1' }); });
    h.mockMethod(h.Transaction, 'create', () => { txnCalled = true; return Promise.resolve({}); });
    h.mockMethod(h.Seat, 'findOneAndUpdate', () => { seatCalled = true; return Promise.resolve({}); });
    h.mockMethod(h.Booking, 'create', () => { bookCalled = true; return Promise.resolve([]); });
    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ gateway: 'wallet', paymentAmount: 1000, originalAmount: 1000 }), res);
    assert.equal(res.getStatus(), 403);
    assert.deepEqual(res.getJson(), { success: false, message: 'Wallet is frozen. Please contact support.', errorCode: 'WALLET_FROZEN' });
    assert.equal(debitCalled, false, 'no debit');
    assert.equal(txnCalled, false, 'no txn');
    assert.equal(seatCalled, false, 'no seat lock');
    assert.equal(bookCalled, false, 'no booking');
  });

  await t.test('8. missing wallet rejected before debit — zero side effects', async () => {
    h.mockMethod(h.Wallet, 'findOne', () => Promise.resolve(null));
    let debitCalled = false, txnCalled = false, seatCalled = false, bookCalled = false;
    h.mockMethod(h.smLedgerService, 'debitLedgerFIFO', () => { debitCalled = true; return Promise.resolve({ _id: 'd1' }); });
    h.mockMethod(h.Transaction, 'create', () => { txnCalled = true; return Promise.resolve({}); });
    h.mockMethod(h.Seat, 'findOneAndUpdate', () => { seatCalled = true; return Promise.resolve({}); });
    h.mockMethod(h.Booking, 'create', () => { bookCalled = true; return Promise.resolve([]); });
    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ gateway: 'wallet', paymentAmount: 1000, originalAmount: 1000 }), res);
    assert.equal(res.getStatus(), 400);
    assert.deepEqual(res.getJson(), { success: false, message: 'Wallet is not available for this account.', errorCode: 'WALLET_NOT_AVAILABLE' });
    assert.equal(debitCalled, false, 'no debit');
    assert.equal(txnCalled, false, 'no txn');
    assert.equal(seatCalled, false, 'no seat lock');
    assert.equal(bookCalled, false, 'no booking');
  });

  await t.test('9. wallet debit failure preserved', async () => {
    h.mockMethod(h.Wallet, 'findOne', () => Promise.resolve({ status: 'active' }));
    h.mockMethod(h.smLedgerService, 'debitLedgerFIFO', () => Promise.reject(new Error('Wallet debit error')));
    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ gateway: 'wallet', paymentAmount: 1000, originalAmount: 1000 }), res);
    assert.equal(res.getStatus(), 402);
    assert.deepEqual(res.getJson(), { success: false, message: 'Wallet debit error', errorCode: 'WALLET_DEBIT_FAILED' });
  });

  await t.test('10. eSewa flow does not query Wallet', async () => {
    let walletQueried = false;
    h.mockMethod(h.Wallet, 'findOne', () => { walletQueried = true; return Promise.resolve(null); });
    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ gateway: 'esewa', paymentId: 'p1', paymentAmount: 1000, originalAmount: 1000 }), res);
    assert.equal(res.getStatus(), 201);
    assert.equal(walletQueried, false, 'Wallet not queried for eSewa');
  });
});
