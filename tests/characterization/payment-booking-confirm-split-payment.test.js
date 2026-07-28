'use strict';

/**
 * tests/characterization/payment-booking-confirm-split-payment.test.js
 * Characterizes split-payment SM Money debit confirmation behavior.
 */

const test   = require('node:test');
const assert = require('node:assert/strict');
const { setupConfirmHarness, makeConfirmReq, makeMockConfirmRes } = require('../helpers/payment-booking-confirm-harness.js');

test('confirmBooking: split-payment SM Money debit', async (t) => {
  let h;
  t.beforeEach(() => { h = setupConfirmHarness(); });
  t.afterEach(() => { h.restore(); });

  await t.test('1. eSewa payment with smMoneyToUse > 0 calls debitLedgerFIFO and succeeds with 201', async () => {
    let debitCalled = false;
    let debitArgs = null;
    h.mockMethod(h.smLedgerService, 'debitLedgerFIFO', (args) => {
      debitCalled = true;
      debitArgs = args;
      return Promise.resolve({ _id: 'split_debit_100' });
    });

    const res = makeMockConfirmRes();
    const req = makeConfirmReq({
      gateway: 'esewa',
      paymentId: 'esewa_pay_1',
      paymentAmount: 800,
      originalAmount: 1000,
      smMoneyToUse: 200,
    });

    await h.confirmBooking(req, res);

    assert.equal(res.getStatus(), 201);
    assert.equal(res.getJson().success, true);
    assert.equal(debitCalled, true);
    assert.equal(debitArgs.amount, 200);
  });

  await t.test('2. internalMoneyDebitEntryId populated in Transaction and Booking', async () => {
    let createdTxnMeta = null;
    let createdBookingData = null;

    h.mockMethod(h.smLedgerService, 'debitLedgerFIFO', () => Promise.resolve({ _id: 'split_debit_200' }));
    h.mockMethod(h.Transaction, 'create', (data) => {
      createdTxnMeta = data.meta;
      return Promise.resolve({ _id: 'txn_123', status: 'PAYMENT_RECEIVED' });
    });
    h.mockMethod(h.Booking, 'create', (data) => {
      createdBookingData = data;
      return Promise.resolve([{ _id: 'b_123', ticketId: 'T1' }]);
    });

    const res = makeMockConfirmRes();
    const req = makeConfirmReq({
      gateway: 'esewa',
      paymentId: 'esewa_pay_2',
      paymentAmount: 700,
      originalAmount: 1000,
      smMoneyToUse: 300,
    });

    await h.confirmBooking(req, res);

    assert.equal(createdTxnMeta.smDebitEntryId, 'split_debit_200');
    assert.equal(createdBookingData.smDebitEntryId, 'split_debit_200');
  });

  await t.test('3. post-commit SMLedger.updateOne links split payment debit to booking', async () => {
    let linkedArgs = null;
    h.mockMethod(h.smLedgerService, 'debitLedgerFIFO', () => Promise.resolve({ _id: 'split_debit_300' }));
    h.mockMethod(h.SMLedger, 'updateOne', (filter, update) => {
      linkedArgs = { filter, update };
      return Promise.resolve();
    });

    const res = makeMockConfirmRes();
    const req = makeConfirmReq({
      gateway: 'esewa',
      paymentId: 'esewa_pay_3',
      paymentAmount: 850,
      originalAmount: 1000,
      smMoneyToUse: 150,
    });

    await h.confirmBooking(req, res);

    assert.ok(linkedArgs, 'SMLedger.updateOne was called');
    assert.equal(linkedArgs.filter._id, 'split_debit_300');
  });

  await t.test('4. paymentMethod is SM_WALLET_SPLIT when smMoneyToUse > 0 and gateway !== "wallet"', async () => {
    let createdBookingData = null;
    h.mockMethod(h.smLedgerService, 'debitLedgerFIFO', () => Promise.resolve({ _id: 'split_debit_400' }));
    h.mockMethod(h.Booking, 'create', (data) => {
      createdBookingData = data;
      return Promise.resolve([{ _id: 'b_124', ticketId: 'T2' }]);
    });

    const res = makeMockConfirmRes();
    const req = makeConfirmReq({
      gateway: 'esewa',
      paymentId: 'esewa_pay_4',
      paymentAmount: 950,
      originalAmount: 1000,
      smMoneyToUse: 50,
    });

    await h.confirmBooking(req, res);

    assert.equal(createdBookingData.paymentMethod, 'SM_WALLET_SPLIT');
  });

  await t.test('5. paymentMethod is ESEWA when smMoneyToUse is 0', async () => {
    let createdBookingData = null;
    h.mockMethod(h.Booking, 'create', (data) => {
      createdBookingData = data;
      return Promise.resolve([{ _id: 'b_125', ticketId: 'T3' }]);
    });

    const res = makeMockConfirmRes();
    const req = makeConfirmReq({
      gateway: 'esewa',
      paymentId: 'esewa_pay_5',
      paymentAmount: 1000,
      originalAmount: 1000,
      smMoneyToUse: 0,
    });

    await h.confirmBooking(req, res);

    assert.equal(createdBookingData.paymentMethod, 'ESEWA');
  });
});
