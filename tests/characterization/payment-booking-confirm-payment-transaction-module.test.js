'use strict';

/**
 * tests/characterization/payment-booking-confirm-payment-transaction-module.test.js
 * Characterization tests for confirmBooking transaction creation integration.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { setupConfirmHarness, makeConfirmReq, makeMockConfirmRes } = require('../helpers/payment-booking-confirm-harness.js');

test('confirmBooking payment transaction creation characterization tests', async (t) => {

  await t.test('1-13 & 16-17. successful verification creates transaction with expected parameters, status, metadata and continues flow', async () => {
    const h = setupConfirmHarness();
    try {
      let createdPayload = null;
      let tripLookupCalled = false;
      let disputeUpdateCalled = false;

      h.mockMethod(h.PlatformConfig, 'getConfig', async () => ({ esewa: { feePercent: 1.5 } }));
      h.mockMethod(h.Transaction, 'create', async (payload) => {
        createdPayload = payload;
        return { _id: 'txn_e2e_100', ...payload };
      });
      h.mockMethod(h.Trip, 'findById', (id) => {
        tripLookupCalled = true;
        return { lean: async () => h.defaults.trip };
      });
      h.mockMethod(h.Transaction, 'findByIdAndUpdate', (id, update) => {
        if (update.status === 'DISPUTED') disputeUpdateCalled = true;
        return Promise.resolve();
      });

      const req = makeConfirmReq({ gateway: 'esewa', paymentId: 'esewa_txn_77', paymentAmount: 1000, originalAmount: 1000 });
      const res = makeMockConfirmRes();
      await h.confirmBooking(req, res);

      assert.equal(createdPayload !== null, true);
      assert.equal(createdPayload.userId, '507f1f77bcf86cd799439012');
      assert.equal(createdPayload.tripId, '507f1f77bcf86cd799439011');
      assert.deepEqual(createdPayload.seats, ['a1']);
      assert.equal(createdPayload.gateway, 'esewa');
      assert.equal(createdPayload.transactionId, 'esewa_txn_77');
      assert.equal(createdPayload.status, 'PAYMENT_RECEIVED');
      assert.equal(createdPayload.meta.gatewayFeeRate, 1.5);
      assert.equal(createdPayload.meta.paymentMethod, 'ESEWA');
      assert.equal(tripLookupCalled, true);
    } finally {
      h.restore();
    }
  });

  await t.test('7 & 9. wallet gateway maps to sm_wallet and generates sm_wallet_ transactionId prefix when paymentId missing', async () => {
    const h = setupConfirmHarness();
    try {
      let createdPayload = null;
      h.mockMethod(h.Wallet, 'findOne', async () => ({ status: 'active', balance: 2000 }));
      h.mockMethod(h.SMLedger, 'create', async () => [{ _id: 'ledger_entry_wallet_1' }]);
      h.mockMethod(h.Transaction, 'create', async (payload) => {
        createdPayload = payload;
        return { _id: 'txn_wallet_200', ...payload };
      });

      const req = makeConfirmReq({ gateway: 'wallet', paymentId: null, paymentAmount: 1000 });
      const res = makeMockConfirmRes();
      await h.confirmBooking(req, res);

      assert.equal(createdPayload.gateway, 'sm_wallet');
      assert.equal(createdPayload.transactionId.startsWith('sm_wallet_'), true);
      assert.equal(createdPayload.meta.paymentMethod, 'SM_WALLET');
      assert.equal(createdPayload.meta.smDebitEntryId, 'debit-123');
    } finally {
      h.restore();
    }
  });

  await t.test('14 & 15. transaction creation error propagates to outer catch (500) and halts trip lookup', async () => {
    const h = setupConfirmHarness();
    try {
      let tripLookupCalled = false;
      h.mockMethod(h.Transaction, 'create', async () => {
        throw new Error('Database transaction creation failure');
      });
      h.mockMethod(h.Trip, 'findById', () => {
        tripLookupCalled = true;
        return { lean: async () => h.defaults.trip };
      });

      const req = makeConfirmReq();
      const res = makeMockConfirmRes();
      await h.confirmBooking(req, res);

      assert.equal(res.getStatus(), 500);
      assert.equal(res.getJson().success, false);
      assert.equal(tripLookupCalled, false);
    } finally {
      h.restore();
    }
  });
});
