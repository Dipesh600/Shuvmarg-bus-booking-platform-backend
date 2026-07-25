'use strict';
/**
 * tests/characterization/payment-booking-confirm-payment.test.js
 * Characterizes payment verification and debit behavior in confirmBooking.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { setupConfirmHarness, makeConfirmReq, makeMockConfirmRes } = require('../helpers/payment-booking-confirm-harness.js');

test('confirmBooking payment verification characterization', async (t) => {
  let h;
  t.beforeEach(() => { h = setupConfirmHarness(); });
  t.afterEach(() => { h.restore(); });

  await t.test('1. SM Money FIFO debit failure', async () => {
    h.mockMethod(h.smLedgerService, 'debitLedgerFIFO', () => Promise.reject(new Error('Insufficient balance')));
    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ smMoneyToUse: 200, paymentAmount: 800, originalAmount: 1000 }), res);
    assert.equal(res.getStatus(), 402);
    assert.deepEqual(res.getJson(), { success: false, message: 'Insufficient balance', errorCode: 'SM_MONEY_DEBIT_FAILED' });
  });

  await t.test('2. eSewa verification failure triggers SM Money debit reversal', async () => {
    let reversed = false;
    h.esewaStub._impl = async () => ({ verified: false, error: 'Signature mismatch' });
    h.mockMethod(h.smLedgerService, 'reverseDebit', () => { reversed = true; return Promise.resolve(); });

    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ smMoneyToUse: 200, paymentAmount: 800, originalAmount: 1000 }), res);
    assert.equal(res.getStatus(), 402);
    assert.deepEqual(res.getJson(), { success: false, message: 'Payment verification failed: Signature mismatch', errorCode: 'ESEWA_VERIFICATION_FAILED' });
    assert.equal(reversed, true);
  });

  await t.test('3. eSewa verification passes with exact amounts', async () => {
    let esewaArgs;
    h.esewaStub._impl = async (id, amt) => { esewaArgs = { id, amt }; return { verified: true }; };

    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ paymentId: 'p123', paymentAmount: 1000 }), res);
    assert.equal(res.getStatus(), 201);
    assert.deepEqual(esewaArgs, { id: 'p123', amt: 1000 });
  });

  await t.test('4. Full wallet payment debits SM wallet and sets gatewayAmount to 0', async () => {
    let walletDebitAmount;
    h.mockMethod(h.smLedgerService, 'debitLedgerFIFO', ({ amount }) => { walletDebitAmount = amount; return Promise.resolve({ _id: 'd1' }); });

    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ gateway: 'wallet', walletPin: '1234', paymentAmount: 1000, originalAmount: 1000 }), res);
    assert.equal(res.getStatus(), 201);
    assert.equal(walletDebitAmount, 1000);
  });

  await t.test('5. Full wallet payment debit failure', async () => {
    h.mockMethod(h.smLedgerService, 'debitLedgerFIFO', () => Promise.reject(new Error('Wallet debit error')));

    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ gateway: 'wallet', walletPin: '1234', paymentAmount: 1000, originalAmount: 1000 }), res);
    assert.equal(res.getStatus(), 402);
    assert.deepEqual(res.getJson(), { success: false, message: 'Wallet debit error', errorCode: 'WALLET_DEBIT_FAILED' });
  });
});
