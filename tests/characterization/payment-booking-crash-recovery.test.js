'use strict';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('../helpers/payment-callback-harness');
const Hold = require('../../models/seatHoldModel');
const Transaction = require('../../models/transactionModel');
const { preparePaymentRetry } = require('../../src/shared/prepare-payment-retry');
let data;
before(h.start); after(h.stop); beforeEach(async () => { data = await h.seed(); });
const request = () => data.request({ transactionUuid: 'CALLBACK-TEST' });
const retryReady = () => h.Attempt.updateOne({ _id: data.attempt._id }, { $set: { fulfillmentRetryAt: new Date(0) } });

test('crash after payment recording resumes one booking without another debit', async () => {
  data.state.failBeforeCommit = true;
  assert.equal((await request()).statusCode, 202);
  assert.equal((await Transaction.findOne()).status, 'PAYMENT_RECEIVED');
  assert.equal((await Hold.findById(data.hold._id)).status, 'processing');
  data.state.failBeforeCommit = false;
  assert.equal((await request()).statusCode, 202);
  assert.equal(data.state.bookings, 1);
  await retryReady();
  assert.equal((await request()).statusCode, 201);
  assert.equal(await h.fixture.Booking.countDocuments({}), 1);
  assert.equal(await Transaction.countDocuments({}), 1);
  assert.equal(await h.fixture.Ledger.countDocuments({ type: 'DEBIT' }), 1);
  assert.equal(await h.fixture.Ledger.countDocuments({ type: 'DEBIT_REVERSAL' }), 0);
});

test('lost response after commit returns the existing ticket without compensation', async () => {
  data.state.failAfterCommit = true;
  const result = await request();
  assert.equal(result.statusCode, 201);
  const replay = await request();
  assert.equal(String(result.body.data.bookingId), String(replay.body.data.bookingId));
  assert.equal(data.state.bookings, 1);
  assert.equal(await h.fixture.Ledger.countDocuments({ type: 'DEBIT_REVERSAL' }), 0);
});

test('exhausted recovery reserves an original-source refund and restores SM exactly once', async () => {
  data.state.failBeforeCommit = true;
  for (let i = 0; i < 3; i++) { await retryReady(); assert.equal((await request()).statusCode, 202); }
  await retryReady();
  assert.equal((await request()).statusCode, 409);
  const attempt = await h.Attempt.findById(data.attempt._id);
  const transaction = await Transaction.findOne();
  assert.equal(attempt.status, 'DISPUTED');
  assert.equal(attempt.refundDestination, 'original');
  assert.ok(attempt.refundRequiredAt);
  assert.equal(transaction.refundStatus, 'PENDING');
  assert.equal(transaction.meta.gatewayAmount, 960);
  assert.equal(transaction.meta.smMoneyUsed, 40);
  assert.equal((await Hold.findById(data.hold._id)).status, 'released');
  assert.equal((await h.fixture.ledgerService.computeSpendableBalance(data.userId)).display, 100);
  await request();
  assert.equal(await h.fixture.Ledger.countDocuments({ type: 'DEBIT_REVERSAL' }), 1);
  assert.equal(await h.fixture.Booking.countDocuments({}), 0);
});

test('expired hold cannot be revived by a verified late payment', async () => {
  await Hold.updateOne({ _id: data.hold._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await request()).statusCode, 409);
  assert.equal(data.state.bookings, 0);
  assert.equal((await h.Attempt.findById(data.attempt._id)).refundDestination, 'original');
});

test('stale worker cannot reset a hold owned by a newer payment worker', async () => {
  await h.Attempt.updateOne({ _id: data.attempt._id }, { $set: { status: 'VERIFYING',
    processingToken: 'new-owner', processingExpiresAt: new Date(Date.now() + 90000) } });
  await Hold.updateOne({ _id: data.hold._id }, { $set: { status: 'processing' } });
  await assert.rejects(preparePaymentRetry({ ...data.attempt.toObject(), processingToken: 'old-owner' }), { code: 'PAYMENT_LEASE_LOST' });
  assert.equal((await Hold.findById(data.hold._id)).status, 'processing');
});

test('provider uncertainty after an interrupted payment does not refund or issue a ticket', async () => {
  data.state.failBeforeCommit = true;
  await request();
  data.state.provider.status = 'PENDING';
  await retryReady();
  assert.equal((await request()).statusCode, 202);
  assert.equal(await h.fixture.Booking.countDocuments({}), 0);
  assert.equal(await h.fixture.Ledger.countDocuments({ type: 'DEBIT_REVERSAL' }), 0);
  assert.equal((await h.Attempt.findById(data.attempt._id)).refundRequiredAt, null);
});

test('only a verified full provider refund closes the refund and repeated checks never double-credit SM', async () => {
  const { confirmPaymentRefund } = require('../../services/paymentRefundRecovery');
  await Hold.updateOne({ _id: data.hold._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  await request();
  const attempt = await h.Attempt.findById(data.attempt._id);
  for (const status of ['PENDING', 'COMPLETE', 'PARTIAL_REFUND', 'NOT_FOUND']) {
    data.state.provider.status = status;
    assert.equal(await confirmPaymentRefund(attempt), false);
    assert.equal((await Transaction.findOne()).refundStatus, 'PENDING');
  }
  data.state.provider = { ...data.state.provider, status: 'FULL_REFUND', total_amount: '1.00' };
  assert.equal(await confirmPaymentRefund(attempt), false);
  data.state.provider.total_amount = '960.00';
  const results = await Promise.all(Array.from({ length: 5 }, () => confirmPaymentRefund(attempt)));
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal((await Transaction.findOne()).refundStatus, 'COMPLETED');
  assert.equal((await request()).body.errorCode, 'PAYMENT_CLOSED');
  assert.equal(await h.fixture.Ledger.countDocuments({ type: 'DEBIT_REVERSAL' }), 1);
  assert.equal((await h.fixture.ledgerService.computeSpendableBalance(data.userId)).display, 100);
});

test('refund enquiry rejects a merchant configuration change before calling the provider', async () => {
  const { confirmPaymentRefund } = require('../../services/paymentRefundRecovery');
  await assert.rejects(confirmPaymentRefund(data.attempt, {
    readConfig: () => ({ productCode: 'OTHER', paymentEnvironment: 'sandbox' }),
    verifyPayment: async () => { throw new Error('must not call provider'); },
  }), { code: 'ESEWA_CONFIGURATION_INVALID' });
});
