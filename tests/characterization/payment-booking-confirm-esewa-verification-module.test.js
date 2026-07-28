'use strict';

/**
 * tests/characterization/payment-booking-confirm-esewa-verification-module.test.js
 * Characterization tests for passenger eSewa verification module integration in confirmBooking.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { setupConfirmHarness, makeConfirmReq, makeMockConfirmRes } = require('../helpers/payment-booking-confirm-harness.js');

test('confirmBooking: eSewa verification module integration', async (t) => {
  let h;
  t.beforeEach(() => { h = setupConfirmHarness(); });
  t.afterEach(() => { h.restore(); });

  await t.test('1 & 2. wallet gateway does not call eSewa verification; valid eSewa calls verification once', async () => {
    let esewaCallCount = 0;
    h.esewaStub._impl = async () => { esewaCallCount++; return { verified: true }; };

    const resWallet = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ gateway: 'wallet', paymentAmount: 1000, originalAmount: 1000 }), resWallet);
    assert.equal(esewaCallCount, 0);

    const resEsewa = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ gateway: 'esewa', paymentId: 'esewa_p1', paymentAmount: 1000, originalAmount: 1000 }), resEsewa);
    assert.equal(esewaCallCount, 1);
  });

  await t.test('3, 4, 5. exact paymentId and quote-derived gatewayAmount reach service and continue to Txn', async () => {
    let esewaArgs = null;
    let txnCreated = false;
    h.esewaStub._impl = async (id, amt) => { esewaArgs = { id, amt }; return { verified: true }; };
    const origCreate = h.Transaction.create;
    h.mockMethod(h.Transaction, 'create', async (...args) => { txnCreated = true; return origCreate.call(h.Transaction, ...args); });

    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ gateway: 'esewa', paymentId: 'pid_999', smMoneyToUse: 200, paymentAmount: 800, originalAmount: 1000 }), res);

    assert.equal(res.getStatus(), 201);
    assert.deepEqual(esewaArgs, { id: 'pid_999', amt: 800 });
    assert.equal(txnCreated, true);
  });

  await t.test('6, 7, 8. missing paymentId returns status 400, ESEWA_PARAMS_MISSING and reverses split debit', async () => {
    let reversedSplitDebitId = null;
    h.mockMethod(h.smLedgerService, 'reverseDebit', (id) => { reversedSplitDebitId = id; return Promise.resolve(); });

    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ gateway: 'esewa', paymentId: null, smMoneyToUse: 200, paymentAmount: 800, originalAmount: 1000 }), res);

    assert.equal(res.getStatus(), 400);
    assert.deepEqual(res.getJson(), {
      success: false,
      message: 'Missing paymentId or paymentAmount for eSewa confirmation',
      errorCode: 'ESEWA_PARAMS_MISSING',
    });
    assert.equal(reversedSplitDebitId, 'debit-123');
  });

  await t.test('9, 10, 11, 12, 15. failed verification returns 402, ESEWA_VERIFICATION_FAILED, exact message, reverses split debit and prevents Txn', async () => {
    let reversedSplitDebitId = null;
    let txnCreated = false;
    h.esewaStub._impl = async () => ({ verified: false, error: 'Signature mismatch' });
    h.mockMethod(h.smLedgerService, 'reverseDebit', (id) => { reversedSplitDebitId = id; return Promise.resolve(); });
    h.mockMethod(h.Transaction, 'create', async () => { txnCreated = true; });

    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ gateway: 'esewa', paymentId: 'pid_1', smMoneyToUse: 300, paymentAmount: 700, originalAmount: 1000 }), res);

    assert.equal(res.getStatus(), 402);
    assert.deepEqual(res.getJson(), {
      success: false,
      message: 'Payment verification failed: Signature mismatch',
      errorCode: 'ESEWA_VERIFICATION_FAILED',
    });
    assert.equal(reversedSplitDebitId, 'debit-123');
    assert.equal(txnCreated, false);
  });

  await t.test('13. reversal failure does not replace the eSewa verification response', async () => {
    h.esewaStub._impl = async () => ({ verified: false, error: 'Payment expired' });
    h.mockMethod(h.smLedgerService, 'reverseDebit', () => Promise.reject(new Error('DB disconnect')));

    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ gateway: 'esewa', paymentId: 'pid_1', smMoneyToUse: 200, paymentAmount: 800, originalAmount: 1000 }), res);

    assert.equal(res.getStatus(), 402);
    assert.equal(res.getJson().errorCode, 'ESEWA_VERIFICATION_FAILED');
  });

  await t.test('14. verification exception reaches existing outer-catch behavior', async () => {
    h.esewaStub._impl = async () => { throw new Error('Network timeout'); };

    const res = makeMockConfirmRes();
    await h.confirmBooking(makeConfirmReq({ gateway: 'esewa', paymentId: 'pid_1', paymentAmount: 1000 }), res);

    assert.equal(res.getStatus(), 500);
    assert.equal(res.getJson().message, 'Internal Server Error during booking confirmation!');
  });
});
