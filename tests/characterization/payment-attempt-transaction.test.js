'use strict';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const fixture = require('../helpers/security-cancellation-fixtures');
const Attempt = require('../../models/esewaPaymentAttemptModel');
const Transaction = require('../../models/transactionModel');
const { createAttemptTransaction } = require('../../src/shared/create-attempt-transaction');
let payload, ownership;
before(async () => { await fixture.start(); await Promise.all([Attempt.init(), Transaction.init()]); });
after(fixture.stop);
beforeEach(async () => {
  await Attempt.deleteMany({}); await Transaction.deleteMany({});
  payload = { userId: new mongoose.Types.ObjectId(), tripId: new mongoose.Types.ObjectId(), transactionId: 'attempt-txn',
    totalAmount: 100, originalAmount: 100, gateway: 'esewa', status: 'PAYMENT_RECEIVED', transactionType: 'BOOKING' };
  ownership = { attemptId: new mongoose.Types.ObjectId(), processingToken: 'current-worker' };
  await Attempt.collection.insertOne({ _id: ownership.attemptId, userId: payload.userId, transactionUuid: payload.transactionId,
    tempBookingId: 'txn-hold', finalAmount: 100, status: 'VERIFYING', processingToken: ownership.processingToken,
    processingExpiresAt: new Date(Date.now() + 60000) });
});
test('concurrent transaction creation for one attempt produces one record', async () => {
  const results = await Promise.all(Array.from({ length: 10 }, () => createAttemptTransaction(payload, ownership)));
  assert.equal(new Set(results.map(row => String(row._id))).size, 1);
  assert.equal(await Transaction.countDocuments({}), 1);
});
test('expired, superseded and closed attempts cannot create a transaction', async () => {
  await assert.rejects(() => createAttemptTransaction(payload, { ...ownership, processingToken: 'old-worker' }), /ownership/);
  await Attempt.updateOne({ _id: ownership.attemptId }, { $set: { processingExpiresAt: new Date(0) } });
  await assert.rejects(() => createAttemptTransaction(payload, ownership), /ownership/);
  await Attempt.updateOne({ _id: ownership.attemptId }, { $set: { status: 'FAILED', processingExpiresAt: new Date(Date.now() + 60000) } });
  await assert.rejects(() => createAttemptTransaction(payload, ownership), /ownership/);
  assert.equal(await Transaction.countDocuments({}), 0);
});
